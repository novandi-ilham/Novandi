
let deferredInstallPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;const b=document.getElementById('installBtn');if(b)b.style.display='inline-block'});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;const b=document.getElementById('installBtn');if(b)b.style.display='none'});
document.addEventListener('click',async e=>{if(e.target?.id==='installBtn'&&deferredInstallPrompt){deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;e.target.style.display='none'}});
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}))}
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let symbol='BTCUSDT',tf='15m',candles=[],chart,series,emaSeries,ws=null,drawings=[],tool='none',auto=true,paperPos=null,paperPnl=0,dailyPnl=0,lossStreak=0,killed=false,accountEquity=10000000,mode='paper',srActive=false,tradeStats={wins:0,losses:0},tradeHistory=[],hunterBusy=false,lastHunterCandle=0,lastHunterSymbol='',lastSwitchAt=0,positionPriceLines=[],tradeMarkers=[],lossCooldowns={};
const LOSS_REENTRY_COOLDOWN_MS=15*60*1000;
const DEFAULT_PAPER_MARGIN_IDR=500000; const DEFAULT_LEVERAGE=10;
const HUNTER={switchAdvantage:5,scanMs:1200,candidateCount:30,cooldownMs:150,klinesCacheMs:7000,entryRefreshMs:900};
const scanKlineCache=new Map();
let tickerCache={at:0,data:null};
async function getScannerTicker(){
  const now=Date.now();
  if(tickerCache.data&&now-tickerCache.at<5000)return tickerCache.data;
  try{
    const r=await fetch('/api/market/ticker?_='+now,{cache:'no-store'});
    const d=await r.json().catch(()=>null);
    if(!r.ok||!Array.isArray(d)) throw Error(d?.error||`Ticker API ${r.status}`);
    tickerCache={at:now,data:d};
    return d;
  }catch(e){
    if(tickerCache.data){log(`Ticker sementara gagal (${e.message}) · pakai data terakhir`);return tickerCache.data;}
    throw e;
  }
}
const IDR=16000; const fmtP=n=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:priceDecimals(n)}); const fmtIDR=n=>'Rp '+Math.round(n||0).toLocaleString('id-ID');
function priceDecimals(n){n=Math.abs(Number(n)||0);if(n>=1000)return 2;if(n>=100)return 3;if(n>=1)return 4;if(n>=0.1)return 5;if(n>=0.01)return 6;if(n>=0.001)return 7;return 8}
function fmtTradeP(n){const d=priceDecimals(n);return Number(n||0).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})}
function clearPositionVisuals(){
  try{positionPriceLines.forEach(x=>series?.removePriceLine(x));}catch{}
  positionPriceLines=[];
}
function renderTradeVisuals(){
  if(!series)return;
  try{
    clearPositionVisuals();
    if(paperPos&&hasValidPaperPosition()){
      const p=paperPos;
      const entryLine=series.createPriceLine({price:Number(p.entry),color:p.side==='BUY'?'#19d59a':'#ff5c72',lineWidth:2,lineStyle:0,axisLabelVisible:true,title:p.side==='BUY'?'AUTO BUY':'AUTO SELL'});
      const slLine=series.createPriceLine({price:Number(p.sl),color:'#ff5c72',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:'SL'});
      const tpLine=series.createPriceLine({price:Number(p.tp),color:'#4de1ff',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:'TP'});
      positionPriceLines=[entryLine,slLine,tpLine];
    }
    const markers=[...tradeMarkers].filter(m=>m&&m.symbol===symbol&&Number.isFinite(Number(m.time))).sort((a,b)=>a.time-b.time).slice(-50);
    series.setMarkers(markers);
  }catch(e){log('Trade marker render error: '+e.message)}
}
function addTradeMarker(type,p){
  if(!p)return;
  const t=Math.floor(Number(p.entryCandleTime||p.opened||Date.now()/1000));
  tradeMarkers.push({symbol:p.symbol||symbol,time:t,position:p.side==='BUY'?'belowBar':'aboveBar',color:p.side==='BUY'?'#19d59a':'#ff5c72',shape:p.side==='BUY'?'arrowUp':'arrowDown',text:`AUTO ${p.side} ${fmtTradeP(p.entry)}`});
  if(tradeMarkers.length>50)tradeMarkers=tradeMarkers.slice(-50);
  renderTradeVisuals();
}
function persist(){try{localStorage.setItem('ilhamPaperState',JSON.stringify({date:new Date().toISOString().slice(0,10),symbol,paperPos,paperPnl,dailyPnl,lossStreak,tradeStats,tradeHistory,tradeMarkers,lossCooldowns,margin:+$('#margin').value||DEFAULT_PAPER_MARGIN_IDR,leverage:+$('#lev').value||DEFAULT_LEVERAGE,maxFloatLoss:+$('#maxFloatLoss').value||1,profitGiveback:+$('#profitGiveback').value||10,negativeScans:+$('#negativeScans').value||3,autoRotate:$('#autoRotate').checked}))}catch{}}
function restore(){try{let x=JSON.parse(localStorage.getItem('ilhamPaperState')||'null');if(!x||x.date!==new Date().toISOString().slice(0,10))return;symbol=x.symbol||symbol;paperPos=x.paperPos||null;if(paperPos&&(!Number.isFinite(Number(paperPos.hardLoss))||Number(paperPos.hardLoss)<=0))paperPos.hardLoss=riskBudgetIDR(Number(paperPos.margin)||paperMargin());paperPnl=+x.paperPnl||0;dailyPnl=+x.dailyPnl||0;lossStreak=+x.lossStreak||0;tradeStats=x.tradeStats||tradeStats;tradeHistory=Array.isArray(x.tradeHistory)?x.tradeHistory:[];tradeMarkers=Array.isArray(x.tradeMarkers)?x.tradeMarkers.filter(m=>m&&m.symbol):[];lossCooldowns=(x.lossCooldowns&&typeof x.lossCooldowns==='object')?x.lossCooldowns:{};if($('#margin'))$('#margin').value=Number(x.margin)||DEFAULT_PAPER_MARGIN_IDR;if($('#lev'))$('#lev').value=Number(x.leverage)||DEFAULT_LEVERAGE;if($('#maxFloatLoss'))$('#maxFloatLoss').value=Number(x.maxFloatLoss)||1;if($('#profitGiveback'))$('#profitGiveback').value=Number(x.profitGiveback)||10;if($('#negativeScans'))$('#negativeScans').value=Number(x.negativeScans)||1;if($('#autoRotate'))$('#autoRotate').checked=x.autoRotate!==false;if(!hasValidPaperPosition())paperPos=null;updatePaperAccount(0);renderPaperOrderPreview();$('#dailyLossOut').textContent=fmtIDR(dailyPnl);$('#lossStreak').textContent=lossStreak}catch{}}
function log(s){const e=document.createElement('div');e.className='log';e.textContent=new Date().toLocaleTimeString('id-ID')+' · '+s;$('#logs').prepend(e)}
function ema(vals,p=20){let k=2/(p+1),e=vals[0],out=[];vals.forEach((v,i)=>{e=i? v*k+e*(1-k):v;out.push(e)});return out}
function atr(cs=candles){if(cs.length<20)return 0;let a=[];for(let i=1;i<cs.length;i++)a.push(Math.max(cs[i].high-cs[i].low,Math.abs(cs[i].high-cs[i-1].close),Math.abs(cs[i].low-cs[i-1].close)));return a.slice(-14).reduce((x,y)=>x+y,0)/Math.min(14,a.length)}
function sr(cs=candles){let h=[],l=[];for(let i=2;i<cs.length-2;i++){if(cs[i].high>cs[i-1].high&&cs[i].high>cs[i+1].high)h.push(cs[i].high);if(cs[i].low<cs[i-1].low&&cs[i].low<cs[i+1].low)l.push(cs[i].low)}let p=cs.at(-1)?.close||0;let resistance=h.filter(x=>x>p).sort((a,b)=>a-b)[0]||Math.max(...cs.slice(-40).map(x=>x.high));let support=l.filter(x=>x<p).sort((a,b)=>b-a)[0]||Math.min(...cs.slice(-40).map(x=>x.low));return{support,resistance}}
function analyzeData(cs){
 if(cs.length<30)return null;
 const c=cs.at(-1),p=cs.at(-2),cl=cs.map(x=>x.close),es=ema(cl),e=es.at(-1),A=atr(cs),{support,resistance}=sr(cs);
 const body=Math.abs(c.close-c.open),range=Math.max(c.high-c.low,Number.EPSILON),wU=c.high-Math.max(c.open,c.close),wL=Math.min(c.open,c.close)-c.low;
 const bodyPct=body/range, bull=c.close>c.open,bear=c.close<c.open, trend=c.close>=e?1:-1;
 const momentum=(c.close-p.close)/(A||Math.max(c.close*.001,1));
 const avgVol=cs.slice(-21,-1).reduce((a,x)=>a+x.volume,0)/20,vol=avgVol?c.volume/avgVol:1;
 const prev20=cs.slice(-21,-1), hi=Math.max(...prev20.map(x=>x.high)),lo=Math.min(...prev20.map(x=>x.low));
 const breakoutLong=c.close>hi,breakoutShort=c.close<lo;
 const nearRes=Math.abs(c.close-resistance)/(A||1)<1.25,nearSup=Math.abs(c.close-support)/(A||1)<1.25;
 const rejectLong=wL>Math.max(body*1.35,A*.15)&&c.close>c.open, rejectShort=wU>Math.max(body*1.35,A*.15)&&c.close<c.open;
 const emaSlope=es.length>5?(e-es.at(-6))/(A||1):0;
 const regime=Math.abs(momentum)>2.8?'EXTREME VOLATILITY':Math.abs(momentum)>1.6?'HIGH VOLATILITY':Math.abs(momentum)<.35?'RANGE':'TREND';
 let long=0,short=0;
 long+=trend===1?20:0; short+=trend===-1?20:0;
 long+=emaSlope>0?10:0; short+=emaSlope<0?10:0;
 long+=momentum>0?Math.min(15,Math.max(0,momentum*7)):0; short+=momentum<0?Math.min(15,Math.max(0,-momentum*7)):0;
 long+=vol>=1.15?10:vol>=.8?5:0; short+=vol>=1.15?10:vol>=.8?5:0;
 long+=breakoutLong?20:rejectLong?10:nearSup?5:0; short+=breakoutShort?20:rejectShort?10:nearRes?5:0;
 long+=bull&&bodyPct>=.45?10:0; short+=bear&&bodyPct>=.45?10:0;
 if(regime==='RANGE'){long-=8;short-=8} if(regime==='EXTREME VOLATILITY'){long-=12;short-=12}
 long=Math.max(0,Math.min(100,long)); short=Math.max(0,Math.min(100,short));
 const score=Math.max(long,short), bias=long>=short+5?'LONG':short>=long+5?'SHORT':'NEUTRAL';
 const reasons=[];
 if(regime==='EXTREME VOLATILITY')reasons.push('volatilitas ekstrem');
 if(Math.abs(momentum)<.35)reasons.push('momentum lemah (warning)');
 if(vol<.65)reasons.push('volume relatif rendah (warning)');
 if(bias==='NEUTRAL')reasons.push('LONG/SHORT belum unggul');
 if(score<58)reasons.push('confidence rendah · warning saja');
 if(bias==='LONG'&&c.close<e)reasons.push('harga belum konfirmasi EMA20');
 if(bias==='SHORT'&&c.close>e)reasons.push('harga belum konfirmasi EMA20');
 // Entry mengikuti arah yang sedang berjalan, tanpa minimum confidence.
 // Score hanya ranking; bukan syarat masuk. Untuk LONG harus ada momentum naik,
 // untuk SHORT momentum turun. EMA berlawanan tetap menjadi pengaman arah.
 const directionOk=(bias==='LONG'&&momentum>0)||(bias==='SHORT'&&momentum<0);
 const hardBlock=(bias==='NEUTRAL'||!directionOk||(bias==='LONG'&&c.close<e)||(bias==='SHORT'&&c.close>e));
 const allowed=!hardBlock;
 const slDist=Math.max(A*.8,c.close*.004),rr=2,tpDist=slDist*rr;
 return {c,e,A,support,resistance,body,range,wU,wL,bodyPct,bull,bear,trend,momentum,vol,breakoutLong,breakoutShort,rejectLong,rejectShort,nearRes,nearSup,emaSlope,regime,longScore:long,shortScore:short,score,bias,reasons,allowed,slDist,tpDist,rr};
}
function analyze(){return analyzeData(candles)}
function intervalSec(){return 900}
function updateUI(){let a=analyze();if(!a)return;$('#lastPrice').textContent=fmtP(a.c.close);$('#ohlc').textContent=`O ${fmtP(a.c.open)} · H ${fmtP(a.c.high)} · L ${fmtP(a.c.low)} · C ${fmtP(a.c.close)}`;$('#candleDir').textContent=a.bull?'CANDLE BULLISH':a.bear?'CANDLE BEARISH':'DOJI';$('#candleDir').className='tag '+(a.bull?'up':a.bear?'down':'yellow');$('#ema').textContent=fmtP(a.e);$('#confidence').textContent=a.score.toFixed(0)+'%';$('#confidenceBar').style.width=a.score+'%';$('#bias').textContent=a.bias;$('#bias').className=a.bias==='LONG'?'up':a.bias==='SHORT'?'down':'yellow';$('#regime').textContent='REGIME '+a.regime;$('#noTrade').textContent=a.allowed?'AUTO ENTRY ✓':'NO TRADE';$('#noTrade').className='tag '+(a.allowed?'up':'down');$('#reason').textContent=`S/R ${fmtP(a.support)} / ${fmtP(a.resistance)} · ATR ${fmtP(a.A)} · Volume x${a.vol.toFixed(2)} · Wick U ${a.wU.toFixed(2)} / L ${a.wL.toFixed(2)}`;$('#engineScore').textContent=a.score.toFixed(0);$('#guardReasons').innerHTML=a.reasons.length?a.reasons.map(x=>`<div>⚠ ${x}</div>`).join(''):'<div class="up">✓ Guard conditions clear.</div>';let rem=a.c.time+intervalSec()-Date.now()/1000;$('#candleTimer').textContent='CLOSE '+Math.max(0,Math.floor(rem))+'s';let slPct=Number($('#slPct').value)/100,rr=Number($('#rr').value);let sl=a.bias==='SHORT'?a.c.close*(1+slPct):a.c.close*(1-slPct),tp=a.bias==='SHORT'?a.c.close*(1-slPct*rr):a.c.close*(1+slPct*rr);$('#slOut').textContent=fmtP(sl);$('#tpOut').textContent=fmtP(tp);if(hasValidPaperPosition())updatePosition(a.c.close);syncPaperStateUI(a)}
function initChart(){
 const host=$('#chart');
 if(!host)return;
 try{
  if(!window.LightweightCharts)throw new Error('Library chart belum termuat');
  chart=LightweightCharts.createChart(host,{autoSize:true,layout:{background:{color:'transparent'},textColor:'#8fa1b6'},grid:{vertLines:{color:'#132030'},horzLines:{color:'#132030'}},rightPriceScale:{borderColor:'#243448'},timeScale:{borderColor:'#243448',timeVisible:true,secondsVisible:false},crosshair:{mode:1}});
  series=chart.addCandlestickSeries({upColor:'#19d59a',downColor:'#ff5c72',borderUpColor:'#19d59a',borderDownColor:'#ff5c72',wickUpColor:'#19d59a',wickDownColor:'#ff5c72'});
  emaSeries=chart.addLineSeries({color:'#f4c44f',lineWidth:2});
  $('#conn').textContent='CHART READY · 15M';
 }catch(e){
  $('#conn').textContent='CHART LIB ERROR';
  log('Chart library error: '+e.message);
  host.innerHTML='<div style="height:100%;display:grid;place-items:center;color:#7f90a6;font-size:13px">Chart library gagal dimuat. Data tetap akan dicoba via fallback.</div>';
 }
 host.addEventListener('click',drawClick);
}
function redraw(){
 if(!candles.length)return;
 try{
  if(series&&emaSeries){
   series.setData(candles.map(c=>({time:c.time,open:c.open,high:c.high,low:c.low,close:c.close})));
   const ev=ema(candles.map(c=>c.close));
   emaSeries.setData(ev.map((v,i)=>({time:candles[i].time,value:v})));
   chart.timeScale().fitContent();
   renderTradeVisuals();
   if(srActive)drawSR();
  }
 }catch(e){log('Chart render error: '+e.message)}
 updateUI();
}
async function loadCandles(){
 let last='unknown';
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const r=await fetch(`/api/market/klines?symbol=${encodeURIComponent(symbol)}&attempt=${attempt}`,{cache:'no-store'});
   if(!r.ok){let msg=`Klines API ${r.status}`;try{const e=await r.json();msg=e.error||msg}catch{};throw new Error(msg)}
   const d=await r.json(); if(!Array.isArray(d)||!d.length)throw new Error('Klines kosong dari Binance');
   const next=d.map(x=>({time:Math.floor(Number(x[0])/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4],volume:+x[5]})).filter(x=>[x.time,x.open,x.high,x.low,x.close].every(Number.isFinite));
   if(next.length<30)throw new Error('Candle 15M kurang dari 30 bar');
   candles=next.slice(-150); redraw(); $('#conn').textContent='REST HISTORY LIVE · 15M'; return;
  }catch(e){last=e.message;await new Promise(r=>setTimeout(r,600*attempt));}
 }
 throw new Error(last);
}
let wsReconnectTimer=null, wsWatchdogTimer=null, wsGeneration=0, lastWsKlineAt=0;
function marketWsBase(){
  // Market data is public; keep the chart independent from trading/testnet credentials.
  return 'wss://fstream.binance.com/market/ws/';
}
function applyLiveKline(k){
  const c={time:Math.floor(Number(k.t)/1000),open:+k.o,high:+k.h,low:+k.l,close:+k.c,volume:+k.v};
  const i=candles.findIndex(x=>x.time===c.time);
  if(i>=0)candles[i]=c; else candles.push(c);
  if(candles.length>150)candles=candles.slice(-150);
  series.update({time:c.time,open:c.open,high:c.high,low:c.low,close:c.close});
  const ev=ema(candles.map(x=>x.close)).at(-1);
  if(Number.isFinite(ev))emaSeries.update({time:c.time,value:ev});
  updateUI();
  renderTradeVisuals();
  $('#conn').textContent='BINANCE WS LIVE';
}
function scheduleWsReconnect(gen){
  clearTimeout(wsReconnectTimer);
  wsReconnectTimer=setTimeout(()=>{if(gen===wsGeneration)connectWS()},1500);
}
function connectWS(){
 const gen=++wsGeneration; clearTimeout(wsReconnectTimer); clearInterval(wsWatchdogTimer); try{ws?.close()}catch{}
 // Binance USDⓈ-M Futures now routes regular market streams through /market/stream.
 // Kline is regular market data, so use the new endpoint instead of the retired legacy route.
 const stream=`${symbol.toLowerCase()}@kline_15m`;
 const url='wss://fstream.binance.com/market/stream?streams='+encodeURIComponent(stream);
 $('#conn').textContent='BINANCE WS CONNECTING';
 lastWsKlineAt=0;
 try{
  ws=new WebSocket(url);
  ws.onopen=()=>{
   if(gen!==wsGeneration)return;
   lastWsKlineAt=Date.now();
   $('#conn').textContent='BINANCE WS LIVE · 15M';
  };
  ws.onmessage=(ev)=>{
   if(gen!==wsGeneration)return;
   try{
    const m=JSON.parse(ev.data),payload=m.data||m;
    if(payload.e==='kline'&&payload.k){lastWsKlineAt=Date.now();applyLiveKline(payload.k)}
   }catch(e){}
  };
  ws.onerror=()=>{if(gen===wsGeneration)$('#conn').textContent='WS ERROR · REST LIVE';};
  ws.onclose=()=>{if(gen===wsGeneration){clearInterval(wsWatchdogTimer);$('#conn').textContent='WS RECONNECTING · REST LIVE';scheduleWsReconnect(gen)}};
  wsWatchdogTimer=setInterval(()=>{
   if(gen!==wsGeneration)return;
   if(ws?.readyState===1 && lastWsKlineAt && Date.now()-lastWsKlineAt>7000){
    $('#conn').textContent='WS STALE · RECONNECTING';
    try{ws.close()}catch{}
   }
  },2000);
 }catch(e){$('#conn').textContent='WS ERROR · REST LIVE';scheduleWsReconnect(gen)}
}
let pollBusy=false;
async function pollLiveCandle(){
 if(pollBusy||!candles.length)return; pollBusy=true;
 try{
  const r=await fetch(`/api/market/klines?symbol=${encodeURIComponent(symbol)}&live=1&_=${Date.now()}`,{cache:'no-store'});
  if(!r.ok)throw new Error('REST '+r.status);
  const d=await r.json(); if(!Array.isArray(d)||!d.length)throw new Error('empty');
  const x=d[d.length-1];
  applyLiveKline({t:x[0],o:x[1],h:x[2],l:x[3],c:x[4],v:x[5]});
  if(!ws||ws.readyState!==1)$('#conn').textContent='BINANCE REST LIVE · WS RETRY';
 }catch(e){if(!ws||ws.readyState!==1)$('#conn').textContent='MARKET DATA ERROR';}
 finally{pollBusy=false}
}

async function switchSymbol(s){if(s===symbol&&candles.length)return;try{drawings.forEach(x=>x.remove?.())}catch{} drawings=[]; tradeMarkers=tradeMarkers.filter(m=>m&&m.symbol===s); clearPositionVisuals(); symbol=s; $('#symbolTitle').textContent=s; lastSwitchAt=Date.now(); await loadCandles(); if(chart)chart.timeScale().fitContent(); renderTradeVisuals(); connectWS(); persist(); log('Pair → '+s)}
function drawSR(){drawings.forEach(x=>x.remove?.());drawings=[];let {support,resistance}=sr();for(const v of [support,resistance]){let l=chart.addLineSeries({color:'#4de1ff77',lineWidth:1,lineStyle:2,lastValueVisible:true,priceLineVisible:false});l.setData(candles.slice(-120).map(c=>({time:c.time,value:v})));drawings.push(l)}}
function drawClick(ev){if(tool==='none')return;let r=$('#chart').getBoundingClientRect(),x=ev.clientX-r.left,t=chart.timeScale().coordinateToTime(x),p=series.coordinateToPrice(ev.clientY-r.top);if(!t||p==null)return;drawings.push({x,p});if(drawings.length<2)return;let a=drawings.at(-2),b=drawings.at(-1),t1=chart.timeScale().coordinateToTime(a.x),t2=chart.timeScale().coordinateToTime(b.x);let l=chart.addLineSeries({color:tool==='fib'?'#f4c44f':'#63a8ff',lineWidth:2});l.setData([{time:t1,value:a.p},{time:t2,value:b.p}]);drawings.push(l);if(tool==='fib'){[.236,.382,.5,.618,.786].forEach(r=>{let f=chart.addLineSeries({color:'#f4c44f55',lineWidth:1,lineStyle:2});f.setData([{time:t1,value:a.p+(b.p-a.p)*r},{time:t2,value:a.p+(b.p-a.p)*r}]);drawings.push(f)})}tool='none';$$('[data-tool]').forEach(x=>x.classList.remove('active'));$('[data-tool="none"]').classList.add('active')}
function currentPaperPnl(price){if(!hasValidPaperPosition())return 0;const p=paperPos,dir=p.side==='BUY'?1:-1,raw=(price-p.entry)*p.qty*dir,fee=(Math.abs(p.entry*p.qty)+Math.abs(price*p.qty))*Number($('#fee').value)/100,slip=Math.abs(price*p.qty)*Number($('#slippage').value)/100;return (raw-fee-slip)*IDR}
function lossExitReason(current,best){
 if(!hasValidPaperPosition()||!$('#autoRotate')?.checked)return null;
 const p=paperPos,price=current?.c?.close||p.entry,pnl=currentPaperPnl(price);
 const maxLoss=Number(p.hardLoss||riskBudgetIDR(Number(p.margin)||paperMargin()));
 const sameBias=current?.bias===(p.side==='BUY'?'LONG':'SHORT');
 const currentValid=hunterAllowed(current)&&sameBias;
 const better=best&&best.symbol!==p.symbol&&hunterAllowed(best)&&(best.opportunity||best.score)>=((current?.score||0)+HUNTER.switchAdvantage);
 const lossSwitchThreshold=Math.max(0,maxLoss*0.20);
 const givebackPct=Math.min(100,Math.max(1,Number($('#profitGiveback').value)||10))/100;
 const peak=Number(p.peakPnl||0);
 if(peak>0&&pnl>0&&pnl<=peak*(1-givebackPct))return `PROFIT GIVEBACK ${fmtIDR(peak-pnl)} · ${((peak-pnl)/peak*100).toFixed(1)}% dari peak`;
 if(pnl<0&&Math.abs(pnl)>=lossSwitchThreshold)return `LOSS ROTATE · ${fmtIDR(pnl)} · cari pair lain`;
 if(pnl<0&&!currentValid)return `SIGNAL INVALID · ${current?.bias||'NO SIGNAL'} ${current?.score?.toFixed?.(0)||0}%`;
 if(pnl<0&&better)return `BETTER PAIR · ${best.symbol} ${best.score.toFixed(0)}%`;
 return null;
}
function opportunityScore(a,x){
 if(!a||a.bias==='NEUTRAL')return -Infinity;
 const dir=a.bias==='LONG'?1:-1;
 const momentum=Math.max(0,Math.min(20,Math.abs(a.momentum)*7));
 const ema=a.bias==='LONG'?(a.c.close>=a.e?14:0):(a.c.close<=a.e?14:0);
 const candle=(a.bias==='LONG'&&a.bull?10:0)+(a.bias==='SHORT'&&a.bear?10:0);
 const breakout=(a.bias==='LONG'&&a.breakoutLong?22:0)+(a.bias==='SHORT'&&a.breakoutShort?22:0);
 const volume=Math.max(0,Math.min(12,(a.vol||0)*5));
 const slope=(a.bias==='LONG'&&a.emaSlope>0?8:0)+(a.bias==='SHORT'&&a.emaSlope<0?8:0);
 const move=Math.max(0,Math.min(14,Math.abs(Number(x?.change||0))*0.8));
 const extreme=a.regime==='EXTREME VOLATILITY'?-18:0;
 return momentum+ema+candle+breakout+volume+slope+move+extreme;
}
function hunterAllowed(a){
 if(!a||!Number.isFinite(a.score)||a.bias==='NEUTRAL')return false;
 const directionOk=(a.bias==='LONG'&&a.momentum>0)||(a.bias==='SHORT'&&a.momentum<0);
 if(!directionOk)return false;
 if(a.regime==='EXTREME VOLATILITY')return false;
 if(a.bias==='LONG'&&a.c.close<a.e)return false;
 if(a.bias==='SHORT'&&a.c.close>a.e)return false;
 return true;
}
async function executeBestOpportunity(rankedAll){
 const now=Date.now();
 const viable=rankedAll.filter(x=>hunterAllowed(x)&&!(Number(lossCooldowns[x.symbol]||0)>now));
 viable.forEach(x=>x.opportunity=opportunityScore(x.analysis,x));
 viable.sort((a,b)=>b.opportunity-a.opportunity);
 const best=viable[0]||null;
 const active=hasValidPaperPosition();
 const current=active?analyze():null;
 const currentScore=current?.score||0;
 const currentSymbol=paperPos?.symbol||symbol;
 const currentCandidate=viable.find(x=>x.symbol===currentSymbol)||null;
 if(active){
   const pnl=currentPaperPnl(current?.c?.close||paperPos.entry);
   const bestOther=viable.find(x=>x.symbol!==currentSymbol)||null;
   const currentOpportunity=currentCandidate?.opportunity||0;
   const superior=bestOther&&bestOther.opportunity>=currentOpportunity+HUNTER.switchAdvantage;
   const peak=Number(paperPos.peakPnl||0);
   const givebackPct=Math.min(100,Math.max(1,Number($('#profitGiveback').value)||10))/100;
   const giveback=peak>0&&pnl>0&&pnl<=peak*(1-givebackPct);
   const hardLoss=Number(paperPos.hardLoss||riskBudgetIDR(Number(paperPos.margin)||paperMargin()));
   const currentValid=hunterAllowed(current);
   const rotateLoss=pnl<0&&(Math.abs(pnl)>=Math.max(0,hardLoss*0.20)||!currentValid||superior);
   const exitReason=giveback?'PROFIT GIVEBACK':rotateLoss?'BEST PAIR / LOSS ROTATE':null;
   if(exitReason && (bestOther||giveback)){
     const old=paperPos.symbol;
     const isGiveback=exitReason==='PROFIT GIVEBACK';
     let target=isGiveback&&currentCandidate&&(!bestOther||currentCandidate.opportunity>=bestOther.opportunity-HUNTER.switchAdvantage)?currentCandidate:bestOther;
     if(target){
       closePaper(current?.c.close||paperPos.entry,pnl,isGiveback?'PROFIT GIVEBACK':'AUTO ROTATE');
       if(pnl<0){lossCooldowns[old]=Date.now()+LOSS_REENTRY_COOLDOWN_MS;persist()}
       await switchSymbol(target.symbol);
       const fresh=analyze();
       if(fresh&&hunterAllowed(fresh)&&fresh.bias===target.bias){
         if(openPaper(fresh.bias==='LONG'?'BUY':'SELL',fresh)){
           $('#scanState').textContent=`BEST → ${target.symbol} · ${fresh.bias} · ENTRY`;
           log(`BEST PAIR ROTATE+ENTRY → ${old} → ${target.symbol} · ${fresh.bias} · opp ${target.opportunity.toFixed(1)}`);
         }
       }
       return;
     }
   }
   $('#scanState').textContent=`HOLD ${currentSymbol} · ${fmtIDR(pnl)} · BEST ${best?.symbol||'—'}`;
   return;
 }
 if(!best){
   $('#scanState').textContent='HUNTING · cari arah 15M';
   return;
 }
 // Flat: the best pair switch and entry are ONE atomic hunting action.
 if(best.symbol!==symbol){
   const from=symbol;
   await switchSymbol(best.symbol);
   const fresh=analyze();
   if(fresh&&hunterAllowed(fresh)&&fresh.bias===best.bias){
     if(openPaper(fresh.bias==='LONG'?'BUY':'SELL',fresh)){
       lastHunterSymbol=best.symbol; lastHunterCandle=fresh.c.time;
       $('#scanState').textContent=`BEST ${best.symbol} · ${fresh.bias} · ENTRY`;
       log(`BEST PAIR SWITCH+ENTRY → ${from} → ${best.symbol} · ${fresh.bias} @ ${fmtP(fresh.c.close)}`);
     }
   }
 }else{
   const fresh=analyze();
   if(fresh&&hunterAllowed(fresh)&&openPaper(fresh.bias==='LONG'?'BUY':'SELL',fresh)){
     lastHunterSymbol=best.symbol; lastHunterCandle=fresh.c.time;
     $('#scanState').textContent=`BEST ${best.symbol} · ${fresh.bias} · ENTRY`;
     log(`BEST PAIR ENTRY → ${best.symbol} · ${fresh.bias} @ ${fmtP(fresh.c.close)}`);
   }
 }
}
async function scan(){
 if(hunterBusy)return; hunterBusy=true;
 try{
  const d=await getScannerTicker();
  const liquid=d.filter(x=>x.symbol?.endsWith('USDT')&&!x.symbol.includes('_')&&+x.quoteVolume>2e6&&x.symbol!=='USDCUSDT');
  const sorted=[...liquid].sort((a,b)=>Math.abs(+b.priceChangePercent)-Math.abs(+a.priceChangePercent));
  const volume=[...liquid].sort((a,b)=>+b.quoteVolume-+a.quoteVolume);
  const universe=[...new Map([...sorted.slice(0,30),...volume.slice(0,30)].map(x=>[x.symbol,x])).values()].slice(0,HUNTER.candidateCount);
  $('#symbols').innerHTML=universe.map(x=>`<div class="sym ${x.symbol===symbol?'active':''}" data-s="${x.symbol}"><div><b>${x.symbol}</b><div class="muted">Vol ${(Number(x.quoteVolume)/1e6).toFixed(1)}M</div></div><b class="${+x.priceChangePercent>=0?'up':'down'}">${+x.priceChangePercent>=0?'+':''}${(+x.priceChangePercent).toFixed(2)}%</b></div>`).join('');
  $$('.sym').forEach(e=>e.onclick=()=>switchSymbol(e.dataset.s));
  $('#scanState').textContent='SCANNING 15M';
  if(auto&&!killed&&mode==='paper'&&Date.now()-lastSwitchAt>=HUNTER.cooldownMs){
   const rankedAll=[];
   const results=await Promise.allSettled(universe.map(async x=>{
    const now=Date.now(),cached=scanKlineCache.get(x.symbol);
    let cs=cached&&now-cached.at<HUNTER.klinesCacheMs?cached.cs:null;
    if(!cs){
      try{
       const q=await fetch(`/api/market/klines?symbol=${x.symbol}&limit=90&_=${now}`,{cache:'no-store'});
       if(!q.ok)throw Error(`Kline ${q.status}`);
       const kd=await q.json();
       if(!Array.isArray(kd)||kd.length<25)throw Error('Kline kosong');
       cs=kd.map(k=>({time:Math.floor(k[0]/1000),open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5]}));
       scanKlineCache.set(x.symbol,{at:now,cs});
      }catch(err){const stale=scanKlineCache.get(x.symbol);if(stale?.cs?.length>=25)cs=stale.cs;else return null;}
    }
    const a=analyzeData(cs); if(!a)return null;
    return {symbol:x.symbol,score:a.score,bias:a.bias,analysis:a,change:+x.priceChangePercent,volume:+x.quoteVolume,allowed:hunterAllowed(a)};
   }));
   results.forEach(r=>{if(r.status==='fulfilled'&&r.value)rankedAll.push(r.value)});
   await executeBestOpportunity(rankedAll);
   $('#scanState').title=`${rankedAll.length}/${universe.length} pair dianalisis`;
  }
 }catch(e){log('Scanner degraded: '+e.message);$('#scanState').textContent='HUNTING · data retry';}
 finally{hunterBusy=false}
}
let fastHunterBusy=false;async function maybeFastHunter(){
 if(fastHunterBusy||!auto||killed||mode!=='paper'||hasValidPaperPosition())return;
 fastHunterBusy=true;try{const a=analyze();if(hunterAllowed(a)&&openPaper(a.bias==='LONG'?'BUY':'SELL',a)){lastHunterCandle=a.c.time;log(`FAST 15M ENTRY → ${symbol} ${a.bias}`)}}finally{fastHunterBusy=false}
}
function guard(){if(killed)return['kill switch aktif'];if(hasValidPaperPosition()&&Number($('#maxPos').value)<=1)return['sudah ada posisi aktif'];if(dailyPnl<=-(accountEquity*Number($('#dailyLoss').value)/100))return['daily loss limit tercapai'];let a=analyze();return a&&!a.allowed?a.reasons:[]}
function riskBudgetIDR(margin){const riskPct=Math.max(0,Number($('#risk').value)||0)/100;const floatPct=Math.max(0,Number($('#maxFloatLoss').value)||0)/100;const riskCap=margin*riskPct;const floatCap=margin*floatPct;return floatCap>0?Math.min(riskCap||floatCap,floatCap):riskCap}
function positionSize(price,sl){let risk=accountEquity*Number($('#risk').value)/100;let dist=Math.abs(price-sl);return dist?risk/dist:Number($('#qty').value)}
function openPaper(side,forcedAnalysis=null){
  if(hasValidPaperPosition()){syncPaperStateUI();log(`ENTRY BLOCKED: sudah ada posisi ${paperPos.side} ${paperPos.symbol}`);return false}
  let g=guard();
  if(g.length){log('ENTRY BLOCKED: '+g.join(', '));let el=$('#engineStatus');if(el){el.className='dangerbox';el.textContent='NO TRADE · '+g.join(', ')}return false}
  let a=forcedAnalysis||analyze();if(!a)return false;
  let risk=Number($('#risk').value)/100,rr=Number($('#rr').value),p=a.c.close,margin=mode==='paper'?paperMargin():0,leverage=mode==='paper'?paperLeverage():Number($('#lev').value)||1,notional=mode==='paper'?margin*leverage:0,qty=mode==='paper'?(notional/IDR)/Math.max(p,0.00000001):Math.max(0.000001,Number($('#qty').value)||positionSize(p,p));
  if(mode==='paper'&&margin>accountEquity+paperPnl){log(`ENTRY BLOCKED: margin ${fmtIDR(margin)} melebihi available balance`);syncPaperStateUI(a);return false;}
  const hardLoss=riskBudgetIDR(margin);
  const priceRiskDist=mode==='paper'&&qty>0&&hardLoss>0?hardLoss/(qty*IDR):p*(Number($('#slPct').value)/100);
  const sl=side==='BUY'?p-priceRiskDist:p+priceRiskDist;
  const tp=side==='BUY'?p+priceRiskDist*rr:p-priceRiskDist*rr;
  if((side==='BUY'&&(sl>=p||tp<=p))||(side==='SELL'&&(sl<=p||tp>=p))){log('ENTRY BLOCKED: SL/TP tidak valid');$('#engineStatus').className='dangerbox';$('#engineStatus').textContent='NO TRADE · SL/TP tidak valid';return false}
  paperPos={symbol,side,entry:p,qty,sl,tp,initialSL:sl,be:false,partial:false,trail:false,opened:Date.now(),risk,margin,leverage,notional,hardLoss,entryCandleTime:a.c.time,entryScore:a.score,entryBias:a.bias,peakPnl:0,negativeScans:0};
  addTradeMarker('entry',paperPos); renderTradeVisuals(); persist(); syncPaperStateUI(a); log(`AUTO/ PAPER ${side} ${symbol} · ENTRY ${fmtTradeP(p)} · MARGIN ${fmtIDR(margin)} · ${leverage}x · MAX LOSS ${fmtIDR(hardLoss)} · SL ${fmtTradeP(sl)} · TP ${fmtTradeP(tp)} · SCORE ${a.score.toFixed(0)}%`); return true;
}
function renderPosition(pnl=0){if(!hasValidPaperPosition()){$('#position').innerHTML='<div class="muted">Tidak ada posisi.</div>';return}let p=paperPos;$('#position').innerHTML=`<div class="grid3"><div class="metric"><span class="muted">Side</span><b class="${p.side==='BUY'?'up':'down'}">${p.side} ${p.symbol}</b></div><div class="metric"><span class="muted">Entry</span><b>${fmtTradeP(p.entry)}</b></div><div class="metric"><span class="muted">Qty</span><b>${p.qty.toFixed(6)}</b></div></div><div class="grid3" style="margin-top:7px"><div class="metric"><span class="muted">Margin</span><b>${fmtIDR(p.margin||0)}</b></div><div class="metric"><span class="muted">Leverage</span><b>${Number(p.leverage||1)}x</b></div><div class="metric"><span class="muted">Position Size</span><b>${fmtIDR(p.notional||0)}</b></div></div><div class="grid3" style="margin-top:7px"><div class="metric"><span class="muted">SL</span><b>${fmtTradeP(p.sl)}</b></div><div class="metric"><span class="muted">TP</span><b>${fmtTradeP(p.tp)}</b></div><div class="metric"><span class="muted">PnL</span><b class="${pnl>=0?'up':'down'}">${fmtIDR(pnl)}</b></div></div><div class="kv"><span>BE / Partial / Trail</span><b>${p.be?'ON':'OFF'} / ${p.partial?'ON':'OFF'} / ${p.trail?'ON':'OFF'}</b></div><div class="kv"><span>Peak Profit / Giveback</span><b>${fmtIDR(p.peakPnl||0)} / ${Number($('#profitGiveback')?.value||10)}%</b></div>`}

function renderPerformance(unrealized=0){const n=tradeHistory.length,w=tradeStats.wins,l=tradeStats.losses,net=paperPnl,grossWin=tradeHistory.filter(x=>x.pnl>0).reduce((a,x)=>a+x.pnl,0),grossLoss=Math.abs(tradeHistory.filter(x=>x.pnl<0).reduce((a,x)=>a+x.pnl,0));$('#perfTrades').textContent=n;$('#perfWin').textContent=(n?((w/n)*100).toFixed(1):'0')+'%';$('#perfNet').textContent=fmtIDR(net);$('#perfPF').textContent=grossLoss?(grossWin/grossLoss).toFixed(2):'—';$('#perfBest').textContent=fmtIDR(n?Math.max(...tradeHistory.map(x=>x.pnl)):0);$('#perfWorst').textContent=fmtIDR(n?Math.min(...tradeHistory.map(x=>x.pnl)):0);$('#perfStreak').textContent=lossStreak;$('#perfLive').textContent=hasValidPaperPosition()?`Posisi ${paperPos.side} ${paperPos.symbol} · Entry ${fmtTradeP(paperPos.entry)} · Unrealized ${fmtIDR(unrealized)}`:'Posisi aktif: belum ada';if(n){const rows=tradeHistory.slice(-5).reverse().map(x=>`<div class="log"><b>${x.symbol} ${x.side}</b> · ${fmtIDR(x.pnl)} · ${x.result} · ${new Date(x.time).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</div>`).join('');$('#perfHistory').innerHTML=rows}else $('#perfHistory').textContent='Belum ada trade yang ditutup.'}
function paperMargin(){return Math.max(0,Number($('#margin').value)||DEFAULT_PAPER_MARGIN_IDR)}
function paperLeverage(){return Math.max(1,Number($('#lev').value)||DEFAULT_LEVERAGE)}
function paperNotional(){return paperMargin()*paperLeverage()}
function renderPaperOrderPreview(){const m=paperMargin(),lev=paperLeverage(),notional=paperNotional(),hard=riskBudgetIDR(m);$('#marginOut').textContent=fmtIDR(m);$('#positionSizeOut').textContent=fmtIDR(notional);if($('#hardLossOut'))$('#hardLossOut').textContent=fmtIDR(hard);if(hasValidPaperPosition())return;let a=analyze();if(a){let sp=Number($('#slPct').value)/100,rr=Number($('#rr').value),p=a.c.close,sl=a.bias==='SHORT'?p*(1+sp):p*(1-sp),tp=a.bias==='SHORT'?p*(1-sp*rr):p*(1+sp*rr);$('#slOut').textContent=fmtP(sl);$('#tpOut').textContent=fmtP(tp)}}
function updatePaperAccount(unrealized=0){const balance=accountEquity+paperPnl,usedMargin=hasValidPaperPosition()?Number(paperPos.margin||0):0;$('#acctStatus').textContent='PAPER';$('#balance').textContent=fmtIDR(balance);$('#available').textContent=fmtIDR(Math.max(0,balance-usedMargin));$('#unrealized').textContent=fmtIDR(unrealized);$('#paperPnl').textContent=fmtIDR(paperPnl);renderPerformance(unrealized)}
function updatePosition(price){
 if(!paperPos)return;
 let p=paperPos,dir=p.side==='BUY'?1:-1,raw=(price-p.entry)*p.qty*dir,fee=(Math.abs(p.entry*p.qty)+Math.abs(price*p.qty))*Number($('#fee').value)/100,slip=Math.abs(price*p.qty)*Number($('#slippage').value)/100,pnlIDR=(raw-fee-slip)*IDR;
 const hardLoss=Math.max(0,Number(p.hardLoss||riskBudgetIDR(Number(p.margin)||paperMargin())));
 let r=Math.abs(p.entry-p.initialSL)*p.qty;
 if(pnlIDR>Number(p.peakPnl||0))p.peakPnl=pnlIDR;
 if(!p.be&&raw>=r*1){p.sl=p.entry*(p.side==='BUY'?1.0002:.9998);p.be=true;log('SL PLUS → BREAK EVEN')}
 if(p.trail&&raw>r*1.5){let t=atr()*0.8;p.sl=p.side==='BUY'?Math.max(p.sl,price-t):Math.min(p.sl,price+t)}
 renderPosition(pnlIDR);updatePaperAccount(pnlIDR);renderTradeVisuals();
 // HARD LOSS: risk/trade is measured from the selected margin, never from account equity.
 // In PAPER mode the exit is clamped to the exact risk budget so a delayed poll cannot turn -Rp3.750 into -Rp74.780.
 if(hardLoss>0 && pnlIDR<=-hardLoss){
   log(`HARD LOSS GUARD → ${p.symbol} ${fmtIDR(pnlIDR)} · limit ${fmtIDR(-hardLoss)}`);
   lossCooldowns[p.symbol]=Date.now()+LOSS_REENTRY_COOLDOWN_MS;
   closePaper(price,-hardLoss,'HARD RISK LIMIT');
   persist();
   return;
 }
 // Profit protection is checked on EVERY live tick.
 const givebackPct=Math.min(100,Math.max(1,Number($('#profitGiveback').value)||10))/100;
 const peak=Number(p.peakPnl||0);
 const givebackHit=$('#autoRotate')?.checked && peak>0 && pnlIDR>0 && pnlIDR<=peak*(1-givebackPct);
 if(givebackHit){
   const locked=pnlIDR;
   log(`PROFIT LOCK LIVE → ${p.symbol} peak ${fmtIDR(peak)} → ${fmtIDR(locked)} · giveback ${((peak-locked)/peak*100).toFixed(1)}%`);
   closePaper(price,locked,'PROFIT GIVEBACK');
   return;
 }
 let hit=p.side==='BUY'?(price<=p.sl||price>=p.tp):(price>=p.sl||price<=p.tp);
 if(hit){
   const stopHit=p.side==='BUY'?price<=p.sl:price>=p.sl;
   closePaper(price,stopHit&&hardLoss>0?-hardLoss:pnlIDR,stopHit?'SL/TP':'SL/TP');
 }
}
function closePaper(price=(analyze()?.c.close||paperPos?.entry),pnlOverride=null,reason='MANUAL'){if(!hasValidPaperPosition())return;let p=paperPos,dir=p.side==='BUY'?1:-1,pnl=pnlOverride??((price-p.entry)*p.qty*dir*IDR);dailyPnl+=pnl;paperPnl+=pnl;tradeHistory.push({time:Date.now(),symbol:p.symbol,side:p.side,pnl,result:pnl>=0?'WIN':'LOSS',reason});if(tradeHistory.length>100)tradeHistory=tradeHistory.slice(-100);$('#paperPnl').textContent=fmtIDR(paperPnl);$('#dailyLossOut').textContent=fmtIDR(dailyPnl);if(pnl<0){lossStreak++;tradeStats.losses++}else{lossStreak=0;tradeStats.wins++}$('#lossStreak').textContent=lossStreak;log(`PAPER EXIT ${p.symbol} · ${p.side} · EXIT ${fmtTradeP(price)} · ${fmtIDR(pnl)} · ${reason}`); tradeMarkers.push({symbol:p.symbol,time:Math.floor(Number(analyze()?.c?.time||paperPos?.entryCandleTime||Date.now()/1000)),position:p.side==='BUY'?'aboveBar':'belowBar',color:pnl>=0?'#19d59a':'#ff5c72',shape:'circle',text:`EXIT ${fmtTradeP(price)}`}); if(tradeMarkers.length>50)tradeMarkers=tradeMarkers.slice(-50); paperPos=null; clearPositionVisuals(); renderTradeVisuals(); persist(); renderPosition(); updatePaperAccount(0); let a=analyze(); syncPaperStateUI(a)}
async function submitOrder(side){if(mode==='paper'){openPaper(side);return}if(killed){alert('Kill switch aktif.');return}let g=guard();if(g.length){alert('ENTRY DIBLOKIR: '+g.join(', '));return}let a=analyze(),sp=Number($('#slPct').value)/100,rr=Number($('#rr').value),p=a.c.close,sl=side==='BUY'?p*(1-sp):p*(1+sp),tp=side==='BUY'?p*(1+sp*rr):p*(1-sp*rr),q=Number($('#qty').value);if(!confirm(`${mode.toUpperCase()} ${side} ${symbol}\nEntry ~ ${fmtP(p)}\nSL ${fmtP(sl)}\nTP ${fmtP(tp)}\nKirim order?`))return;try{let endpoint=mode==='testnet'?'/api/bracket-order':'/api/bracket-order';let r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol,side,quantity:q,stopPrice:sl,takeProfitPrice:tp})});let d=await r.json();if(!r.ok)throw Error(d.error||'Order gagal');log(`${mode.toUpperCase()} ${side} ${symbol} entry ${d.entry?.orderId||'ok'} + bracket SL/TP`);await account()}catch(e){log('ORDER ERROR: '+e.message);alert(e.message)}}
async function closePosition(){if(mode==='paper'){closePaper();return}let d=await (await fetch('/api/account')).json();let p=(d.positions||[]).find(x=>x.symbol===symbol&&Number(x.positionAmt)!==0);if(!p){alert('Tidak ada posisi Binance untuk pair ini.');return}if(!confirm('Tutup posisi '+symbol+' sekarang?'))return;let side=Number(p.positionAmt)>0?'SELL':'BUY';try{let r=await fetch('/api/close',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol,side,quantity:Math.abs(Number(p.positionAmt))})});let x=await r.json();if(!r.ok)throw Error(x.error||'Close gagal');log('LIVE/TESTNET position closed');await account()}catch(e){alert(e.message)}}
async function account(){if(mode==='paper'){updatePaperAccount(hasValidPaperPosition()?0:0);return }try{let d=await(await fetch('/api/account')).json();if(!d.connected){$('#acctStatus').textContent='NOT CONFIGURED';return}$('#acctStatus').textContent='CONNECTED';accountEquity=+d.account.walletBalance*IDR;$('#balance').textContent=fmtIDR(accountEquity);$('#available').textContent=fmtIDR(+d.account.availableBalance*IDR);$('#unrealized').textContent=fmtIDR(+d.account.unrealizedProfit*IDR)}catch(e){log('Account error: '+e.message)}}
function setMode(){mode=$('#orderMode').value;$('#mode').textContent=mode.toUpperCase()+' · 15M';$('#liveWarning').className=mode==='live'?'dangerbox':mode==='testnet'?'warning':'goodbox';$('#liveWarning').textContent=mode==='live'?'LIVE AKTIF hanya jika server ALLOW_LIVE_TRADING=true.':mode==='testnet'?'TESTNET: gunakan API Testnet, bukan API production.':'PAPER: tidak ada order sungguhan.';account()}
function runBacktest(){let n=Math.min(Number($('#btLimit').value),candles.length-25),risk=Number($('#btRisk').value),rr=Number($('#btRR').value),start=candles.length-n,equity=0,peak=0,maxDD=0,wins=0,losses=0,net=0,worst=0,streak=0,best=-Infinity;for(let i=start+20;i<candles.length-1;i++){let sub=candles.slice(0,i+1),old=candles; candles=sub;let a=analyze();candles=old;if(!a)continue;let signal=$('#btStrategy').value==='reversal'?(a.wick===1?'LONG':a.wick===-1?'SHORT':null):a.bias==='LONG'?'LONG':a.bias==='SHORT'?'SHORT':null;if(!signal||!a.allowed)continue;let entry=candles[i].close,slPct=Number($('#slPct').value)/100,sl=signal==='LONG'?entry*(1-slPct):entry*(1+slPct),tp=signal==='LONG'?entry*(1+slPct*rr):entry*(1-slPct*rr),out=null;for(let j=i+1;j<candles.length;j++){let c=candles[j];if(signal==='LONG'){if(c.low<=sl){out=-1;break}if(c.high>=tp){out=rr;break}}else{if(c.high>=sl){out=-1;break}if(c.low<=tp){out=rr;break}}}if(out===null)continue;net+=out;equity+=out*risk;best=Math.max(best,out);if(out>0){wins++;streak=0}else{losses++;streak++;worst=Math.max(worst,streak)}peak=Math.max(peak,equity);maxDD=Math.max(maxDD,peak-equity)}let trades=wins+losses,pf=losses?wins*rr/losses:Infinity;$('#btTrades').textContent=trades;$('#btWin').textContent=trades?(wins/trades*100).toFixed(1)+'%':'—';$('#btPF').textContent=Number.isFinite(pf)?pf.toFixed(2):'∞';$('#btDD').textContent=maxDD.toFixed(2)+'%';$('#btNet').textContent=net.toFixed(2)+'R';$('#btStreak').textContent=worst;$('#btBest').textContent=best===-Infinity?'—':best.toFixed(2)+'R';$('#btSummary').textContent=trades?`Hasil simulasi 15M: ${trades} trade, ${wins} win, ${losses} loss. Consecutive loss terburuk ${worst}. Gunakan hasil ini untuk mengukur robustness, bukan jaminan hasil masa depan.`:'Tidak ada setup valid pada periode tersebut.';log('Backtest selesai: '+trades+' trades')}
$$('[data-tool]').forEach(b=>b.onclick=()=>{$$('[data-tool]').forEach(x=>x.classList.remove('active'));b.classList.add('active');tool=b.dataset.tool});$('#srBtn').onclick=()=>{srActive=!srActive;$('#srBtn').classList.toggle('active',srActive);if(srActive)drawSR();else{drawings.forEach(x=>x.remove?.());drawings=[]}};$('#clearDraw').onclick=()=>{drawings.forEach(x=>x.remove?.());drawings=[]};$('#buyBtn').onclick=()=>submitOrder('BUY');$('#sellBtn').onclick=()=>submitOrder('SELL');$('#closeBtn').onclick=closePosition;$('#beBtn').onclick=()=>{if(paperPos){paperPos.sl=paperPos.entry*(paperPos.side==='BUY'?1.0002:.9998);paperPos.be=true;renderPosition();log('Manual SL Plus / BE')}};$('#partialBtn').onclick=()=>{if(paperPos&&!paperPos.partial){paperPos.qty*=.5;paperPos.partial=true;log('Partial TP: 50% size dikunci')}};$('#trailBtn').onclick=()=>{if(paperPos){paperPos.trail=!paperPos.trail;log('Trailing '+(paperPos.trail?'ON':'OFF'))}};$('#orderMode').onchange=setMode;['margin','lev','risk','slPct','rr','maxFloatLoss','profitGiveback','negativeScans'].forEach(id=>{const el=$('#'+id);if(el){el.addEventListener('input',()=>{renderPaperOrderPreview();persist();});el.addEventListener('change',()=>{renderPaperOrderPreview();persist();});}});$('#accountBtn').onclick=account;$('#refreshScan').onclick=scan;$('#autoToggle').onclick=()=>{auto=!auto;$('#autoToggle').textContent=auto?'AUTO ON':'AUTO OFF'};$('#killBtn').onclick=()=>{killed=!killed;$('#killBtn').textContent='KILL SWITCH: '+(killed?'ON':'OFF');$('#killBtn').classList.toggle('active',killed);if(killed)log('KILL SWITCH AKTIF — auto entry diblokir')};$('#runBacktest').onclick=runBacktest;
(async()=>{initChart();restore();renderPaperOrderPreview();$('#symbolTitle').textContent=symbol;try{await loadCandles();connectWS();renderPosition();await scan();log('System ready · 15M only · PAPER default · safety gates active')}catch(e){log('Init error: '+e.message)}setInterval(updateUI,1000);setInterval(pollLiveCandle,1000);setInterval(scan,HUNTER.scanMs)})();
