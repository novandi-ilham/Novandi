from pathlib import Path
p=Path('/mnt/data/v60fixwork/public/index.html')
s=p.read_text()
# UI: add risk live state inside Risk Guard panel
old='<div class="kv"><span>Daily loss</span><b id="dailyLossOut">Rp 0</b></div><div class="kv"><span>Consecutive loss</span><b id="lossStreak">0</b></div>'
new='<div id="riskState" class="goodbox" style="margin-top:8px">🟢 RISK GUARD ARMED · tick live</div><div class="kv"><span>Daily loss</span><b id="dailyLossOut">Rp 0</b></div><div class="kv"><span>Consecutive loss</span><b id="lossStreak">0</b></div><div class="kv"><span>Tick age</span><b id="tickAge">—</b></div>'
s=s.replace(old,new)
# improve mobile CSS by append overrides before </style>
marker='</style></head>'
css='''<style>
/* V61 realtime/mobile polish */
.risk-live{border-radius:9px;padding:9px;margin-top:8px;font-weight:700}.risk-live.ok{border:1px solid #176c53;background:#0a2b22;color:#b8ffe9}.risk-live.warn{border:1px solid #765f25;background:#2c2410;color:#ffe6a0}.risk-live.danger{border:1px solid #7c2938;background:#32131a;color:#ffb3bf}
@media(pointer:coarse) and (max-width:820px){.top{position:sticky;padding:7px 8px}.status{width:100%;justify-content:flex-start}.status .mode,.status #conn{font-size:10px}.wrap{padding:6px}.chartbox{height:48vh;min-height:330px;max-height:560px}.overlay{gap:4px}.tag{padding:4px 6px;font-size:10px}.charttools{gap:4px}.charttools .btn{min-height:36px;padding:7px}.tradegrid .btn{min-height:44px}.metric b{font-size:14px}.phead{font-size:12px}.pbody{padding:8px}.symbols{max-height:210px}.form{gap:6px}.form input,.form select{min-height:40px}.edu{display:block}.edu .card{margin-bottom:6px}}
</style>'''
s=s.replace(marker,css+marker)
# replace renderTradeVisuals with non-recursive renderer
start=s.index('function renderTradeVisuals(){')
end=s.index('\nfunction addTradeMarker', start)
new_func='''function renderTradeVisuals(){
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
'''
s=s[:start]+new_func+s[end:]
# persist/restore state version + killed/auto lock
s=s.replace("localStorage.setItem('ilhamPaperStateV58'", "localStorage.setItem('ilhamPaperStateV61'")
s=s.replace("localStorage.getItem('ilhamPaperStateV58'", "localStorage.getItem('ilhamPaperStateV61'")
old_p="{date:new Date().toISOString().slice(0,10),symbol,paperPos,paperPnl,dailyPnl,lossStreak,tradeStats,tradeHistory,tradeMarkers,symbolLosses,symbolCooldowns,symbolLossStreaks,margin:+$('#margin').value||DEFAULT_PAPER_MARGIN_IDR,leverage:+$('#lev').value||DEFAULT_LEVERAGE,maxFloatLoss:+$('#maxFloatLoss').value||0.2,profitGiveback:+$('#profitGiveback').value||10,negativeScans:+$('#negativeScans').value||3,autoRotate:$('#autoRotate').checked}"
new_p="{date:new Date().toISOString().slice(0,10),symbol,paperPos,paperPnl,dailyPnl,lossStreak,tradeStats,tradeHistory,tradeMarkers,symbolLosses,symbolCooldowns,symbolLossStreaks,killed,auto,margin:+$('#margin').value||DEFAULT_PAPER_MARGIN_IDR,leverage:+$('#lev').value||DEFAULT_LEVERAGE,maxFloatLoss:+$('#maxFloatLoss').value||0.2,profitGiveback:+$('#profitGiveback').value||10,negativeScans:+$('#negativeScans').value||3,autoRotate:$('#autoRotate').checked}"
s=s.replace(old_p,new_p)
old_restore="symbolLosses=x.symbolLosses||{};symbolCooldowns=x.symbolCooldowns||{};symbolLossStreaks=x.symbolLossStreaks||{};"
new_restore="symbolLosses=x.symbolLosses||{};symbolCooldowns=x.symbolCooldowns||{};symbolLossStreaks=x.symbolLossStreaks||{};killed=!!x.killed;auto=x.auto!==false;"
s=s.replace(old_restore,new_restore)
# Add daily helpers before guard
needle='function guard(){'
helpers='''function dailyLossLimit(){return Math.max(1,accountEquity*(Math.min(50,Math.max(0.5,Number($('#dailyLoss').value)||3))/100));}
function setRiskState(kind,text){const el=$('#riskState');if(!el)return;el.className='risk-live '+(kind==='danger'?'danger':kind==='warn'?'warn':'ok');el.textContent=text;}
function enforceDailyLossLock(){
  const lim=dailyLossLimit();
  if(dailyPnl<=-lim){
    if(!killed){log(`DAILY LOSS LOCK → ${fmtIDR(dailyPnl)} / limit -${fmtIDR(lim)}`);}
    killed=true;auto=false;$('#autoToggle').textContent='AUTO OFF';$('#killBtn').textContent='KILL SWITCH: ON';$('#killBtn').classList.add('active');setRiskState('danger',`🔴 DAILY LOSS LOCKED · ${fmtIDR(dailyPnl)} / -${fmtIDR(lim)}`);persist();return true;
  }
  if(!killed)setRiskState('ok',hasValidPaperPosition()?'🟢 RISK GUARD ARMED · monitoring tick':'🟢 RISK GUARD ARMED · waiting entry');
  return false;
}
'''
s=s.replace(needle,helpers+needle)
# guard daily check
s=s.replace("if(dailyPnl<=-(accountEquity*Number($('#dailyLoss').value)/100))return['daily loss limit tercapai'];", "if(enforceDailyLossLock())return['daily loss limit tercapai'];")
# updateUI: add tick age and risk state, don't duplicate position update issue okay
old='latestPriceBySymbol[symbol]=a.c.close;$(\'#reason\')'
# actual string uses #reason with single quote in JS; do simple replace exact segment
s=s.replace("latestPriceBySymbol[symbol]=a.c.close;$('#reason')", "latestPriceBySymbol[symbol]=a.c.close;const tickAge=latestPriceBySymbol[symbol]?Math.max(0,Date.now()-Number(lastWsTradeAt||0)):Infinity;$('#tickAge').textContent=Number.isFinite(tickAge)&&tickAge<600000?Math.round(tickAge)+' ms':'—';if(killed)setRiskState('danger','🔴 RISK LOCKED · no new entry');$('#reason')")
# Replace updatePosition function entirely up to closePaper
st=s.index('function updatePosition(price){')
en=s.index('\nfunction closePaper(', st)
new_up='''function updatePosition(price){
 if(!hasValidPaperPosition()||!Number.isFinite(Number(price))||Number(price)<=0)return;
 const p=paperPos,dir=p.side==='BUY'?1:-1;
 const raw=(price-p.entry)*p.qty*dir;
 const fee=(Math.abs(p.entry*p.qty)+Math.abs(price*p.qty))*Number($('#fee').value)/100;
 const slip=Math.abs(price*p.qty)*Number($('#slippage').value)/100;
 const pnlIDR=(raw-fee-slip)*IDR;
 const r=Math.max(1,Math.abs(p.entry-p.initialSL)*p.qty);
 if(pnlIDR>Number(p.peakPnl||0))p.peakPnl=pnlIDR;
 if(!p.be&&raw>=r){p.sl=p.entry*(p.side==='BUY'?1.0002:.9998);p.be=true;log('SL PLUS → BREAK EVEN');}
 if(p.trail&&raw>r*1.5){const t=atr()*0.8;p.sl=p.side==='BUY'?Math.max(p.sl,price-t):Math.min(p.sl,price+t);}
 const negLimit=Math.max(2,Math.min(3,Number($('#negativeScans').value)||3));
 const moveStep=Math.max(Math.abs(p.entry-p.initialSL)*0.12,Math.abs(p.entry)*0.00025);
 const anchor=Number(p.moveAnchorPrice||p.entry);
 const adverse=p.side==='BUY'?price<anchor-moveStep:price>anchor+moveStep;
 if(adverse){p.adverseMoves=Number(p.adverseMoves||0)+1;p.lastAdversePrice=price;p.moveAnchorPrice=price;p.lastMoveAt=Date.now();log(`LOSS MOVE ${p.symbol} ${p.side} · ${p.adverseMoves}/${negLimit} · ${fmtIDR(pnlIDR)}`);}
 else{
   const favorable=p.side==='BUY'?price>anchor+moveStep:price<anchor-moveStep;
   if(favorable&&Number(p.adverseMoves||0)>0){p.adverseMoves=0;p.lastAdversePrice=price;p.moveAnchorPrice=price;p.lastMoveAt=Date.now();log(`LOSS MOVE RESET ${p.symbol} · favorable tick`);}
 }
 const maxFloatPct=Math.min(10,Math.max(0.1,Number($('#maxFloatLoss').value)||0.2))/100;
 const hardFloatLimit=Math.max(1,accountEquity*maxFloatPct);
 const dailyLim=dailyLossLimit();
 // Evaluate daily loss using the position's current unrealized PnL BEFORE closing.
 const dailyProjected=dailyPnl+pnlIDR;
 if(dailyProjected<=-dailyLim){
   log(`DAILY LOSS LIMIT HIT → ${fmtIDR(dailyProjected)} / -${fmtIDR(dailyLim)}`);
   closePaper(price,pnlIDR,'DAILY LOSS LIMIT');
   enforceDailyLossLock();
   return;
 }
 if(pnlIDR<=-hardFloatLimit){
   log(`HARD FLOATING LOSS → ${p.symbol} ${fmtIDR(pnlIDR)} <= -${fmtIDR(hardFloatLimit)}`);
   closePaper(price,pnlIDR,'HARD FLOATING LOSS LIMIT 0.20%');
   return;
 }
 if(Number(p.adverseMoves||0)>=negLimit&&pnlIDR<0){
   log(`PAIR LOSS MOVEMENT CUT → ${p.symbol} ${p.side} · ${p.adverseMoves} gerakan berlawanan · ${fmtIDR(pnlIDR)}`);
   closePaper(price,pnlIDR,`PAIR LOSS ${p.adverseMoves} MOVES`);
   return;
 }
 const givebackPct=Math.min(100,Math.max(1,Number($('#profitGiveback').value)||10))/100;
 const peak=Number(p.peakPnl||0);
 if(peak>0&&pnlIDR>0&&pnlIDR<=peak*(1-givebackPct)){
   const locked=pnlIDR;log(`PROFIT LOCK LIVE → ${p.symbol} peak ${fmtIDR(peak)} → ${fmtIDR(locked)} · giveback ${((peak-locked)/peak*100).toFixed(1)}%`);closePaper(price,locked,'PROFIT GIVEBACK');return;
 }
 const hit=p.side==='BUY'?(price<=p.sl||price>=p.tp):(price>=p.sl||price<=p.tp);
 if(hit){closePaper(price,pnlIDR,price>=p.tp||price<=p.tp?'SL/TP':'SL/TP');return;}
 renderPosition(pnlIDR);updatePaperAccount(pnlIDR);setRiskState('ok',`🟢 RISK GUARD ARMED · ${p.adverseMoves||0}/${negLimit} adverse moves · ${fmtIDR(pnlIDR)}`);
}
'''
s=s[:st]+new_up+s[en:]
# closePaper: enforce lock after daily pnl change and persist; prevent invalid recursive lock
old_close="dailyPnl+=pnl;paperPnl+=pnl;tradeHistory.push"
new_close="dailyPnl+=pnl;paperPnl+=pnl;tradeHistory.push"
# leave same; inject before final sync after persist
s=s.replace("paperPos=null; clearPositionVisuals(); renderTradeVisuals(); persist(); renderPosition(); updatePaperAccount(0); let a=analyze(); syncPaperStateUI(a)}", "paperPos=null; clearPositionVisuals(); renderTradeVisuals(); const locked=enforceDailyLossLock(); persist(); renderPosition(); updatePaperAccount(0); let a=analyze(); syncPaperStateUI(a); if(locked)$('#scanState').textContent='DAILY LOSS LOCKED · scanner paused'}")
# openPaper hunter daily check and guard use helper
s=s.replace("if(dailyPnl<=-(accountEquity*Number($('#dailyLoss').value)/100))g.push('daily loss limit tercapai');", "if(enforceDailyLossLock())g.push('daily loss limit tercapai');")
# restore should enforce after values restored
s=s.replace("$('#lossStreak').textContent=lossStreak}catch{}", "$('#lossStreak').textContent=lossStreak;enforceDailyLossLock();if(killed){$('#autoToggle').textContent='AUTO OFF';$('#killBtn').textContent='KILL SWITCH: ON';$('#killBtn').classList.add('active')}}catch{}")
# Switch symbol: don't mutate websocket before candle load; keep clean
# Tick chart: applyLiveTrade currently calls renderTradeVisuals then updateUI, good after nonrecursive renderer.
# Service worker cache bump
sw=Path('/mnt/data/v60fixwork/public/sw.js')
sw.write_text(sw.read_text().replace('ilham-novandi-pwa-v58','ilham-novandi-pwa-v61'))
# README files minimal update
Path('/mnt/data/v60fixwork/README-v61.md').write_text('''# ilham novandi V61 — Realtime Candle + Risk Guard + UI Fix\n\n- Binance Futures WebSocket kline 15m + aggTrade tick feed.\n- Tick updates active 15m candle H/L/C and PnL immediately.\n- Removed recursive chart/tick renderer loop from V60.\n- Daily loss lock evaluates projected daily PnL before closing and remains locked.\n- Hard floating loss defaults to 0.20% of equity.\n- 2–3 adverse price movements close a losing position; favorable movement resets the counter.\n- Profit giveback remains 10% by default.\n- Risk status and tick age are visible in UI.\n- Mobile/touch layout polished.\n- 15M only. Paper mode remains default.\n''')
p.write_text(s)
