const BASE = process.env.BINANCE_MARKET_BASE_URL || process.env.BINANCE_BASE_URL || 'https://fapi.binance.com';

export async function marketBinance(path, params={}) {
  const qs = new URLSearchParams(params).toString();
  const url = BASE + path + (qs ? `?${qs}` : '');
  const r = await fetch(url, { headers: { 'User-Agent': 'ilham-novandi-trader/1.0' } });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!r.ok) throw new Error(data?.msg || data?.error || `Binance HTTP ${r.status}`);
  return data;
}

export function json(res, status, data) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  return res.status(status).json(data);
}
