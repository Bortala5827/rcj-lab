// rcj-lab · 一次性迁移：把辅警库历史 visit_counts 并入统一库（site='aux'）
// GET /api/admin/migrate  (需后台登录)
// 幂等：INSERT OR REPLACE，重复执行安全。仅管理员可触发。
// 注：aux-police-exam-d1 已于 2026-08-17 并入 exam 后删除，本迁移已作废，不再执行任何 D1 查询。

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
    // 毫秒时间戳（login.js Date.now()），7 天有效
    if (Date.now() - Number(ts) > 7 * 24 * 60 * 60 * 1000) return false;
    if ((await hmac(ts, env.ADMIN_PASSWORD)) === sig) return true;
  }
  return false; // 移除 ?password= URL 明文参数
}
export async function onRequestGet({ request, env }) {
  if (!(await verifyAuth(request, env))) return json({ error: '未登录' }, 401);
  // aux-police-exam-d1 已于 2026-08-17 并入 exam 后删除，无历史数据可迁；
  // exam 站当前未绑定 D1，迁移脚本不再执行任何 D1 查询（避免 database/undefined 报错）。
  return json({
    ok: true,
    migrated: 0,
    note: 'aux-police-exam-d1 已于 2026-08-17 并入 exam 后删除，辅警历史浏览数据无需再迁移。',
  });
}
