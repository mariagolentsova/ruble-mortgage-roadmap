# Notes for coding agents

- Static single-page app: Vite + React + Tailwind v4. No server, no SSR, no router.
- Whole UI is `src/App.tsx`; all mortgage math is in `src/lib/mortgage.ts` (covered by `src/lib/mortgage.test.ts`).
- Build output `dist/` is deployed to a VPS and served by Nginx (see DEPLOY.md, deploy/nginx.conf).
- Logos are plain files in `public/` (`/logo-milk.png`, `/logo-gold.png`).
