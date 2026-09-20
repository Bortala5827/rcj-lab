// rcj-lab · 通知通道自检（聚合后台一键验证提醒链路）
// POST /api/admin/notify-test   （需 rcj_admin 登录 cookie，鉴权同 health.js）
//
// 服务端携带 SELFTEST_KEY 并发调各站自检接口，把「shop 订单提醒」与「客服提醒」的
// 每个通道（Telegram / 邮件 / 飞书）真实发一条，逐个回报成败。
// 密钥只在本函数里使用，不下发浏览器。

const SHOP_URL = 'https://shop.955827.xyz';
const SUPPORT_URL = 'https://support.955827.xyz';

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
    if (Date.now() - Number(ts) > 7 * 24 * 60 * 60 * 1000) return false;
    if ((await hmac(ts, env.ADMIN_PASSWORD)) === sig) return true;
  }
  return false;
}

// 调一个站点的自检接口（20s 超时），任何异常都归一成可读结果，绝不抛给前端
async function callTarget(name, url, key) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20000);
  try {
    const r = await fetch(url + '?key=' + encodeURIComponent(key), { method: 'POST', signal: ac.signal });
    const d = await r.json().catch(() => null);
    if (!d) return { target: name, ok: false, error: 'HTTP ' + r.status + '（返回非 JSON，可能未部署或未授权）' };
    if (r.status === 401 || d.ok === false) {
      return { target: name, ok: false, error: d.error || ('HTTP ' + r.status) };
    }
    return d;
  } catch (e) {
    const msg = e && e.name === 'AbortError' ? '超时（20s）' : ('不可达：' + (e && e.message ? e.message : e));
    return { target: name, ok: false, error: msg };
  } finally { clearTimeout(timer); }
}

export async function onRequestPost({ request, env }) {
  if (!(await verifyAuth(request, env))) return json({ error: '未登录' }, 401);

  const key = String(env.SELFTEST_KEY || '').trim();
  if (!key) return json({ ok: false, error: '主站未配置 SELFTEST_KEY（Pages secret），无法发起自检' }, 500);

  const [shop, supportly] = await Promise.all([
    callTarget('shop', SHOP_URL + '/api/admin/notify-test', key),
    callTarget('supportly', SUPPORT_URL + '/api/selftest', key),
  ]);

  const channels = [];
  for (const t of [shop, supportly]) {
    if (t && Array.isArray(t.channels)) {
      for (const c of t.channels) channels.push({ ...c, target: t.target || '' });
    }
  }

  return json({
    ok: true,
    checkedAt: new Date().toISOString(),
    targets: [shop, supportly],
    channels,
    failed: channels.filter(c => c.status === 'fail').length,
    unreachable: [shop, supportly].filter(t => !t || t.ok === false).length,
  });
}
