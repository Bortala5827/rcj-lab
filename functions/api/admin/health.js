// rcj-lab · 站点健康状态
// GET /api/admin/health  (需登录；15s 短缓存)
// 对生产域名做 HEAD 探测，返回各站点在线状态（红绿灯）。
// 用 HTTP 探测而非 CF API：直接反映用户真实可访问性，且不依赖额外 token 权限。

const TARGETS = [
  { id: 'hub',   name: 'RCJ Lab 主站',   url: 'https://955827.xyz/' },
  { id: 'solo',  name: 'SoloSpeak',      url: 'https://speak.955827.xyz/solospeak/' },
  { id: 'letout',name: 'LetOut',         url: 'https://speak.955827.xyz/letout/' },
  { id: 'exam',  name: 'Exam Hub',       url: 'https://exam.955827.xyz/' },
  { id: 'fj',    name: '辅警题库',        url: 'https://exam.955827.xyz/fj' },
  { id: 'xf',    name: '消防题库',        url: 'https://exam.955827.xyz/xf' },
  { id: 'ft',    name: 'FaceTalk',       url: 'https://facetalk.955827.xyz/' },
  { id: 'ftadm', name: 'FaceTalk 后台',   url: 'https://facetalk.955827.xyz/admin' },
];

let _cache = null;
let _cacheAt = 0;
const CACHE_TTL = 15_000; // 15 秒

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
    // 时间戳毫秒（login.js Date.now()），7 天有效
    if (Date.now() - Number(ts) > 7 * 24 * 60 * 60 * 1000) return false;
    if ((await hmac(ts, env.ADMIN_PASSWORD)) === sig) return true;
  }
  return false; // 移除 ?password= URL 明文参数
}

async function probe(target) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 4000);
  try {
    const r = await fetch(target.url, { method: 'HEAD', redirect: 'follow', signal: ac.signal });
    return { ...target, ok: r.ok, status: r.status, ms: 0 };
  } catch (e) {
    return { ...target, ok: false, status: 0, error: e.name === 'AbortError' ? '超时' : '不可达' };
  } finally { clearTimeout(timer); }
}

export async function onRequestGet({ request, env }) {
  if (!(await verifyAuth(request, env))) return json({ error: '未登录' }, 401);

  const hit = _cache && (Date.now() - _cacheAt) < CACHE_TTL ? _cache : null;
  if (hit) return json({ ok: true, cached: true, checkedAt: new Date().toISOString(), sites: hit });

  const sites = await Promise.all(TARGETS.map(probe));
  const summary = { up: sites.filter(s => s.ok).length, total: sites.length };
  _cache = sites;
  _cacheAt = Date.now();

  return json({ ok: true, checkedAt: new Date().toISOString(), summary, sites });
}
