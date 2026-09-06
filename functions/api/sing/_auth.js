// Sing to Me 共享工具：CORS / JSON 响应 / 登录校验
// 供 functions/api/sing.js 与 functions/api/sing/audio/[id].js 复用。
// 注意：下划线开头的文件不会被 Pages 当作路由，仅作为模块被 import。
const DAY = 24 * 60 * 60 * 1000;

export function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors() },
  });
}

export async function hmac(value, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  const b = new Uint8Array(buf);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

export function getCookie(req, name) {
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

export async function verifyAuth(request, env) {
  // 1) HMAC cookie（登录后由 login.js 下发，7 天有效）
  const cookie = getCookie(request, 'rcj_admin');
  if (cookie && env.ADMIN_PASSWORD) {
    const [ts, sig] = cookie.split('.');
    if (!ts || !sig) return false;
    if (Date.now() - Number(ts) > 7 * DAY) return false; // 7 天过期
    if ((await hmac(ts, env.ADMIN_PASSWORD)) === sig) return true;
  }
  // 2) 一次性 ADMIN_KEY 深链（与主后台 admin/* 保持一致，避免深链进后台时 sing 列表/音频 401）
  const url = new URL(request.url);
  const key = url.searchParams.get('admin') || '';
  const envKey = String(env.ADMIN_KEY || '').trim();
  if (envKey && String(key).trim() === envKey) return true;
  return false;
}
