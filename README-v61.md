# ilham novandi V61 — Realtime Candle + Risk Guard + UI Fix

- Binance Futures WebSocket kline 15m + aggTrade tick feed.
- Tick updates active 15m candle H/L/C and PnL immediately.
- Removed recursive chart/tick renderer loop from V60.
- Daily loss lock evaluates projected daily PnL before closing and remains locked.
- Hard floating loss defaults to 0.20% of equity.
- 2–3 adverse price movements close a losing position; favorable movement resets the counter.
- Profit giveback remains 10% by default.
- Risk status and tick age are visible in UI.
- Mobile/touch layout polished.
- 15M only. Paper mode remains default.
