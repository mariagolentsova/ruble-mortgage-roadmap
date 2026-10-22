# Выкладка на VPS

Приложение — статический SPA: после сборки это папка `dist/` с HTML, JS и CSS.
На сервере не работает ни Node.js, ни какие-либо процессы — файлы отдаёт Nginx,
ему достаточно нескольких мегабайт памяти. Собирается проект в GitHub Actions,
на сервер приходят только готовые файлы.

```
git push в main → GitHub Actions: npm install → тесты → vite build → rsync dist/ → VPS (Nginx)
```

## 1. Подготовка сервера (один раз)

Подключитесь к серверу и установите Nginx и rsync:

```bash
ssh root@IP_СЕРВЕРА
apt update && apt install -y nginx rsync ufw
```

Заведите пользователя для выкладки и папку сайта:

```bash
adduser --disabled-password --gecos "" deploy
mkdir -p /var/www/mortgage
chown deploy:deploy /var/www/mortgage
```

## 2. Ключ для GitHub Actions

На **своём компьютере** создайте отдельный ключ (без пароля) только для деплоя:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/mortgage_deploy -N "" -C "github-actions-deploy"
```

Добавьте его публичную часть на сервер:

```bash
ssh-copy-id -i ~/.ssh/mortgage_deploy.pub deploy@IP_СЕРВЕРА
```

Проверьте, что вход работает: `ssh -i ~/.ssh/mortgage_deploy deploy@IP_СЕРВЕРА`.

## 3. Секреты в GitHub

Репозиторий → **Settings → Secrets and variables → Actions → New repository secret**:

| Имя | Значение |
| --- | --- |
| `SSH_HOST` | IP или домен сервера |
| `SSH_USER` | `deploy` |
| `SSH_KEY` | содержимое файла `~/.ssh/mortgage_deploy` (приватный ключ целиком, вместе со строками BEGIN/END) |
| `SSH_PORT` | необязательно, если SSH не на 22 порту |
| `DEPLOY_PATH` | необязательно, по умолчанию `/var/www/mortgage` |

## 4. Nginx

Скопируйте `deploy/nginx.conf` на сервер, впишите свой домен в `server_name`:

```bash
nano /etc/nginx/sites-available/mortgage      # вставить содержимое deploy/nginx.conf
ln -s /etc/nginx/sites-available/mortgage /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

## 5. Файрвол и HTTPS

Telegram открывает Mini App только по HTTPS. У домена должна быть A-запись на IP сервера.

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable

apt install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.ru
```

Сертификат продлевается автоматически.

## 6. Первая выкладка

Запушьте в `main` или запустите вручную: репозиторий → **Actions → Build and deploy → Run workflow**.
Через 1–2 минуты сайт откроется по `https://your-domain.ru`.

Версии пакетов зафиксированы в `package-lock.json`, поэтому каждая сборка
получается одинаковой. После изменения зависимостей закоммитьте обновлённый lock-файл.

## 7. Telegram-бот

Бот собран в n8n и работает на этом же сервере. Установка, настройка BotFather
и проверка описаны в [BOT.md](BOT.md).

## Выкладка вручную, без GitHub Actions

Соберите проект у себя и скопируйте папку `dist` на сервер:

```bash
npm ci        # нужен Node.js 24
npm run build
rsync -az --delete dist/ deploy@IP_СЕРВЕРА:/var/www/mortgage/
```
