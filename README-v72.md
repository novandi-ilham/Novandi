# V72 — Direct Binance Production 15M Candle

- Visible chart history comes directly from `https://fapi.binance.com/fapi/v1/klines` first.
- Vercel API is fallback only for chart transport.
- Kline stream is the only realtime OHLC source.
- ticker/price is used only for latest price and paper PnL.
- aggTrade no longer mutates candles.
- If market data fails, UI shows the real production kline error instead of a blank chart.
- Paper auto-entry remains separate from live trading.
