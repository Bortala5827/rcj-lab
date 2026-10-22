// rcj-lab · 统一后台数据聚合
// GET /api/admin/data  (需登录：签名 cookie 或 ?password=)
// 服务端用 D1 原生绑定（env.DB / env.FACETALK_DB）读取各库，聚合后返回 JSON。
// 绑定由 Pages 平台托管凭证，无需 API Token。
//
// v3: 加 60s 内存缓存(避免每次 15 并发 D1 查询) + 合并 SQL(15→10) + 整体超时
// v4: 2026-10-21 REST+token → 原生 D1 绑定（DBS 值改为绑定名）

const DBS = {
  facetalk: 'FACETALK_DB',  // mianshi-dazi-d1 (FaceTalk)
  analytics: 'DB',          // rcj-analytics-d1 (统一浏览统计)
};

// ── 服务端内存缓存（60s TTL，单 Worker 隔离足够用）──
let _cache = null;
let _cacheAt = 0;
const CACHE_TTL = 60_000; // 60 秒

function getCached() {
  if (_cache && (Date.now() - _cacheAt) < CACHE_TTL) return _cache;
  return null;
}
function setCached(val) { _cache = val; _cacheAt = Date.now(); }

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function hmac(value, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  const b = new Uint8Array(buf);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}
function getCookie(req, name) {
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
async function verifyAuth(request, env) {
  const cookie = getCookie(request, 'rcj_admin');
  if (cookie && env.ADMIN_PASSWORD) {
    const [ts, sig] = cookie.split('.');
    if (!ts || !sig) return false;
    // 时间戳为毫秒（login.js 用 Date.now()），与 login.js Max-Age 对齐：1 天内有效
    if (Date.now() - Number(ts) > 24 * 60 * 60 * 1000) return false;
    if ((await hmac(ts, env.ADMIN_PASSWORD)) === sig) return true;
  }
  return false; // 不再支持 ?password= URL 明文参数（安全漏洞，旧链接一律要求 cookie）
}

async function d1(env, dbId, sql, ms = 6000) {
  const binding = env[dbId];
  if (!binding) throw new Error('D1 绑定缺失: ' + dbId);
  const r = await binding.prepare(sql).all();
  return r.results;
}

export async function onRequestGet({ request, env }) {
  if (!(await verifyAuth(request, env))) return json({ error: '未登录' }, 401);
  if (!env.DB || !env.FACETALK_DB) {
    return json({ error: 'D1 绑定缺失（DB / FACETALK_DB）。请在 rcj-lab Pages → Settings → Bindings 添加 D1 绑定。' }, 500);
  }

  // ── 缓存命中直接返回（?nocache=1 强制绕过，用于操作后即时刷新）──
  const url = new URL(request.url);
  const nocache = url.searchParams.get('nocache') === '1';
  const hit = (!nocache) && getCached();
  if (hit) {
    const body = JSON.parse(hit); // 浅拷贝避免污染
    body.generatedAt = new Date().toISOString(); // 更新时间戳
    body.cached = true;
    return json(body);
  }

  try {
    // ── 合并后 9 个并发查询 ──
    const results = await Promise.allSettled([
      // [0] facetalk: pairs 状态 + 近 6 条（合并为一次，前端再分）
      d1(env, DBS.facetalk, "SELECT status, COUNT(*) c FROM pairs GROUP BY status"),
      // [1] facetank: 全部计数合并（intents / applications / wall / reports / ratings / messages）
      d1(env, DBS.facetalk, "SELECT 'intents' AS k, COUNT(*) c FROM intents UNION ALL SELECT 'applications', COUNT(*) FROM applications UNION ALL SELECT 'wall', COUNT(*) FROM wall UNION ALL SELECT 'reports', COUNT(*) FROM reports UNION ALL SELECT 'ratings', COUNT(*) FROM ratings UNION ALL SELECT 'messages', COUNT(*) FROM messages"),
      // [2] facetalk: 近期 pairs
      d1(env, DBS.facetalk, "SELECT a, b, mode, status, created FROM pairs ORDER BY created DESC LIMIT 6"),
      // [3] facetalk: 近期 wall（含 id/ip 便于后台区分来源与删除，放宽到 200 条供留言管理面板）
      d1(env, DBS.facetalk, "SELECT id, name, text, created_at, COALESCE(ip,'') AS ip FROM wall ORDER BY created_at DESC LIMIT 200"),
      // [4] 订单/报名提醒（PayPal 收款 + 0元购报名，表 orders 由支付/报名接口首次写入时自动建）
      d1(env, DBS.analytics, "SELECT id, source, item, payer_email, contact_email, amount, full_price, balance, cny_amount, currency, paypal_order_id, status, note, created FROM orders ORDER BY created DESC LIMIT 50"),
      // [5] 辅警库已删除（2026-08-17 并入 exam 后下线），停止对其 D1 的查询；
      //         辅警站点浏览统计仍由 rcj-analytics-d1 的 site='aux' 承接（见下方 auxUni）。
      Promise.resolve(null),
      // [6] analytics: 趋势 + 汇总（合并为一次——按 site 聚合 day + total/u/d 一起算）
      d1(env, DBS.analytics, "SELECT site, day, SUM(n) s, 0 as total, 0 as u, 0 as d FROM visits GROUP BY site, day UNION ALL SELECT site, '' as day, SUM(n) as s, SUM(n) as total, COUNT(DISTINCT ip) as u, COUNT(DISTINCT day) as d FROM visits GROUP BY site ORDER BY site, day"),
      // [7] analytics: 最近 7 天访问明细（site/day/ip/n，供概览「最近访问」表）
      d1(env, DBS.analytics, "SELECT site, day, ip, n FROM visits WHERE day >= date('now','-6 day') ORDER BY day DESC, site, n DESC LIMIT 60"),
      // [8] ai_calls: AI 调用聚合（按项目/provider/日期，表由 ai-track.js 首次调用时自动建）
      d1(env, DBS.analytics, "SELECT 'by_project' as k, project as dim1, status as dim2, COUNT(*) c FROM ai_calls GROUP BY project, status UNION ALL SELECT 'by_provider', provider, status, COUNT(*) FROM ai_calls GROUP BY provider, status UNION ALL SELECT 'by_day', day, status, COUNT(*) FROM ai_calls WHERE day >= date('now','-13 day') GROUP BY day, status"),
    ]);

    const v = (i) => results[i].status === 'fulfilled' ? results[i].value : null;
    const warns = [];
    results.forEach((r, i) => { if (r.status === 'rejected') warns.push(`查询#${i} 失败: ${r.reason.message}`); });

    const ftPairs      = v(0);
    const ftCountsRaw  = v(1); // [{k,c}, ...]
    const ftPairsRecent= v(2);
    const ftWallRecent = v(3);
    const uniAll       = v(6); // 合并的趋势+汇总
    const recentVisits = v(7) || []; // 最近 7 天访问明细
    const aiRaw        = v(8) || []; // AI 调用聚合（表不存在时为空）

    // ── 解析 AI 调用聚合 ──
    const aiByProject = {}, aiByProvider = {}, aiByDay = {};
    let aiTotal = 0, aiOk = 0;
    (aiRaw || []).forEach(r => {
      const c = Number(r.c) || 0;
      const bucket = r.k === 'by_project' ? aiByProject : r.k === 'by_provider' ? aiByProvider : r.k === 'by_day' ? aiByDay : null;
      if (!bucket) return;
      const key = r.dim1 || 'unknown';
      if (!bucket[key]) bucket[key] = { total: 0, ok: 0, fail: 0 };
      bucket[key].total += c;
      if (r.dim2 === 'ok') bucket[key].ok += c; else bucket[key].fail += c;
      if (r.k === 'by_project') { aiTotal += c; if (r.dim2 === 'ok') aiOk += c; }
    });

    // ── 解析 facetalk 计数 ──
    const ftCounts = {};
    (ftCountsRaw || []).forEach(r => { ftCounts[r.k] = (r.c || 0); });

    // ── 统一浏览统计：从合并结果拆分趋势和汇总 ──
    const bySite = {};
    const totalsMap = {};
    (uniAll || []).forEach(r => {
      if (!bySite[r.site]) bySite[r.site] = { points: [], total: 0, u: 0, d: 0 };
      if (r.day) {
        bySite[r.site].points.push({ day: r.day, s: Number(r.s) || 0 });
      } else {
        // 汇总行：day=''
        bySite[r.site].total = Number(r.total) || 0;
        bySite[r.site].u = Number(r.u) || 0;
        bySite[r.site].d = Number(r.d) || 0;
      }
    });
    const analyticsSeries = Object.keys(bySite).map(site => ({
      site,
      // 保留最近 31 个有数据日，前端可切换 7/14/30 天视图
      points: (bySite[site].points || []).slice(-31),
      total: bySite[site].total || 0,
      u: bySite[site].u || 0,
      d: bySite[site].d || 0,
    }));
    const allVisits = analyticsSeries.reduce((a, s) => a + s.total, 0);

    const pairs = {};
    (ftPairs || []).forEach(r => pairs[r.status] = r.c);

    // 辅警面板兼容：从统一库取 aux 站点数据
    const auxUni = bySite['aux'] || {};
    const auxVisits = { s: auxUni.total || 0, u: auxUni.u || 0, d: auxUni.d || 0 };
    const auxVisitTrend = (auxUni.points || []).slice().reverse();

    const payload = {
      ok: true,
      generatedAt: new Date().toISOString(),
      facetalk: {
        pairsTotal: Object.values(pairs).reduce((a, b) => a + b, 0),
        pairsByStatus: pairs,
        intents: ftCounts.intents || 0,
        applications: ftCounts.applications || 0,
        wall: ftCounts.wall || 0,
        reports: ftCounts.reports || 0,
        ratings: ftCounts.ratings || 0,
        messages: ftCounts.messages || 0,
        recentPairs: ftPairsRecent || [],
        recentWall: ftWallRecent || [],
      },
      aux: {
        visits: auxVisits,
        visitTrend: auxVisitTrend,
        // 运营里程碑：线下业务数据（非系统自动统计），由运营维护。
        // 来源：用户口述 —— 深圳辅警题库跑通售出 20+ 份，惠州辅警规划中。
        milestones: [
          { label: '深圳辅警题库', desc: '笔试 / 面试 / 体测一体化，已跑通售出 20+ 份', tag: '跑通', tone: 'ok' },
        ],
        // 辅警站点只接入浏览统计（rcj-analytics-d1 · site='aux'）。
        // 留言墙 / 信号匹配是 FaceTalk（mianshi-dazi-d1）专属功能，辅警从未开通，故不含 wallTotal/signalMatch 字段。
        note: '辅警站点仅接入浏览统计（rcj-analytics-d1 · site=aux）；留言墙与信号匹配为 FaceTalk 专属功能，辅警未开通，故无互动数据。',
      },
      analytics: { allVisits, series: analyticsSeries, bySite },
      ai: {
        total: aiTotal,
        ok: aiOk,
        fail: aiTotal - aiOk,
        successRate: aiTotal ? Math.round(aiOk / aiTotal * 100) : 0,
        byProject: aiByProject,
        byProvider: aiByProvider,
        byDay: aiByDay,
      },
      recentVisits,
      orders: v(4) || [],
      note: '数据源：mianshi-dazi-d1（FaceTalk 互动数据）+ rcj-analytics-d1（统一浏览统计，含 site=aux 辅警站点）。aux-police-exam-d1 已于 2026-08-17 并入 exam 后删除。',
      warns: warns.length ? warns : undefined,
    };

    // 写缓存
    setCached(JSON.stringify(payload));

    return json(payload);
  } catch (e) {
    return json({ error: '聚合失败：' + e.message }, 500);
  }
}
