# Ilham Novandi Futures Command Center — V75

- PAPER ONLY
- BTCUSDT USDⓈ-M, 15M
- Production FAPI is the authoritative current-day source when accessible.
- Binance Vision USD-M archive is used only for exact historical fallback.
- Direct Binance Futures WebSocket supplies live current candle/price when the WS is reachable.
- Scanner uses live Binance mini-ticker stream when available; historical analysis falls back to Binance Vision.
- Auto-entry remains OFF/blocked unless current-day 15M Production data is verified.
- Hard per-position loss cutoff: 0.20% of paper account equity.
- No VPN/geolocation bypass and no silent COIN-M/Testnet chart fallback.
