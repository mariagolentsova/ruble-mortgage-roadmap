# Переезд на сервер AdminVPS (n8n из /opt/mila-tg-bot)

На сервере уже работают traefik (HTTPS), Postgres и n8n проекта `mila-tg-bot`
(`/opt/mila-tg-bot/deploy/server`, сеть `n8n_default`). Бот «Совесть» работает в этом же n8n,
калькулятор — отдельный контейнер Nginx в `/opt/mortgage` по адресу `https://ДОМЕН/calc/`.

`ДОМЕН` — адрес n8n: `grep '^DOMAIN=' /opt/mila-tg-bot/deploy/server/.env`.

## 1. Настройки бота для n8n

После merge PR «extra-bots.env» в `mila-tg-bot`:

```bash
cd /opt/mila-tg-bot && git pull --ff-only
cd deploy/server
curl -fsSL https://raw.githubusercontent.com/mariagolentsova/ruble-mortgage-roadmap/main/deploy/server/extra-bots.env.example -o extra-bots.env
chmod 600 extra-bots.env
nano extra-bots.env          # токен, адрес прокси, ДОМЕН, ID администраторов
docker compose up -d n8n
```

## 2. Калькулятор

```bash
mkdir -p /opt/mortgage/site && cd /opt/mortgage
for f in docker-compose.yml nginx.conf; do
  curl -fsSL https://raw.githubusercontent.com/mariagolentsova/ruble-mortgage-roadmap/main/deploy/server/$f -o $f
done
echo "CALC_DOMAIN=$(grep '^DOMAIN=' /opt/mila-tg-bot/deploy/server/.env | cut -d= -f2-)" > .env
docker compose up -d
```

Файлы сайта загружает GitHub Actions (push в `main`) в `/opt/mortgage/site` от пользователя `deploy`:

```bash
id deploy 2>/dev/null || useradd -m -s /bin/bash deploy
chown -R deploy:deploy /opt/mortgage/site
sudo -u deploy bash -c 'mkdir -p ~/.ssh && ssh-keygen -t ed25519 -N "" -f ~/.ssh/github -C github-actions -q && cat ~/.ssh/github.pub >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'
cat /home/deploy/.ssh/github      # закрытый ключ → секрет SSH_KEY в GitHub
```

Секреты репозитория (Settings → Secrets and variables → Actions): `SSH_HOST` = IP сервера,
`SSH_USER` = `deploy`, `DEPLOY_PATH` = `/opt/mortgage/site`, `SSH_KEY` = закрытый ключ.
Затем Actions → «Build and deploy» → Run workflow.

## 3. Прокси в Нидерландах (когда появится)

Пока бот ходит в Telegram через Cloudflare Worker (`TELEGRAM_API_URL` в `extra-bots.env`).
Прокси из `mila-tg-bot/proxy/server` пропускает только боты из `BOT_IDS`. На сервере прокси добавьте
номер бота «Совесть» (цифры до двоеточия в токене) через `|` в `.env` и перезапустите:
`docker compose up -d`.

## 4. n8n

1. Credentials → Telegram API → токен бота, **Base URL** = адрес прокси; имя `Telegram — бот Совесть`.
2. Import from URL: `n8n/mortgage-bot.workflow.json` и `n8n/data-cleanup.workflow.json`
   (`https://raw.githubusercontent.com/mariagolentsova/ruble-mortgage-roadmap/main/...`),
   в узле «Telegram: новые сообщения» выбрать credential, Save → Publish.
3. Settings → Error Workflow — тот же, что у бота mila.
