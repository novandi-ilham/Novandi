import crypto from 'crypto';

const BASE = process.env.BINANCE_BASE_URL || 'https://fapi.binance.com';
const MARKET_BASE = process.env.BINANCE_MARKET_BASE_URL || 'https://fapi.binance.com';
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
  if(!response.ok) throw new Error(data?.msg||`Binance HTTP ${response.status}`);
  return data;
}

async function marketBinance(path, options={}) {
  // V5: market data is production-only. Never fall back to Testnet.
  return await binance(path,{...options,base:MARKET_BASE});
}

async function readBody(req){
  if(req.body&&typeof req.body==='object') return req.body;
  return await new Promise((resolve,reject)=>{let raw='';req.on('data',c=>{raw+=c;if(raw.length>100000)reject(new Error('body too large'))});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{})}catch(e){reject(e)}});req.on('error',reject)});
}
function headers(res){res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');res.setHeader('Vary','*');res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Content-Type','application/json; charset=utf-8')}
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
    if(path==='/api/health'&&req.method==='GET') return res.status(200).json({ok:true,mode:ALLOW_LIVE?'live-enabled':'paper-only',maxRiskPct:MAX_RISK_PCT,maxNotionalUSDT:MAX_NOTIONAL_USDT,testnet:BASE.includes('testnet'),testnetTrading:ALLOW_TESTNET,tradingEndpointLocked:!BASE.includes('testnet')&&!TRADING_TOKEN,marketDataProduction:MARKET_BASE==='https://fapi.binance.com',marketBase:MARKET_BASE,time:Date.now()});
    if(path==='/api/market/ticker'&&req.method==='GET') return res.status(200).json(await marketBinance('/fapi/v1/ticker/24hr'));
    if(path==='/api/market/time'&&req.method==='GET') return res.status(200).json(await marketBinance('/fapi/v1/time'));
    if(path==='/api/market/klines'&&req.method==='GET'){
      const symbol=String(new URL(req.url,'https://vercel.local').searchParams.get('symbol')||'').toUpperCase();
      if(!/^[A-Z0-9]{5,20}$/.test(symbol)) return res.status(400).json({error:'symbol invalid'});
      return res.status(200).json(await marketBinance('/fapi/v1/klines',{params:{symbol,interval:'15m',limit:150}}));
    }
    if(path==='/api/market/diagnostic'&&req.method==='GET'){
      const started=Date.now();
      try{
        const clock=await marketBinance('/fapi/v1/time');
        return res.status(200).json({ok:true,source:'VERCEL_SERVER',marketBase:MARKET_BASE,binanceHttp:200,serverTime:Number(clock.serverTime)||null,latencyMs:Date.now()-started});
      }catch(e){
        const msg=String(e?.message||e);
        const m=msg.match(/Binance HTTP (\d+)/);
        return res.status(200).json({ok:false,source:'VERCEL_SERVER',marketBase:MARKET_BASE,binanceHttp:m?Number(m[1]):null,error:msg,latencyMs:Date.now()-started});
      }
    }
    if(path==='/api/market/realtime'&&req.method==='GET'){
      const symbol=String(new URL(req.url,'https://vercel.local').searchParams.get('symbol')||'').toUpperCase();
      if(!/^[A-Z0-9]{5,20}$/.test(symbol)) return res.status(400).json({error:'symbol invalid'});
      const started=Date.now();
      const [klines,clock]=await Promise.all([
        marketBinance('/fapi/v1/klines',{params:{symbol,interval:'15m',limit:2}}),
        marketBinance('/fapi/v1/time')
      ]);
      const kline=Array.isArray(klines)&&klines.length?klines[klines.length-1]:null;
      if(!kline) throw new Error('Binance realtime kline kosong');
      return res.status(200).json({ok:true,source:'BINANCE_FUTURES_PRODUCTION',symbol,interval:'15m',serverTime:Number(clock.serverTime)||Date.now(),receivedAt:Date.now(),latencyMs:Date.now()-started,kline});
    }
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
