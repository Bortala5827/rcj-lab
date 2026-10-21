// rcj-lab · 访问统计公开查询（与 track.js 同一张 visits 表）
// GET /api/stats?site=voice → { ok, site, date, uv(当日去重访客), pv(当日访问) }
const SITES = ['hub', 'solospeak', 'letout', 'training', 'aux', 'xf', 'facetalk', 'exam', 'shop', 'voice'];

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors() },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors() });
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const site = (url.searchParams.get('site') || '').trim();
  if (!SITES.includes(site)) {
    return json({ ok: false, error: 'unknown site' }, 400);
  }
  const day = new Date().toISOString().slice(0, 10); // UTC 当日
  try {
    const row = await env.DB.prepare(
      'SELECT COUNT(DISTINCT ip) AS uv, COALESCE(SUM(n), 0) AS pv FROM visits WHERE site = ? AND day = ?'
    ).bind(site, day).first() || {};
    return json({
      ok: true,
      site,
      date: day,
      uv: Number(row.uv || 0),
      pv: Number(row.pv || 0),
    });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
