# ilham novandi — Futures Command Center (Complete)

Vercel-ready 15M-only Binance Futures Paper Trading terminal with PWA, realtime chart, Paper Engine, margin/leverage controls, auto exit/switch, profit giveback protection and re-entry scanning.

## Structure
- `public/` — web app, PWA manifest, service worker, icons
- `api/[...path].js` — Vercel API routes for market/account/order operations
- `vercel.json` — Vercel routing
- `.env.example` — environment configuration template

## Safety
Default mode is PAPER. Keep live trading disabled unless deliberately configured. Never expose Binance API secret in client-side code.
