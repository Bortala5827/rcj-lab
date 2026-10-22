// 留言管理端点（FaceTalk wall 表，存在 mianshi-dazi-d1）
// 鉴权：后台登录 cookie（rcj_admin，HMAC-SHA256）或明文 ADMIN_KEY 任一通过
// 用法：
//   GET  /api/admin/wall?del=<id>       删除单条
//   GET  /api/admin/wall?delIp=<ip>     删除该 IP 的全部留言
//   POST /api/admin/wall  body: {del:<id>} | {delIp:<ip>}
const FACETALK_DB = 'FACETALK_DB'; // mianshi-dazi-d1 原生绑定（2026-10-21 修复：原硬编码 UUID 为占位假值，改用绑定）

// HMAC-SHA256 → base64（与 login.js / health.js / data.js 保持一致；
// 历史曾用 hex 验签，导致 login 写 base64 cookie 后这两个接口 401，已统一为 base64）
function hmac(key, msg) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then(kh => crypto.subtle.sign('HMAC', kh, enc.encode(msg)))
    .then(buf => {
      const b = new Uint8Array(buf);
      let s = '';
      for (const x of b) s += String.fromCharCode(x);
      return btoa(s);
    });
}
function getCookie(req, name) {
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
async function verifyCookie(request, env) {
  const pw = env.ADMIN_PASSWORD || env.ADMIN_KEY || '';
  if (!pw) return false;
  const cookie = getCookie(request, 'rcj_admin');
  if (!cookie) return false;
  const [ts, sig] = cookie.split('.');
  if (!ts || !sig) return false;
  if (Date.now() - Number(ts) > 24 * 60 * 60 * 1000) return false; // 1 天过期（毫秒，与 login.js Max-Age 对齐）
  return (await hmac(ts, pw)) === sig; // 与 login.js 签发参数顺序一致：hmac(payload时间戳, ADMIN_PASSWORD)
}

function adminOk(request, env) {
  const url = new URL(request.url);
  const key = url.searchParams.get('admin') || '';
  const envKey = String(env.ADMIN_KEY || '').trim();
  const byKey = !!envKey && String(key).trim() === envKey;
  return byKey; // cookie 校验异步，外部 await verifyCookie 合并
}

function d1(env, dbId, sql) {
  const binding = env[dbId];
  if (!binding) return Promise.resolve({ error: 'D1 绑定缺失' });
  return binding.prepare(sql).run()
    .then(r => ({ meta: r.meta }))
    .catch(e => ({ error: e.message }));
}

function json(o, status) {
  return new Response(JSON.stringify(o), { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

function bad(msg, status) { return json({ ok: false, error: msg }, status || 400); }

export async function onRequest(context) {
  const { request, env } = context;
  // 鉴权：cookie 或明文 key
  const cookieOk = await verifyCookie(request, env);
  const keyOk = adminOk(request, env);
  if (!cookieOk && !keyOk) return bad('未授权（请先登录后台）', 401);

  const url = new URL(request.url);
  let delId = url.searchParams.get('del');
  let delIp = url.searchParams.get('delIp');
  if (request.method === 'POST') {
    try {
      const b = await request.json().catch(() => ({}));
      if (b.del) delId = b.del;
      if (b.delIp) delIp = b.delIp;
    } catch (e) {}
  }

  if (!delId && !delIp) {
    return bad('缺少参数：del=<id> 或 delIp=<ip>', 400);
  }

  try {
    let sql;
    let label;
    if (delId) {
      sql = `DELETE FROM wall WHERE id='${String(delId).replace(/'/g, "''")}'`;
      label = `id=${delId}`;
    } else {
      sql = `DELETE FROM wall WHERE ip='${String(delIp).replace(/'/g, "''")}'`;
      label = `ip=${delIp}`;
    }
    const res = await d1(env, FACETALK_DB, sql);
    if (res && res.error) return bad('删除失败：' + res.error, 500);
    const changes = (res && res.meta && res.meta.changes) || 0;
    return json({ ok: true, deleted: changes, target: label });
  } catch (e) {
    return bad('删除异常：' + e.message, 500);
  }
}
