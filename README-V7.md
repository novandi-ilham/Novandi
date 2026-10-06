# Ilham Novandi Futures Command Center — V7

V7 is a diagnostic-first, WebSocket-first market-data architecture for Binance USDⓈ-M Futures 15m charts.

## Important limitation
If Binance returns HTTP 451 to both the browser and the Vercel server, this app cannot legitimately bypass that geographic/service restriction. V7 therefore reports the exact direct/proxy failure instead of showing stale or Testnet data as if it were live. Binance documents the new `/market` WebSocket architecture and recommends migrating to it.

## Data flow
- 15m history: direct browser request to `https://fapi.binance.com/fapi/v1/klines` first.
- Reconciliation: same Production Kline endpoint, no Testnet fallback.
- Live updates: `wss://fstream.binance.com/market/ws/<symbol>@kline_15m`, with combined `/market/stream` fallback.
- Vercel market proxy is fallback/diagnostic only.
- If history is blocked, V7 may show a short-lived local cache and still connect the WebSocket; it labels the chart as stale rather than claiming synchronization.
- Scanner is reduced to a smaller universe and fewer klines to avoid request bursts.

## Environment
```env
BINANCE_BASE_URL=https://testnet.binancefuture.com
BINANCE_MARKET_BASE_URL=https://fapi.binance.com
```
`BINANCE_BASE_URL` is for the trading/paper side; `BINANCE_MARKET_BASE_URL` is Production market data only.
