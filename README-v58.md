# ilham novandi Trader V58 — WebSocket Sync

V58 is based on V56 and keeps the agreed 15M Paper Engine rules.

## Realtime architecture
- One shared Binance USDⓈ-M Futures public market WebSocket for up to 48 scanner pairs.
- 15-minute kline streams update the active chart tick-by-tick.
- The same live kline store feeds scanner analysis and live PnL.
- Pair switching does not create a separate price source; it keeps the same shared stream and adds the selected pair.
- REST is used for historical candle bootstrap and fallback when the WebSocket is unavailable.
- Watchdog checks freshness of the **active pair**, not just aggregate socket traffic.

## Preserved trading rules
- 15M only.
- No minimum confidence gate for Paper entry.
- Profit-oriented Best Pair Hunter.
- Switch only when a materially better opportunity is found, with immediate entry after switch.
- 2–3 adverse price movements can close a losing pair; favorable movement resets the counter.
- Emergency hard floating loss remains 0.20% of equity (also bounded by configured risk budget).
- 10% profit giveback lock.
- Paper mode by default.

## Validation
- `node --check check-v58.js` passed.
- ZIP integrity checked with `unzip -t`.
