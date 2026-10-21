// rcj-lab · 统一访问统计埋点接收端（公开，无需后台登录）
// POST/GET /api/track?site=xxx  →  写入 rcj-analytics-d1.visits(site, day, ip, n)
// 所有站点（hub/training/aux/xf/facetalk/exam/speak 系列）共用一个库、一张表、一条管道。
// 数据源：Pages 原生 D1 绑定 env.DB（rcj-analytics-d1），无需 API Token。

const SITES = ['hub', 'solospeak', 'letout', 'training', 'aux', 'xf', 'facetalk', 'exam', 'shop', 'voice'];

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors() });
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const site = (url.searchParams.get('site') || '').trim();
  if (!SITES.includes(site)) {
    return new Response(JSON.stringify({ ok: false, error: 'unknown site' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...cors() } });
  }
  const ip = (request.headers.get('CF-Connecting-IP')
    || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || '0.0.0.0');
  const day = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD

  try {
    await env.DB.prepare(
      'INSERT INTO visits(site, day, ip, n) VALUES(?, ?, ?, 1) ON CONFLICT(site, day, ip) DO UPDATE SET n = n + 1'
    ).bind(site, day, ip).run();
    return new Response(JSON.stringify({ ok: true }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...cors() } });
  } catch (e) {
    // 埋点失败不影响用户浏览，静默返回
    return new Response(JSON.stringify({ ok: false, error: e.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...cors() } });
  }
}
