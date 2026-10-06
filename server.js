import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import {fileURLToPath} from 'url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PUBLIC=path.join(__dirname,'public');
const PORT=Number(process.env.PORT||8787);
const BASE=process.env.BINANCE_BASE_URL||'https://fapi.binance.com';
const MARKET_BASE=process.env.BINANCE_MARKET_BASE_URL||'https://fapi.binance.com';
const KEY=process.env.BINANCE_API_KEY||'';
const SECRET=process.env.BINANCE_API_SECRET||'';
const ALLOW_LIVE=String(process.env.ALLOW_LIVE_TRADING||'false').toLowerCase()==='true';
const ALLOW_TESTNET=String(process.env.ALLOW_TESTNET_TRADING||'true').toLowerCase()==='true';
const TRADING_TOKEN=process.env.TRADING_TOKEN||'';
const MAX_NOTIONAL_USDT=Number(process.env.MAX_NOTIONAL_USDT||250);


const VISION_BASE='https://data.binance.vision';
function isValidDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(String(s||''));}
function parseZipSingleFile(buf){const b=Buffer.from(buf);let off=0,csv=null;while(off+30<=b.length){const sig=b.readUInt32LE(off);if(sig===0x04034b50){const method=b.readUInt16LE(off+8),csize=b.readUInt32LE(off+18),usize=b.readUInt32LE(off+22),nlen=b.readUInt16LE(off+26),xlen=b.readUInt16LE(off+28);const dataStart=off+30+nlen+xlen, dataEnd=dataStart+csize;if(dataEnd>b.length)throw Error('ZIP archive truncated');const raw=b.subarray(dataStart,dataEnd);csv=method===0?raw:method===8?zlib.inflateRawSync(raw):null;if(!csv)throw Error('ZIP compression method unsupported: '+method);if(usize&&csv.length!==usize)throw Error('ZIP size mismatch');break;}if(sig===0x02014b50||sig===0x06054b50)break;off++;}if(!csv)throw Error('ZIP CSV not found');return csv.toString('utf8');}
async function visionDailyKlines(symbol,date){if(!isValidDate(date))throw Error('date invalid');const url=`${VISION_BASE}/data/futures/um/daily/klines/${encodeURIComponent(symbol)}/15m/${encodeURIComponent(symbol)}-15m-${date}.zip`;const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error(`VISION HTTP ${r.status} · ${date}`);const csv=parseZipSingleFile(await r.arrayBuffer());const rows=[];for(const line of csv.split(/\r?\n/)){const x=line.trim();if(!x||x.startsWith('open_time'))continue;const c=x.split(',');if(c.length<6)continue;const t=Number(c[0]),o=Number(c[1]),h=Number(c[2]),l=Number(c[3]),cl=Number(c[4]),v=Number(c[5]);if([t,o,h,l,cl,v].every(Number.isFinite))rows.push([t,String(c[1]),String(c[2]),String(c[3]),String(c[4]),String(c[5]),Number(c[6]||t+899999),String(c[7]||0),Number(c[8]||0),String(c[9]||0),String(c[10]||0),String(c[11]||0)]);}return rows;}

function sign(params){return crypto.createHmac('sha256',SECRET).update(new URLSearchParams(params).toString()).digest('hex')}
async function binance(pth,{method='GET',params={},signed=false,base=BASE}={}){
  const p={...params};
  if(signed){if(!KEY||!SECRET)throw Error('Binance API credentials belum dikonfigurasi di server.');p.timestamp=Date.now();p.recvWindow=5000;p.signature=sign(p)}
  const qs=new URLSearchParams(p).toString(); const url=base+pth+(qs?'?'+qs:'');
  const r=await fetch(url,{method,headers:{'X-MBX-APIKEY':KEY}}); const text=await r.text(); let data; try{data=JSON.parse(text)}catch{data={raw:text}}; if(!r.ok)throw Error(data?.msg||`Binance HTTP ${r.status}`); return data;
}
async function marketBinance(pth,options={}){try{return await binance(pth,{...options,base:MARKET_BASE})}catch(e){if(BASE===MARKET_BASE)throw e;return await binance(pth,{...options,base:BASE})}}
function send(res,status,type,body){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});res.end(body)}
function json(res,status,obj){send(res,status,'application/json',JSON.stringify(obj))}
async function body(req){return await new Promise((resolve,reject)=>{let b='';req.on('data',d=>{b+=d;if(b.length>100000)reject(Error('body too large'))});req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(e)}});req.on('error',reject)})}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,`http://${req.headers.host}`);
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});return res.end()}
  if(u.pathname==='/api/health')return json(res,200,{ok:true,apiVersion:'v75',marketSource:'BINANCE_USDM_PRODUCTION',mode:ALLOW_LIVE?'live-enabled':'paper-only',maxNotionalUSDT:MAX_NOTIONAL_USDT,tradingEndpointLocked:!TRADING_TOKEN,time:Date.now()});
  if(u.pathname==='/api/market/ticker'&&req.method==='GET')return json(res,200,await marketBinance('/fapi/v1/ticker/24hr'));
  if(u.pathname==='/api/market/klines'&&req.method==='GET'){const s=u.searchParams.get('symbol')||'';if(!/^[A-Z0-9]{5,20}$/.test(s))return json(res,400,{error:'symbol invalid'});try{return json(res,200,await marketBinance('/fapi/v1/klines',{params:{symbol:s.toUpperCase(),interval:'15m',limit:150}}));}catch(e){if(String(e.message||e).includes('451'))return json(res,503,{error:e.message,code:'MARKET_GEO_RESTRICTED',source:'BINANCE_USDM_PRODUCTION'});throw e;}}
  if(u.pathname==='/api/market/archive'&&req.method==='GET'){const s=(u.searchParams.get('symbol')||'').toUpperCase(),date=u.searchParams.get('date')||'';if(!/^[A-Z0-9]{5,20}$/.test(s)||!isValidDate(date))return json(res,400,{error:'symbol/date invalid'});try{return json(res,200,await visionDailyKlines(s,date));}catch(e){return json(res,404,{error:e.message,code:'VISION_ARCHIVE_UNAVAILABLE'});}}
  if(u.pathname==='/api/account'&&req.method==='GET'){
   if(!KEY||!SECRET)return json(res,200,{connected:false,reason:'API key not configured'});
   const a=await binance('/fapi/v3/account',{signed:true});return json(res,200,{connected:true,account:{walletBalance:a.totalWalletBalance,availableBalance:a.availableBalance,unrealizedProfit:a.totalUnrealizedProfit},assets:a.assets,positions:(a.positions||[]).filter(x=>Number(x.positionAmt)!==0)});
  }
  if(u.pathname==='/api/exchange-info'&&req.method==='GET')return json(res,200,await binance('/fapi/v1/exchangeInfo'));
  if(u.pathname==='/api/order'&&req.method==='POST'){
   if(BASE.includes('testnet')){if(!ALLOW_TESTNET)return json(res,403,{error:'Testnet trading disabled.'});}else{if(!ALLOW_LIVE)return json(res,403,{error:'Live trading disabled. Set ALLOW_LIVE_TRADING=true on the server.'});if(!TRADING_TOKEN||req.headers['x-trading-token']!==TRADING_TOKEN)return json(res,401,{error:'Unauthorized trading request.'});}
   const x=await body(req);if(!x.symbol||!x.side||!x.quantity)return json(res,400,{error:'symbol, side, quantity wajib.'});
   const p={symbol:String(x.symbol).toUpperCase(),side:x.side,type:x.type||'MARKET',quantity:String(x.quantity),reduceOnly:String(!!x.reduceOnly)};if(x.price)p.price=String(x.price);if(x.stopPrice)p.stopPrice=String(x.stopPrice);return json(res,200,await binance('/fapi/v1/order',{method:'POST',params:p,signed:true}));
  }
  if(u.pathname==='/api/close'&&req.method==='POST'){
   if(BASE.includes('testnet')){if(!ALLOW_TESTNET)return json(res,403,{error:'Testnet trading disabled.'});}else{if(!ALLOW_LIVE)return json(res,403,{error:'Live trading disabled.'});if(!TRADING_TOKEN||req.headers['x-trading-token']!==TRADING_TOKEN)return json(res,401,{error:'Unauthorized trading request.'});} const x=await body(req);if(!x.symbol||!x.quantity||!x.side)return json(res,400,{error:'symbol, quantity, side wajib.'});
   return json(res,200,await binance('/fapi/v1/order',{method:'POST',params:{symbol:String(x.symbol).toUpperCase(),side:x.side,type:'MARKET',quantity:String(x.quantity),reduceOnly:'true'},signed:true}));
  }
  let fp=path.normalize(path.join(PUBLIC,u.pathname==='/'?'index.html':u.pathname));if(!fp.startsWith(PUBLIC))return json(res,403,{error:'forbidden'});if(!fs.existsSync(fp)||fs.statSync(fp).isDirectory())fp=path.join(PUBLIC,'index.html');return send(res,200,mime[path.extname(fp)]||'text/plain',fs.readFileSync(fp));
 }catch(e){console.error(e);json(res,500,{error:e.message})}
});
server.listen(PORT,()=>console.log(`Ilham Novandi Trader: http://localhost:${PORT}`));
