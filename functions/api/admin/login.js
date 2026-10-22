// rcj-lab · 统一后台登录
// POST { password } → 校验 ADMIN_PASSWORD → 签发 HMAC 签名 cookie
// cookie 名称 rcj_admin = "<timestamp>.<hmac>"，用 ADMIN_PASSWORD 作 HMAC key
//
// S-02 失败锁定：D1 持久化计数（Pages Functions 无状态，不能用内存）。
// 同一 IP 连续 5 次失败锁 15 分钟；成功后清零。D1 无绑定/表故障一律放行并打日志，
// 绝不因锁表异常把管理员锁死在门外。

const COOKIE = 'rcj_admin';
const DAY = 60 * 60 * 24;
const MAX_FAILS = 5;          // 连续失败阈值（次）
const LOCK_SECONDS = 15 * 60; // 锁定时长（秒）

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
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

function getClientIp(request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  );
}

const attemptKey = (ip) => `login:${ip}`;

// 读当前失败记录；返回 null 表示 D1 不可用 → 调用方故障放行
async function readAttempt(env, ip, now) {
  const db = env.DB;
  if (!db || typeof db.prepare !== 'function') return null;
  try {
    await db.prepare(
      `CREATE TABLE IF NOT EXISTS login_attempts (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0,
        locked_until INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      )`
    ).run();
    const row = await db.prepare('SELECT count, locked_until, updated_at FROM login_attempts WHERE key=?')
      .bind(attemptKey(ip)).first();
    return { db, row, now };
  } catch (e) {
    console.log('[login] D1 锁定表不可用，本次放行：', e && e.message);
    return null;
  }
}

// 记录一次失败；返回 { locked, retryAfter }
async function recordFail(state, ip) {
  const { db, row, now } = state;
  const stale = !row || row.locked_until > now || (now - (row.updated_at || 0)) > LOCK_SECONDS;
  const count = stale ? 1 : (row.count || 0) + 1;
  const locked = count >= MAX_FAILS;
  const locked_until = locked ? now + LOCK_SECONDS : 0;
  try {
    await db.prepare('INSERT OR REPLACE INTO login_attempts (key, count, locked_until, updated_at) VALUES (?,?,?,?)')
      .bind(attemptKey(ip), count, locked_until, now).run();
  } catch (e) {
    console.log('[login] 写锁定表失败，本次放行：', e && e.message);
    return { locked: false, retryAfter: 0 };
  }
  return { locked, retryAfter: locked_until - now };
}

// 成功登录后清零该 IP 的失败计数（失败不影响主流程）
async function clearAttempt(state, ip) {
  try {
    await state.db.prepare('DELETE FROM login_attempts WHERE key=?').bind(attemptKey(ip)).run();
  } catch (e) {
    console.log('[login] 清理失败计数失败（忽略）：', e && e.message);
  }
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON 格式错误' }, 400); }
  const pw = body.password || '';
  if (!env.ADMIN_PASSWORD) return json({ error: 'ADMIN_PASSWORD 未配置。请在 Cloudflare Pages → rcj-lab → Settings → Functions → Environment variables 添加。' }, 500);

  // ── S-02 失败锁定（D1 持久化；D1 故障返回 null → 放行）──
  const ip = getClientIp(request);
  const state = await readAttempt(env, ip, Math.floor(Date.now() / 1000));

  if (state && state.row && state.row.locked_until > state.now) {
    const retryAfter = Math.max(1, state.row.locked_until - state.now);
    return json(
      { error: `失败次数过多，账号已锁定，请 ${Math.ceil(retryAfter / 60)} 分钟后再试` },
      429,
      { 'Retry-After': String(retryAfter) }
    );
  }

  if (pw !== env.ADMIN_PASSWORD) {
    if (state) {
      const r = await recordFail(state, ip);
      if (r.locked) {
        return json(
          { error: `失败次数过多，账号已锁定 15 分钟，请稍后再试` },
          429,
          { 'Retry-After': String(r.retryAfter || LOCK_SECONDS) }
        );
      }
    }
    return json({ error: '密码错误' }, 401);
  }

  // 成功：清零失败计数后再签发 cookie
  if (state) await clearAttempt(state, ip);

  const payload = String(Date.now()); // 毫秒时间戳（data/health/wall 均按毫秒校验）
  const sig = await hmac(payload, env.ADMIN_PASSWORD);
  const cookie = `${COOKIE}=${encodeURIComponent(payload + '.' + sig)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${DAY}`; // 1 天有效期，到期需重新登录
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': cookie, 'Cache-Control': 'no-store' },
  });
}
