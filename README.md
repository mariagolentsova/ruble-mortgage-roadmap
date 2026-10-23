# Ипотечный калькулятор — Совесть

Telegram Mini App: ежемесячный платёж, переплата, досрочные погашения и график платежей.
Статический SPA на Vite + React + Tailwind — все расчёты выполняются в браузере, сервер не нужен.

## Разработка

Нужен Node.js 24 (с npm 11 — в npm 10 установка зависимостей падает с ошибкой `edgesOut`).

```sh
npm install
npm run dev       # локальный сервер разработки
npm test          # тесты расчётов (src/lib/mortgage.test.ts)
npm run build     # сборка в dist/
npm run preview   # посмотреть собранную версию
```

## Структура

```
index.html                 HTML-оболочка, шрифты, Telegram WebApp API
src/main.tsx               точка входа
src/App.tsx                экран калькулятора
src/lib/mortgage.ts        расчёт аннуитета и досрочных погашений
src/components/mortgage/   графики
src/components/ui/         используемые компоненты (shadcn/radix)
public/                    статика: favicon, логотипы
deploy/nginx.conf          конфиг Nginx для VPS (калькулятор + n8n)
deploy/n8n/                docker-compose и .env.example для n8n
n8n/                       workflow бота: исходники Code-узлов и сборка JSON
```

## Выкладка

Подробно — в [DEPLOY.md](DEPLOY.md), бот в n8n — в [BOT.md](BOT.md). Коротко: push в `main` → GitHub Actions собирает
проект и копирует `dist/` на сервер, где его отдаёт Nginx.
