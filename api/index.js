import crypto from 'crypto';
import zlib from 'zlib';

const BASE = process.env.BINANCE_BASE_URL || 'https://fapi.binance.com';
// MARKET DATA IS ALWAYS PRODUCTION USDⓈ-M. Never fall back to BASE/testnet here.
// Paper/live order routing may use a separate BASE, but the chart/scanner must match
// the user's Binance BTCUSDT Perp production market.
const MARKET_BASE = 'https://fapi.binance.com';
const KEY = process.env.BINANCE_API_KEY || '';
const SECRET = process.env.BINANCE_API_SECRET || '';
const MAX_RISK_PCT = Math.min(1, Math.max(0.1, Number(process.env.MAX_RISK_PCT || 1)));
const TRADING_TOKEN = process.env.TRADING_TOKEN || '';
const MAX_NOTIONAL_USDT = Number(process.env.MAX_NOTIONAL_USDT || 250);
const ALLOW_LIVE = String(process.env.ALLOW_LIVE_TRADING || 'false').toLowerCase() === 'true';
const ALLOW_TESTNET = String(process.env.ALLOW_TESTNET_TRADING || 'true').toLowerCase() === 'true';

function sign(params) {
  return crypto.createHmac('sha256', SECRET).update(new URLSearchParams(params).toString()).digest('hex');
}
async function binance(path, { method='GET', params={}, signed=false, base=BASE }={}) {
  const p={...params};
  if(signed){ if(!KEY||!SECRET) throw new Error('Binance API credentials belum dikonfigurasi di server.'); p.timestamp=Date.now(); p.recvWindow=5000; p.signature=sign(p); }
  const qs=new URLSearchParams(p).toString();
  const url=base+path+(qs?`?${qs}`:'');
  const response=await fetch(url,{method,headers:{'X-MBX-APIKEY':KEY}});
  const text=await response.text(); let data; try{data=JSON.parse(text)}catch{data={raw:text}}
  if(!response.ok) throw new Error(`Binance ${response.status} · ${data?.msg||data?.code||'upstream error'} · ${path}`);
  return data;
}

async function marketBinance(path, options={}) {
  // One source of truth. If production market data fails, surface the failure
  // instead of silently switching to Testnet/stale data.
  return await binance(path,{...options,base:MARKET_BASE});
}


const VISION_BASE='https://data.binance.vision';
function isValidDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(String(s||''));}
function parseZipSingleFile(buf){
  const b=Buffer.from(buf);
  let off=0, csv=null;
  while(off+30<=b.length){
    const sig=b.readUInt32LE(off);
    if(sig===0x04034b50){
      const method=b.readUInt16LE(off+8), csize=b.readUInt32LE(off+18), usize=b.readUInt32LE(off+22), nlen=b.readUInt16LE(off+26), xlen=b.readUInt16LE(off+28);
      const dataStart=off+30+nlen+xlen, dataEnd=dataStart+csize;
      if(dataEnd>b.length)throw new Error('ZIP archive truncated');
      const raw=b.subarray(dataStart,dataEnd);
      if(method===0)csv=raw;
      else if(method===8)csv=zlib.inflateRawSync(raw);
      else throw new Error('ZIP compression method unsupported: '+method);
      if(usize && csv.length!==usize) throw new Error('ZIP size mismatch');
      break;
    }
    if(sig===0x02014b50||sig===0x06054b50)break;
    off++;
  }
  if(!csv)throw new Error('ZIP CSV not found');
  return csv.toString('utf8');
}
async function visionDailyKlines(symbol,date){
  if(!isValidDate(date))throw new Error('date invalid');
  const url=`${VISION_BASE}/data/futures/um/daily/klines/${encodeURIComponent(symbol)}/15m/${encodeURIComponent(symbol)}-15m-${date}.zip`;
  const r=await fetch(url,{cache:'no-store'});
  if(!r.ok)throw new Error(`VISION HTTP ${r.status} · ${date}`);
  const csv=parseZipSingleFile(await r.arrayBuffer());
  const rows=[];
  for(const line of csv.split(/\r?\n/)){
    const x=line.trim(); if(!x||x.startsWith('open_time'))continue;
    const c=x.split(','); if(c.length<6)continue;
    const t=Number(c[0]); const o=Number(c[1]),h=Number(c[2]),l=Number(c[3]),cl=Number(c[4]),v=Number(c[5]);
    if([t,o,h,l,cl,v].every(Number.isFinite))rows.push([t,String(c[1]),String(c[2]),String(c[3]),String(c[4]),String(c[5]),Number(c[6]||t+899999),String(c[7]||0),Number(c[8]||0),String(c[9]||0),String(c[10]||0),String(c[11]||0)]);
  }
  return rows;
}
async function visionRecentKlines(symbol,limit=150){
  const now=new Date();
  const dates=[];
  for(let i=1;i<=3;i++){
    const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-i));
    dates.push(d.toISOString().slice(0,10));
  }
  const blocks=await Promise.all(dates.map(async date=>{
    try{return await visionDailyKlines(symbol,date)}catch(e){if(String(e.message).includes('VISION HTTP 404'))return []; throw e;}
  }));
  return blocks.flat().sort((a,b)=>Number(a[0])-Number(b[0])).slice(-limit);
}

async function readBody(req){
  if(req.body&&typeof req.body==='object') return req.body;
  return await new Promise((resolve,reject)=>{let raw='';req.on('data',c=>{raw+=c;if(raw.length>100000)reject(new Error('body too large'))});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{})}catch(e){reject(e)}});req.on('error',reject)});
}
function headers(res){res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Content-Type','application/json; charset=utf-8')}
function requireTrade(req){
  const isTestnet=BASE.includes('testnet');
  if(isTestnet){ if(!ALLOW_TESTNET) throw new Error('Testnet trading disabled.'); return; }
  if(!ALLOW_LIVE) throw new Error('Live trading disabled. Aktifkan ALLOW_LIVE_TRADING=true hanya setelah testnet/paper tervalidasi.');
  if(!TRADING_TOKEN) throw new Error('TRADING_TOKEN belum dikonfigurasi; live order endpoint dikunci.');
  if(req.headers['x-trading-token']!==TRADING_TOKEN) throw new Error('Unauthorized trading request.');
}
function validateOrder(x){
  const symbol=String(x.symbol||'').toUpperCase(), side=String(x.side||'').toUpperCase(), qty=Number(x.quantity);
  if(!/^[A-Z0-9]{5,20}$/.test(symbol)||!['BUY','SELL'].includes(side)||!Number.isFinite(qty)||qty<=0) throw new Error('symbol, side, quantity tidak valid.');
  if(x.price&&(!Number.isFinite(Number(x.price))||Number(x.price)<=0)) throw new Error('price tidak valid.');
  if(x.stopPrice&&(!Number.isFinite(Number(x.stopPrice))||Number(x.stopPrice)<=0)) throw new Error('stopPrice tidak valid.');
  return {symbol,side,qty};
}

export default async function handler(req,res){
  headers(res); if(req.method==='OPTIONS') return res.status(204).end();
  try{
    const path=new URL(req.url,'https://vercel.local').pathname;
    if(path==='/api/health'&&req.method==='GET') return res.status(200).json({ok:true,apiVersion:'v74',marketSource:'BINANCE_USDM_PRODUCTION',mode:ALLOW_LIVE?'live-enabled':'paper-only',maxRiskPct:MAX_RISK_PCT,maxNotionalUSDT:MAX_NOTIONAL_USDT,testnet:BASE.includes('testnet'),testnetTrading:ALLOW_TESTNET,tradingEndpointLocked:!BASE.includes('testnet')&&!TRADING_TOKEN,time:Date.now()});
    if(path==='/api/market/ticker'&&req.method==='GET') return res.status(200).json(await marketBinance('/fapi/v1/ticker/24hr'));
    if(path==='/api/market/price'&&req.method==='GET'){ const symbol=String(new URL(req.url,'https://vercel.local').searchParams.get('symbol')||'').toUpperCase(); if(!/^[A-Z0-9]{5,20}$/.test(symbol)) return res.status(400).json({error:'symbol invalid'}); return res.status(200).json(await marketBinance('/fapi/v2/ticker/price',{params:{symbol}})); }
    if(path==='/api/market/klines'&&req.method==='GET'){ const symbol=String(new URL(req.url,'https://vercel.local').searchParams.get('symbol')||'').toUpperCase(); if(!/^[A-Z0-9]{5,20}$/.test(symbol)) return res.status(400).json({error:'symbol invalid'}); try{return res.status(200).json(await marketBinance('/fapi/v1/klines',{params:{symbol,interval:'15m',limit:150}}));}catch(e){const msg=String(e.message||e); if(msg.includes('Binance 451')) return res.status(503).json({error:msg,code:'MARKET_GEO_RESTRICTED',source:'BINANCE_USDM_PRODUCTION'}); throw e;} }
    if(path==='/api/market/archive'&&req.method==='GET'){ const u=new URL(req.url,'https://vercel.local'); const symbol=String(u.searchParams.get('symbol')||'').toUpperCase(); const date=String(u.searchParams.get('date')||''); if(!/^[A-Z0-9]{5,20}$/.test(symbol)||!isValidDate(date)) return res.status(400).json({error:'symbol/date invalid'}); try{return res.status(200).json(await visionDailyKlines(symbol,date));}catch(e){return res.status(404).json({error:e.message,code:'VISION_ARCHIVE_UNAVAILABLE'});} }
    if(path==='/api/market/history'&&req.method==='GET'){ const u=new URL(req.url,'https://vercel.local'); const symbol=String(u.searchParams.get('symbol')||'').toUpperCase(); const limit=Math.min(150,Math.max(30,Number(u.searchParams.get('limit')||150))); if(!/^[A-Z0-9]{5,20}$/.test(symbol)) return res.status(400).json({error:'symbol invalid'}); try{const rows=await visionRecentKlines(symbol,limit); if(rows.length<30) return res.status(404).json({error:'VISION archive insufficient',code:'VISION_ARCHIVE_INSUFFICIENT',count:rows.length}); return res.status(200).json({ok:true,source:'BINANCE_VISION_USDM_ARCHIVE',symbol,count:rows.length,rows});}catch(e){return res.status(502).json({error:e.message,code:'VISION_ARCHIVE_FETCH_FAILED'});} }
    if(path==='/api/market/diagnostic'&&req.method==='GET'){ const u=new URL(req.url,'https://vercel.local'); const symbol=String(u.searchParams.get('symbol')||'BTCUSDT').toUpperCase(); try{const d=await marketBinance('/fapi/v1/klines',{params:{symbol,interval:'15m',limit:2}}); return res.status(200).json({ok:true,source:'BINANCE_USDM_PRODUCTION_FAPI',symbol,count:d.length,lastOpenTime:d.at(-1)?.[0]||null,lastClose:d.at(-1)?.[4]||null});}catch(e){return res.status(200).json({ok:false,source:'BINANCE_USDM_PRODUCTION_FAPI',symbol,error:e.message,geoRestricted:String(e.message||'').includes('451')});} }
    if(path==='/api/market/snapshot'&&req.method==='GET'){ const symbol=String(new URL(req.url,'https://vercel.local').searchParams.get('symbol')||'').toUpperCase(); if(!/^[A-Z0-9]{5,20}$/.test(symbol)) return res.status(400).json({error:'symbol invalid'}); const price=await marketBinance('/fapi/v2/ticker/price',{params:{symbol}}); return res.status(200).json({source:'BINANCE_USDM_PRODUCTION_FAPI',marketBase:MARKET_BASE,serverTime:Date.now(),symbol,price:Number(price?.price)}); }
    if(path==='/api/account'&&req.method==='GET'){
      if(!KEY||!SECRET) return res.status(200).json({connected:false,reason:'API key not configured'});
      const a=await binance('/fapi/v3/account',{signed:true});
      return res.status(200).json({connected:true,account:{walletBalance:a.totalWalletBalance,availableBalance:a.availableBalance,unrealizedProfit:a.totalUnrealizedProfit},assets:a.assets,positions:(a.positions||[]).filter(x=>Number(x.positionAmt)!==0)});
    }
    if(path==='/api/exchange-info'&&req.method==='GET') return res.status(200).json(await binance('/fapi/v1/exchangeInfo'));
    if(path==='/api/order'&&req.method==='POST'){
      requireTrade(req); const x=await readBody(req);
      const v=validateOrder(x); if(v.qty*Number(x.price||0)>MAX_NOTIONAL_USDT) return res.status(400).json({error:`Notional melebihi hard cap ${MAX_NOTIONAL_USDT} USDT.`});
      return res.status(200).json(await binance('/fapi/v1/order',{method:'POST',params:{symbol:String(x.symbol).toUpperCase(),side:String(x.side).toUpperCase(),type:x.type||'MARKET',quantity:String(x.quantity),...(x.price?{price:String(x.price)}:{}),...(x.stopPrice?{stopPrice:String(x.stopPrice)}:{}),...(x.reduceOnly!==undefined?{reduceOnly:String(!!x.reduceOnly)}:{})},signed:true}));
    }
    if(path==='/api/bracket-order'&&req.method==='POST'){
      requireTrade(req); const x=await readBody(req); const symbol=String(x.symbol||'').toUpperCase(), side=String(x.side||'').toUpperCase();
      const qty=String(x.quantity||''); const sl=Number(x.stopPrice),tp=Number(x.takeProfitPrice);
      if(!symbol||!['BUY','SELL'].includes(side)||!qty||!(sl>0)||!(tp>0)) return res.status(400).json({error:'symbol, side, quantity, stopPrice, takeProfitPrice wajib.'});
      const entry=await binance('/fapi/v1/order',{method:'POST',params:{symbol,side,type:'MARKET',quantity:qty},signed:true});
      const exitSide=side==='BUY'?'SELL':'BUY'; let stopOrder,tpOrder;
      try{
        stopOrder=await binance('/fapi/v1/order',{method:'POST',params:{symbol,side:exitSide,type:'STOP_MARKET',stopPrice:String(sl),closePosition:'true',workingType:'MARK_PRICE'},signed:true});
        tpOrder=await binance('/fapi/v1/order',{method:'POST',params:{symbol,side:exitSide,type:'TAKE_PROFIT_MARKET',stopPrice:String(tp),closePosition:'true',workingType:'MARK_PRICE'},signed:true});
      }catch(e){
        try{await binance('/fapi/v1/order',{method:'POST',params:{symbol,side:exitSide,type:'MARKET',quantity:qty,reduceOnly:'true'},signed:true})}catch{}
        throw new Error(`Entry dibuat tetapi bracket SL/TP gagal: ${e.message}. Posisi dicoba ditutup otomatis.`);
      }
      return res.status(200).json({entry,stopOrder,tpOrder});
    }
    if(path==='/api/close'&&req.method==='POST'){
      requireTrade(req); const x=await readBody(req); if(!x.symbol||!x.quantity||!x.side) return res.status(400).json({error:'symbol, quantity, side wajib.'});
      return res.status(200).json(await binance('/fapi/v1/order',{method:'POST',params:{symbol:String(x.symbol).toUpperCase(),side:String(x.side).toUpperCase(),type:'MARKET',quantity:String(x.quantity),reduceOnly:'true'},signed:true}));
    }
    return res.status(404).json({error:'Not found'});
  }catch(error){console.error(error);return res.status(500).json({error:error.message||'Internal server error'})}
}
