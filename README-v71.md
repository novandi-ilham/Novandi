# V71 — Production Candle Transport Fix

- 15M OHLCV is authoritative from Binance USDⓈ-M Production kline REST + kline WebSocket.
- ticker/aggTrade never mutate candle OHLC.
- Snapshot endpoint is price-only and no longer a candle dependency.
- Startup no longer blocks chart rendering on snapshot.
- Kline proxy failure has a direct Binance Production REST fallback in the browser.
- Snapshot polling reduced to 5s to avoid unnecessary upstream request pressure.
- API reports upstream Binance status/message instead of a generic 500.
