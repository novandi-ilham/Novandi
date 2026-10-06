# Ilham Novandi Futures Command Center — V6

V6 changes the market-data architecture so Binance Futures Production REST is the authoritative source. Browser WebSocket is an acceleration layer only.

## Realtime flow
1. Initial 150 x 15m history: `/api/market/klines` -> `https://fapi.binance.com`.
2. Every ~1 second: `/api/market/realtime` fetches the current 15m kline + Binance server time from Production.
3. WebSocket tries the official `/market/ws/` raw stream and `/market/stream` combined stream.
4. If WebSocket is blocked/stuck, REST reconciliation keeps the chart moving.
5. A recent WebSocket tick is not overwritten by an older REST snapshot inside the same candle.
6. Production market data never falls back to Testnet.

## Environment
```env
BINANCE_BASE_URL=https://testnet.binancefuture.com
BINANCE_MARKET_BASE_URL=https://fapi.binance.com
```

The first variable is for the existing trading/testnet workflow. The second is the only market-data source.

## Binance source
Binance USDⓈ-M Futures documents the 15m kline stream at `wss://fstream.binance.com/market/ws/{symbol}@kline_15m` and the combined `/market/stream` form. Kline updates are pushed every 250ms.
