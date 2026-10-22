# Calculator on the Beget n8n server

Beget's n8n image runs traefik on ports 80/443 (Docker project in /opt/beget/n8n,
network `n8n_default`, certificate resolver `mytlschallenge`). The calculator joins
that network as a small Nginx container, so traefik routes its domain and issues SSL.

- `docker-compose.yml` → /opt/mortgage/docker-compose.yml
- `nginx.conf` → /opt/mortgage/nginx.conf
- GitHub Actions uploads the built site to /opt/mortgage/site (secret DEPLOY_PATH)
- `/api/save-calculation` is proxied to the n8n webhook over the Docker network

The bot settings (TELEGRAM_BOT_TOKEN, CALCULATOR_URL, …) are appended to
/opt/beget/n8n/.env, which both the n8n and n8n-worker containers read.
deploy/n8n/ and deploy/nginx.conf are for a plain VPS without Beget's image.
