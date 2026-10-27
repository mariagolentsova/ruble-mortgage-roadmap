# Notes for coding agents

- Static single-page app: Vite + React + Tailwind v4. No server, no SSR, no router.
- Whole UI is `src/App.tsx`; all mortgage math is in `src/lib/mortgage.ts` (covered by `src/lib/mortgage.test.ts`).
- Build output `dist/` is deployed to a VPS and served by Nginx (see DEPLOY.md, deploy/nginx.conf).
- Logos are plain files in `public/` (`/logo-milk.png`, `/logo-gold.png`).
- "Сохранить расчёт" posts Telegram initData + a flat record (`src/lib/saveCalculation.ts`) to `/api/save-calculation`; Nginx proxies it to the n8n webhook.
- Daily sync of bot users to a Google Sheet: `n8n/code/users-to-sheet.js` → `node n8n/build-sheets-sync.mjs` → `n8n/users-sheet-sync.workflow.json` (BOT.md).
- The Telegram bot is an n8n workflow. Edit Code-node sources in `n8n/code/`, then run `node n8n/build-workflow.mjs` to regenerate `n8n/mortgage-bot.workflow.json`. See BOT.md.
- n8n Code nodes run in a sandbox without URLSearchParams; only the `crypto` builtin is allowed.
