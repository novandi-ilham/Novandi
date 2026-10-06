# V74 — Stable Binance USD-M 15M Paper Dashboard

Fixes V73 archive loading by fetching completed Binance Vision USD-M 15m daily archives in parallel through `/api/market/history`, avoiding sequential Vercel timeout behavior. Binance Production REST remains the authoritative live source; HTTP 451 is surfaced and auto-entry stays OFF. Historical archive candles are explicitly marked as archive/live-blocked.

Paper hard floating loss cutoff remains locked at 0.20% of equity per position.
