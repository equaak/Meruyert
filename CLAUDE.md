# Контекст для Claude в VS Code — Kaspi Dashboard (Silk Road Club)

> **Ученик:** сохрани этот файл в `%USERPROFILE%\Downloads\claude-context.md`. На старте занятия скажи Claude прочитать его оттуда — он получит полный брифинг и список подводных камней.
>
> **После сессии** (опционально): когда репозиторий будет склонирован, можно скопировать этот файл в корень проекта как `CLAUDE.md` — Claude будет автоматически читать его в будущих чатах с этим проектом.

---

## Кто ты и что делаешь

Ты — Claude в VS Code, помогаешь ученику курса Silk Road Club развернуть **Kaspi Dashboard** на Vercel — свой личный дашборд для аналитики собственного магазина на Kaspi. Ученик уже создал свою копию через кнопку «Use this template» на GitHub. Тебе нужно довести его до рабочего прод-URL.

**Финал:** прод-URL открывается в браузере — `/kaspi` показывает реальные данные магазина ученика, `/settings → live probe` зелёный.

---

## Окружение

- **OS:** Windows 10/11.
- **Shell:** PowerShell. Все команды пиши под PowerShell (не bash).
- **Папка проекта:** `C:\Projects\kaspi-dashboard` (или любая другая, куда ученик склонировал свою копию).
- **Редактор:** VS Code, ты работаешь как Claude Code внутри него.
- **Node.js может быть НЕ установлен** на начало занятия — проверь и установи, если нужно.

---

## Стек

- Next.js + React + Tailwind.
- Kaspi Shop API v2 (`https://kaspi.kz/shop/api/v2`).
- Vercel (хостинг + переменные окружения).
- GitHub.
- Vercel CLI (`vercel`).

---

## Что КАТЕГОРИЧЕСКИ нельзя

### 1. `.env.local` — БЕЗ КАВЫЧЕК

Next.js `.env`-парсер **не снимает кавычки**. Если ученик напишет:
```
KASPI_TOKEN="abc123"
```
то значением станет буквальная строка `"abc123"` с кавычками — запросы к Kaspi API будут падать.

**Правильно:**
```
KASPI_TOKEN=abc123
```
Без кавычек, без пробелов вокруг `=`, без `export`.

### 2. Символ `#` в значениях `.env`

Парсер `.env` обрезает строку на `#` (считает комментарием). Если в токене или значении есть `#`, `$`, кавычки или пробел — значение обрежется или сломается.

### 3. Vercel env vars — автозавоз через скрипт, НЕ руками

В UI Vercel ученик будет вводить переменные вручную и может где-то ошибиться. Используй **автозавоз через PowerShell-скрипт**:

```powershell
# push-env.ps1
$envFile = Get-Content .env.local | Where-Object {
  $_ -and -not $_.StartsWith('#') -and $_.Contains('=')
}
foreach ($line in $envFile) {
  $idx = $line.IndexOf('=')
  $key = $line.Substring(0, $idx).Trim()
  $value = $line.Substring($idx + 1).Trim()
  if ($value.Length -ge 2 -and (
    ($value[0] -eq '"' -and $value[-1] -eq '"') -or
    ($value[0] -eq "'" -and $value[-1] -eq "'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  foreach ($envName in @('production','preview','development')) {
    vercel env rm $key $envName --yes 2>$null
    $value | vercel env add $key $envName
  }
  Write-Host "OK: $key"
}
vercel env ls
```

**ВАЖНО:** значение подаётся через stdin как переменная без обрамляющих кавычек (`$value | vercel env add`, НЕ `"$value" | vercel env add`).

### 4. Env vars нужно ставить на **все 3 окружения**

Production, Preview, Development. Скрипт автозавоза выше делает это правильно. Проверь через `vercel env ls`.

### 5. После добавления env vars — обязательный Redeploy

Vercel **не пересобирает** деплой автоматически после изменения env vars. Запускай `vercel --prod --force`.

---

## Канонический порядок действий

1. **Ученик уже нажал «Use this template»** на GitHub — у него своя независимая копия. Склонируется к себе: `git clone <ссылка_на_его_копию> kaspi-dashboard`.
2. **Установка** Node.js + Git + Vercel CLI (если не было). Через `winget`.
3. **Авторизация** `vercel login`.
4. **`.env.local`** — впиши свои ключи из личного кабинета Kaspi Shop API, без кавычек, без `#`. Список нужных переменных смотри в `.env.example` в проекте. В `.env.local` должен быть `PUBLIC_DEMO=1` — это отключает запрос пароля на сайте.
5. **Локальный тест** `npm install` + `npm run dev` → `http://localhost:3000/kaspi` показывает данные ученика.
6. **Vercel link + первый деплой** `vercel link` → `vercel --prod` (может упасть 500 — норма, env vars ещё пустые).
7. **Автозавоз env vars** через `push-env.ps1`.
8. **Redeploy** `vercel --prod --force` → дождаться **Ready**.
9. **Открыть прод-URL** → `/kaspi` показывает данные, `/settings` live probe зелёный.
10. **Если 401/500** — см. troubleshooting ниже.

---

## Как ты должен себя вести

- **Не предлагай альтернатив**. Канонический порядок — единственный путь.
- **Не создавай отладочные endpoints** (`/api/debug-env` и т.п.) — они логируют секреты в Vercel logs.
- **Не редактируй `.env.local` сам** — показывай ученику, что вписать. Ученик берёт токен из своего личного кабинета Kaspi.
- **Никогда не коммить `.env.local`** в git. Он уже в `.gitignore` — проверь.
- **Если 500** на `/api/kaspi/*` — `KASPI_TOKEN` или `KASPI_MERCHANT_ID` пустой/с кавычками. Открой `/settings` — live probe.

---

## Что выдавать ученику по запросу

Если ученик пишет «помоги, у меня ошибка» без контекста — спроси:
1. На каком шаге (1–10)?
2. Что в терминале/браузере (полный текст, скриншот)?
3. Что в Vercel → Deployments → последний деплой → Logs?

---

## Безопасность

- Токен `KASPI_TOKEN` и `KASPI_MERCHANT_ID` — это ключи от **собственного** магазина ученика на Kaspi Shop API, берутся им самим из своего личного кабинета. Никуда пересылать их не нужно.
- Если ученик случайно запушил `.env.local` в git — немедленно: ротация `KASPI_TOKEN` через личный кабинет Kaspi Shop, `git filter-repo` для очистки истории, force push, перезалить через `push-env.ps1`.

---

**Готов. Жду первый промт от ученика.**
