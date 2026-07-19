# Kaspi Dashboard

Аналитический дашборд для магазина на **Kaspi Marketplace**. Тянет данные напрямую через Kaspi Shop API v2, без БД. Готов к деплою на Vercel за 10 минут.

## Что показывает

| Страница | Содержимое |
|---|---|
| `/kaspi` | Обзор: KPI за период, плитки «Принято / Выдано / В работе сегодня», тренды по дням, распределение по статусам/оплатам/доставке |
| `/kaspi-zakazy` | Все заказы за период с фильтрами по статусу, поиском, постраничной пагинацией |
| `/kaspi-otmeny` | Отмены и возвраты с причинами и подсветкой выше нормы Kaspi |
| `/kaspi-dostavka` | Доставка: топ городов, типы доставки, стоимость, Kaspi-Доставка vs самовывоз |
| `/kaspi-klienty` | Клиенты с повторными заказами, средний чек, география |
| `/settings` | Диагностика подключения: токен, merchant ID, live-probe |

Период переключается на каждой странице: 1 / 7 / 14 / 30 / 60 / 90 дней.

## Стек

- **Next.js 16** + React 19 (App Router, Server Components)
- **Tailwind 4** + **Recharts**
- Никакой БД — `unstable_cache` 300 сек прямо в Next.js
- Деплой: Vercel (Hobby план хватает)

## Запуск локально

```bash
npm install
cp .env.example .env.local      # заполнить креды (см. CLIENT-SETUP.md)
npm run dev                     # http://localhost:3000
```

Логин/пароль для входа — из `NICHE_USER` / `NICHE_PASS`.

## Передача клиенту

См. [CLIENT-SETUP.md](CLIENT-SETUP.md) — пошаговый план: что клиент получает, какие промпты отправляет Claude, как настраивает Vercel.

## Переменные окружения

| Имя | Назначение |
|---|---|
| `KASPI_API_BASE` | `https://kaspi.kz/shop/api/v2` (default) |
| `KASPI_TOKEN` | Persistent X-Auth-Token из Merchant Cabinet → Настройки → API |
| `KASPI_MERCHANT_ID` | Merchant UID — **обязателен**, без него API отдаёт 0 заказов |
| `KASPI_MERCHANT_NAME` | Название магазина — отображается в шапке и левом меню |
| `NICHE_USER` / `NICHE_PASS` | Логин/пароль для входа в дашборд |

## Архитектура

```
┌──────────────────────┐
│  Kaspi Shop API v2   │
│  X-Auth-Token        │
└──────────┬───────────┘
           │ HTTPS, chunking по 14 дней
           ▼
       lib/kaspi-live.ts
           │ unstable_cache 300с
           ▼
    Next.js (Vercel) → Браузер
           │
       middleware.ts
       Basic Auth NICHE_USER / NICHE_PASS
```

Каждый запрос дашборда дёргает Kaspi-API (с кэшем 5 мин). Холодный fetch ~5-15 сек для 90 дней (зависит от количества заказов).
