# Calculator on the Beget n8n server

Beget's n8n image runs traefik on ports 80/443 (Docker project in /opt/beget/n8n,
network `n8n_default`, certificate resolver `mytlschallenge`). The calculator joins
that network as a small Nginx container.

Beget's technical domains for shared hosting (*.beget.app) can't be repointed, so the
calculator is served on the n8n domain under a path: https://<n8n domain>/calc/.
traefik sends /calc/* to the calculator (stripping the prefix) and everything else to n8n.
The app uses relative paths (Vite base "./"), so the same build also works at a domain root.

- `docker-compose.yml` → /opt/mortgage/docker-compose.yml
- `nginx.conf` → /opt/mortgage/nginx.conf
- GitHub Actions uploads the built site to /opt/mortgage/site (secret DEPLOY_PATH)
- `/calc/api/save-calculation` is proxied to the n8n webhook over the Docker network

Own domain later: point its A record at the server, set CALC_DOMAIN in /opt/mortgage/.env,
change the router rule to Host(`${CALC_DOMAIN}`) and drop the two middlewares, then
`docker compose up -d` and update CALCULATOR_URL in /opt/beget/n8n/.env.

The bot settings (TELEGRAM_BOT_TOKEN, CALCULATOR_URL, …) are appended to
/opt/beget/n8n/.env, which both the n8n and n8n-worker containers read.
deploy/n8n/ and deploy/nginx.conf are for a plain VPS without Beget's image.
