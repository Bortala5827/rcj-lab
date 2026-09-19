// rcj-lab · Sing to Me（0元购）端点
// 玩法：用户在 shop 页为我唱一首歌（录音）→ 我（管理员）送她资料。
// 链路：shop 录音 + 选档位(0/9.9/39/69) + 选资料 + 邮箱
//       → POST /api/sing（语音存 R2 rcj-sing，元数据存 rcj-analytics-d1.sing_requests）
//       → 主后台 955827.xyz/admin 审核（站点状态卡片深链）→ 通过/拒绝/已发
//       → 管理员用自己 Google 邮箱手动把资料发给用户
// 数据清除：clean 清除 30 天前已处理记录 + 删对应 R2 语音（亦可接 cron 自动）
//
// POST /api/sing                 公共提交 {email,tier,materials[],audio(base64),audioType}
// GET  /api/sing?list=1[&only=pending]  需登录，列出
// POST /api/sing?id=<id>&action=approve|reject|sent  需登录（reject 会自动删 R2 语音）
// GET  /api/sing?clean=1         需登录，清除 30 天前已处理 + 删 R2
//
// 播放语音 GET /api/sing/audio/<id> 由独立路由处理：functions/api/sing/audio/[id].js
//   Pages Functions 按文件路径路由，sing.js 匹配不到该子路径（会回退到静态首页）。

import { cors, json, verifyAuth } from './sing/_auth.js';

const ANALYTICS_DB = 'b3198ef2-6e7c-424e-8a0f-a7b21afc1828'; // rcj-analytics-d1
const DAY = 24 * 60 * 60 * 1000;
const TIERS = ['0', '9.9', '39', '69'];
const MATERIALS = ['anki', 'app', 'offline', 'ndd', 'jgh', 'fj', 'xf'];
const MAX_AUDIO = 6 * 1024 * 1024; // 6MB 上限，防滥用

async function d1(env, sql) {
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) return { error: 'NO_CRED' };
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/d1/database/${ANALYTICS_DB}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  const j = await r.json();
  if (!j.success) return { error: (j.errors && j.errors[0] && j.errors[0].message) || 'D1_FAIL' };
  return j.result || [];
}
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors() });
}

// 通知站长（邮件 + Telegram）。返回失败原因数组（空=全部成功），不再静默吞错
async function notifyOwnerAndTg(env, email) {
  const errs = [];
  if (env.RESEND_API_KEY) {
    try {
      const t = new Date(Date.now() + 8 * 3600 * 1000);
      const p = n => String(n).padStart(2, '0');
      const bt = `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          from: 'RCJ 商店 <noreply@955827.xyz>', to: ['1430115702@qq.com'],
          subject: '【RCJ 0元购】有人来唱歌啦',
          html: `<p>时间（北京）：${bt}</p><p>邮箱：${email}</p><p>档位：0元购 · Sing to Me</p><p>去 955827.xyz/admin → 订单提醒 审核语音。</p>`,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { const m = d.message || ('HTTP ' + r.status); errs.push('email:' + m); console.error('[sing] Resend 发送失败', r.status, d); }
    } catch (e) { errs.push('email:' + e.message); console.error('[sing] Resend 异常', e); }
  } else { errs.push('email:RESEND_API_KEY未配置'); }

  const tgToken = env.TG_BOT_TOKEN, tgChat = env.TG_CHAT_ID;
  if (tgToken && tgChat) {
    try {
      const t2 = new Date(Date.now() + 8 * 3600 * 1000);
      const p2 = n => String(n).padStart(2, '0');
      const bt2 = `${t2.getUTCFullYear()}-${p2(t2.getUTCMonth() + 1)}-${p2(t2.getUTCDate())} ${p2(t2.getUTCHours())}:${p2(t2.getUTCMinutes())}`;
      const r = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ chat_id: tgChat, text: `【RCJ 0元购】有人来唱歌啦 🎤\n🕒 ${bt2}\n邮箱：${email}\n档位：0元购 · Sing to Me\n去 955827.xyz/admin → 订单提醒 审核语音。`, parse_mode: 'HTML' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { const m = d.description || ('HTTP ' + r.status); errs.push('tg:' + m); console.error('[sing] Telegram 发送失败', r.status, d); }
    } catch (e) { errs.push('tg:' + e.message); console.error('[sing] Telegram 异常', e); }
  }
  return errs;
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);

  // ── 公共提交 ──
  if (request.method === 'POST' && !url.searchParams.get('id') && !url.searchParams.get('list') && !url.searchParams.get('clean')) {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: 'JSON 格式错误' }, 400); }
    const email = String(body.email || '').trim().slice(0, 120);
    const tier = String(body.tier || '').trim();
    const materials = Array.isArray(body.materials) ? body.materials.map(x => String(x)).filter(x => MATERIALS.includes(x)).slice(0, 10) : [];
    const audio = String(body.audio || '');
    const audioType = String(body.audioType || 'webm').slice(0, 10);
    if (!TIERS.includes(tier)) return json({ ok: false, error: '档位无效' }, 400);
    // 用户侧不再选择具体资料，materials 改为可选
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: '邮箱格式不对' }, 400);
    if (!audio) return json({ ok: false, error: '没收到录音，先唱一首吧 🎤' }, 400);
    // base64 → bytes
    let bytes;
    try {
      const bin = atob(audio.indexOf(',') >= 0 ? audio.split(',')[1] : audio);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      bytes = arr;
    } catch { return json({ ok: false, error: '录音数据损坏' }, 400); }
    if (bytes.length > MAX_AUDIO) return json({ ok: false, error: '录音太大啦（≤6MB）' }, 400);

    const ip = (request.headers.get('CF-Connecting-IP') || '0.0.0.0').replace(/'/g, "''");
    const id = 'sg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const now = Date.now();

    // 限流1：同 IP 最多 3 条待审核
    const wait = await d1(env, `SELECT COUNT(*) c FROM sing_requests WHERE ip='${ip}' AND status='pending'`);
    if (wait && !wait.error && (wait[0] && wait[0].c || 0) >= 3) return json({ ok: false, error: '待审核太多啦，先等等前面处理完' }, 429);
    // 限流2：同 IP 24 小时内最多报名 2 次（0元购防刷）
    const r24 = await d1(env, `SELECT COUNT(*) c FROM sing_requests WHERE ip='${ip}' AND created > ${Date.now() - DAY}`);
    if (r24 && !r24.error && (r24[0] && r24[0].c || 0) >= 2) return json({ ok: false, error: '同一网络 24 小时内限报名 2 次，换时间再来试试' }, 429);

    const r = await d1(env, `CREATE TABLE IF NOT EXISTS sing_requests (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, tier TEXT NOT NULL DEFAULT '0',
      materials TEXT DEFAULT '[]', audio_key TEXT DEFAULT '', status TEXT DEFAULT 'pending',
      created INTEGER NOT NULL, decided_at INTEGER DEFAULT 0, ip TEXT DEFAULT ''
    )`);
    if (r && r.error) return json({ ok: false, error: '建表失败' }, 500);
    // 幂等补列：notify_err（通知失败原因，便于后台排查）
    {
      const pr = await d1(env, 'SELECT notify_err FROM sing_requests LIMIT 0');
      if (pr && pr.error && /no such column/i.test(pr.error)) {
        await d1(env, "ALTER TABLE sing_requests ADD COLUMN notify_err TEXT DEFAULT ''");
      }
    }

    // 语音存 R2
    let audioKey = '';
    if (env.SING_R2) {
      try {
        await env.SING_R2.put(id + '.webm', bytes, { httpMetadata: { contentType: 'audio/webm' } });
        audioKey = id + '.webm';
      } catch (e) { return json({ ok: false, error: '语音存储失败：' + e.message }, 500); }
    } else {
      return json({ ok: false, error: '语音存储暂不可用（R2 未绑定）' }, 500);
    }

    const ins = await d1(env, `INSERT INTO sing_requests (id, email, tier, materials, audio_key, status, created, ip) VALUES ('${id}','${email.replace(/'/g, "''")}','${tier}','${JSON.stringify(materials).replace(/'/g, "''")}','${audioKey}','pending',${now},'${ip}')`);
    if (ins && ins.error) return json({ ok: false, error: '存储失败' }, 500);

    // 0元购报名 → 记 orders 表 + 通知站长（提醒我）
    try {
      await d1(env, `CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY, source TEXT, item TEXT, sku TEXT,
        payer_email TEXT, contact_email TEXT, amount REAL, currency TEXT,
        full_price REAL, balance REAL, cny_amount REAL, paypal_order_id TEXT, status TEXT, note TEXT, created INTEGER
      )`);
      // 幂等迁移：老表缺列则补齐
      const probe = await d1(env, 'SELECT full_price FROM orders LIMIT 0');
      if (probe && probe.error && /no such column/i.test(probe.error)) {
        await d1(env, 'ALTER TABLE orders ADD COLUMN full_price REAL');
        await d1(env, 'ALTER TABLE orders ADD COLUMN balance REAL');
      }
      const probe2 = await d1(env, 'SELECT cny_amount FROM orders LIMIT 0');
      if (probe2 && probe2.error && /no such column/i.test(probe2.error)) {
        await d1(env, 'ALTER TABLE orders ADD COLUMN cny_amount REAL');
      }
      await d1(env, `INSERT OR REPLACE INTO orders (id, source, item, sku, payer_email, contact_email, amount, currency, cny_amount, paypal_order_id, status, note, created) VALUES ('${id}','sing','Sing to Me','sing','${email.replace(/'/g, "''")}','',0,'CNY',0,'','enrolled','0元购报名',${now})`);
      // 通知站长：逐路记录成败，失败写回 notify_err（不再静默吞掉）
      const errs = await notifyOwnerAndTg(env, email);
      if (errs.length) {
        const msg = errs.join('; ').replace(/'/g, "''");
        await d1(env, `UPDATE sing_requests SET notify_err='${msg}' WHERE id='${id}'`);
        console.warn('[sing] 通知未完成送达:', msg);
      }
    } catch (e) { /* 通知失败不影响报名成功 */ }

    return json({ ok: true, id, msg: '收到啦！我会听你唱的歌，然后给你送资料 🎁' });
  }

  // ── 后台操作（需登录）──
  if (request.method === 'GET' || request.method === 'POST') {
    if (!(await verifyAuth(request, env))) return json({ ok: false, error: '未登录' }, 401);

    // 列表
    if (request.method === 'GET' && url.searchParams.get('list')) {
      const onlyPending = url.searchParams.get('only') === 'pending';
      const sql = `SELECT id, email, tier, materials, audio_key, status, created, decided_at FROM sing_requests ${onlyPending ? "WHERE status='pending'" : ''} ORDER BY created DESC LIMIT 200`;
      const r = await d1(env, sql);
      if (r && r.error) return json({ ok: false, error: r.error }, 500);
      const rows = (r && r[0] && r[0].results) || [];
      return json({ ok: true, list: rows.map(x => ({
        id: x.id, email: x.email, tier: x.tier, materials: (x.materials || '[]'),
        status: x.status, created: Number(x.created), decidedAt: Number(x.decided_at), audioKey: x.audio_key || '',
        notifyErr: (x.notify_err || ''),
      })) });
    }
    // 审核操作
    if (request.method === 'POST' && url.searchParams.get('id')) {
      const id = String(url.searchParams.get('id') || '').replace(/'/g, "''");
      const action = String(url.searchParams.get('action') || '').trim();
      const now = Date.now();
      if (action === 'approve') { const r = await d1(env, `UPDATE sing_requests SET status='approved', decided_at=${now} WHERE id='${id}'`); if (r && r.error) return json({ ok: false, error: r.error }, 500); return json({ ok: true, status: 'approved' }); }
      if (action === 'reject') {
        // 不满意 → 自动清除语音：立即删 R2 音频，记录留档（清空 audio_key）以防刷
        // 无需等 30 天手动清理，拒绝即释放存储
        let r2Deleted = false;
        try {
          const rows = await d1(env, `SELECT audio_key FROM sing_requests WHERE id='${id}'`);
          const rr = rows && rows[0] && rows[0].results;
          const ak = rr && rr[0] && rr[0].audio_key;
          if (ak && env.SING_R2) { await env.SING_R2.delete(ak); r2Deleted = true; }
        } catch (e) { /* 删音频失败不阻断状态更新 */ }
        const r = await d1(env, `UPDATE sing_requests SET status='rejected', decided_at=${now}, audio_key='' WHERE id='${id}'`);
        if (r && r.error) return json({ ok: false, error: r.error }, 500);
        return json({ ok: true, status: 'rejected', r2Deleted });
      }
      if (action === 'sent') { const r = await d1(env, `UPDATE sing_requests SET status='sent', decided_at=${now} WHERE id='${id}'`); if (r && r.error) return json({ ok: false, error: r.error }, 500); return json({ ok: true, status: 'sent' }); }
      return json({ ok: false, error: '未知操作' }, 400);
    }
    // 清理 30 天前已处理 + 删 R2
    if (request.method === 'GET' && url.searchParams.get('clean')) {
      const cutoff = Date.now() - 30 * DAY;
      const r = await d1(env, `SELECT id, audio_key FROM sing_requests WHERE status<>'pending' AND decided_at>0 AND decided_at<${cutoff}`);
      if (r && r.error) return json({ ok: false, error: r.error }, 500);
      const rows = (r && r[0] && r[0].results) || [];
      let delR2 = 0;
      if (env.SING_R2) { for (const x of rows) { if (x.audio_key) { try { await env.SING_R2.delete(x.audio_key); delR2++; } catch {} } } }
      const d = await d1(env, `DELETE FROM sing_requests WHERE status<>'pending' AND decided_at>0 AND decided_at<${cutoff}`);
      const n = (d && d[0] && d[0].meta && d[0].meta.changes) || 0;
      return json({ ok: true, cleaned: n, r2Deleted: delR2 });
    }
  }
  return json({ ok: false, error: 'method' }, 405);
}
