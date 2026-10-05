import { marketBinance, json } from '../_binance.js';
export default async function handler(req,res){
  if(req.method==='OPTIONS') return json(res,204,{});
  if(req.method!=='GET') return json(res,405,{error:'Method not allowed'});
  const symbol=String(req.query?.symbol||new URL(req.url,'https://vercel.local').searchParams.get('symbol')||'').toUpperCase();
  if(!/^[A-Z0-9]{5,20}$/.test(symbol)) return json(res,400,{error:'symbol invalid'});
  try { return json(res,200,await marketBinance('/fapi/v1/klines',{symbol,interval:'15m',limit:'150'})); }
  catch(e){ return json(res,502,{error:`MARKET KLINES ERROR: ${e.message}`,symbol}); }
}
