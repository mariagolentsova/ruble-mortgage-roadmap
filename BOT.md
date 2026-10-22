# Telegram-бот в n8n

Бот и калькулятор работают на одном VPS:

```
Telegram ──► n8n.your-domain.ru (Nginx → n8n в Docker)
                 • /start, меню, «Повторить»
                 • проверка, открывается ли калькулятор

Калькулятор (your-domain.ru, статика через Nginx)
   └─ «Сохранить расчёт» ──► your-domain.ru/api/save-calculation
                              (Nginx → вебхук n8n → проверка подписи Telegram → Data Table)
```

## Что умеет бот

- **/start** — приветствие со ссылками на политику и согласие на обработку ПДн, предупреждение,
  что калькулятор носит ознакомительный характер и не является офертой, и инлайн-кнопка
  «Открыть калькулятор».
- **Меню внизу экрана**: «🧮 Калькулятор» и «💬 Задать вопрос» (кнопка со ссылкой на аккаунт специалиста).
- **Калькулятор недоступен** — перед показом кнопки бот проверяет, что страница калькулятора
  открывается. Если нет — присылает понятное сообщение и кнопку «🔄 Повторить».
- **«Сохранить расчёт»** в калькуляторе создаёт или обновляет строку пользователя в таблице
  `mortgage_calculations`. Пользователь определяется по Telegram ID из подписанных данных
  Telegram (`initData`), подделать его из браузера нельзя. Таблица создаётся сама при первом сохранении.

Всё проверено на n8n 2.44.6 — той же версии, что указана в `deploy/n8n/docker-compose.yml`.

## Требования к серверу

n8n занимает 300–500 МБ оперативной памяти. Нужен VPS минимум с **1 ГБ RAM** и swap-файлом.
Калькулятору (Nginx) хватает нескольких мегабайт.

## Установка

Все команды выполняются на сервере от root.

### 1. Swap-файл (страховка от нехватки памяти)

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### 2. Docker

```bash
curl -fsSL https://get.docker.com | sh
```

### 3. Поддомен для n8n

У регистратора домена добавьте A-запись `n8n.your-domain.ru` → IP сервера.

### 4. n8n

```bash
mkdir -p /opt/n8n && cd /opt/n8n
# скопируйте сюда deploy/n8n/docker-compose.yml и deploy/n8n/.env.example из репозитория
cp .env.example .env
openssl rand -hex 32        # вставьте результат в N8N_ENCRYPTION_KEY
nano .env                   # заполните домен, токен бота и ссылки
docker compose up -d
docker compose logs -f n8n  # дождитесь строки "Editor is now accessible", затем Ctrl+C
```

Что заполнить в `.env`:

| Переменная | Что это |
| --- | --- |
| `N8N_DOMAIN` | поддомен n8n, например `n8n.your-domain.ru` |
| `N8N_ENCRYPTION_KEY` | случайный ключ из `openssl rand -hex 32`; сохраните его |
| `TELEGRAM_BOT_TOKEN` | токен бота от @BotFather |
| `CALCULATOR_URL` | адрес калькулятора, `https://your-domain.ru/` |
| `PD_POLICY_URL` | ссылка на политику обработки ПДн |
| `PD_CONSENT_URL` | ссылка на согласие на обработку ПДн |
| `SPECIALIST_URL` | аккаунт специалиста, например `https://t.me/username` |

### 5. Nginx и HTTPS

Возьмите обновлённый `deploy/nginx.conf` (в нём появились адрес `/api/save-calculation`
и сервер для n8n), впишите оба домена и перезагрузите Nginx:

```bash
nano /etc/nginx/sites-available/mortgage
nginx -t && systemctl reload nginx
certbot --nginx -d your-domain.ru -d n8n.your-domain.ru
```

### 6. Настройка в n8n

1. Откройте `https://n8n.your-domain.ru` и создайте аккаунт владельца с надёжным паролем.
2. **Credentials → Create credential → Telegram API**, вставьте токен бота, назовите
   `Telegram — бот Совесть`.
3. **Workflows → Import from File** → `n8n/mortgage-bot.workflow.json`.
4. Откройте узел «Telegram: новые сообщения» и выберите созданный credential.
5. Нажмите **Publish**. После этого n8n сам зарегистрирует вебхук у Telegram.

### 7. BotFather

В [@BotFather](https://t.me/BotFather) → `/mybots` → ваш бот:

- **Edit Commands**:
  ```
  start - Начать
  calc - Открыть калькулятор
  ask - Задать вопрос специалисту
  ```
- **Edit Description** — коротко о боте; текст виден до нажатия «Старт».

## Проверка после запуска

1. Отправьте боту `/start`: должно прийти приветствие с кнопкой калькулятора и меню внизу.
2. Нажмите «Открыть калькулятор», посчитайте и нажмите «Сохранить расчёт» → «Расчёт сохранён».
3. Нажмите ещё раз → «Сохранённый расчёт обновлён».
4. В n8n: **Overview → Data tables → mortgage_calculations**: одна строка с вашим Telegram ID.
5. Остановите калькулятор (например, `systemctl stop nginx` на минуту), нажмите «🧮 Калькулятор»:
   должно прийти сообщение о недоступности и кнопка «Повторить». Запустите Nginx обратно
   и нажмите «Повторить» — придёт кнопка калькулятора.

## Таблица `mortgage_calculations`

Одна строка на пользователя: последний сохранённый расчёт.

| Колонка | Что хранит |
| --- | --- |
| `telegram_id` | ID пользователя Telegram — ключ записи |
| `username`, `first_name`, `last_name` | данные профиля Telegram |
| `price`, `down_payment`, `loan_amount` | стоимость, взнос, сумма кредита, ₽ |
| `term_months`, `rate`, `start_month` | срок по договору (мес.), ставка (%), начало выплат (ГГГГ-ММ) |
| `prepayments` | досрочные погашения текстом или «нет» |
| `monthly_payment`, `total_interest`, `total_paid`, `overpayment_pct` | платёж, проценты, всего выплат, переплата (%) |
| `actual_term_months`, `last_payment_month` | фактический срок с учётом досрочных погашений и месяц последнего платежа |
| `prepaid_total`, `saved_interest` | сумма досрочных погашений и экономия на процентах, ₽ |
| `saved_at` | когда сохранён расчёт |

В таблице хранятся персональные данные (Telegram ID, имя, username). Они остаются на сервере Заказчика.

## Как поменять тексты бота

- Ссылки (ПДн, специалист, калькулятор) — в `/opt/n8n/.env`, затем `docker compose up -d`.
- Тексты сообщений — в узле «Собрать ответ» прямо в n8n. Если ведёте изменения через репозиторий:
  правьте `n8n/code/build-replies.js`, выполните `node n8n/build-workflow.mjs` и заново импортируйте
  `n8n/mortgage-bot.workflow.json`.

## Защита

- Telegram ID берётся только из `initData`, подписанных Telegram; подпись проверяется токеном бота,
  данные старше суток отклоняются.
- Nginx пропускает не больше 10 сохранений в минуту с одного адреса.
- Порт n8n открыт только для самого сервера; снаружи n8n доступен лишь через HTTPS-поддомен с паролем.
- Токен бота хранится в `.env` на сервере и не попадает в репозиторий.
