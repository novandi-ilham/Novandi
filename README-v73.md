# V73 — Geo-safe Binance USDⓈ-M 15M Paper Engine

- Keeps USDⓈ-M Production as the only exact Binance market source.
- If Binance Futures REST returns HTTP 451, the app does **not** switch to Testnet or another exchange.
- Completed exact Binance USD-M 15M candles can be loaded from Binance Vision daily archives.
- Binance Futures WebSocket remains the live current-candle/price source when the browser can connect.
- Because Binance Vision daily files are published on the following day, archive fallback is marked **history incomplete** and **auto-entry is blocked** until live Production FAPI history is verified.
- Paper hard loss cutoff is locked at **0.20% of account equity** per position.
- Auto-entry/scanner cannot run on unverified market data.
- No VPN/proxy/geolocation bypass is implemented.
