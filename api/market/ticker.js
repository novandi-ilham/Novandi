import { marketBinance, json } from '../_binance.js';
export default async function handler(req,res){
  if(req.method==='OPTIONS') return json(res,204,{});
  if(req.method!=='GET') return json(res,405,{error:'Method not allowed'});
  try { return json(res,200,await marketBinance('/fapi/v1/ticker/24hr')); }
  catch(e){ return json(res,502,{error:`MARKET TICKER ERROR: ${e.message}`}); }
}
