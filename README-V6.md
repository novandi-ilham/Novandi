# Ilham Novandi Futures Command Center — V6

## Critical market-data architecture

- Browser REST -> `https://fapi.binance.com` is the primary/authoritative market-data path.
- Browser WebSocket -> `wss://fstream.binance.com/market/ws/<symbol>@kline_15m` is the low-latency path.
- REST reconciliation uses the real `/fapi/v1/klines` endpoint every cycle, so it does not depend on the Vercel `/api/market/realtime` endpoint.
- Vercel `/api/market/*` is fallback only. It never falls back to Binance Testnet for market data.
- This specifically avoids Binance HTTP 451 from a restricted Vercel server location when direct browser access is available.

## Environment

```env
BINANCE_BASE_URL=https://testnet.binancefuture.com
BINANCE_MARKET_BASE_URL=https://fapi.binance.com
```

Trading remains controlled by the existing testnet/paper configuration. Market data always targets production Futures.


V8 patch: defines diagnoseMarketAccess() so startup cannot abort before history loading; adds explicit DIRECT/PROXY diagnostics and safer realtime polling.


## V9 diagnostic correction
The market diagnostic now reports the upstream Binance HTTP status instead of treating the diagnostic application's HTTP 200 wrapper as a successful market-data response.
