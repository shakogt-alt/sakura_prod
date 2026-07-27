# Настройка админ-панели (/admin)

Одноразовая настройка в Vercel. Без неё `/admin` не заработает: логин будет отвечать 500, потому что серверу не с чем сравнивать пароль и нечем подписывать сессию.

## 1. Переменные окружения

Vercel → проект `sakura_pro` → **Settings → Environment Variables**. Добавить все пять, окружение — Production (и Preview, если хочешь тестировать до продакшена).

| Переменная | Значение |
|---|---|
| `ADMIN_EMAIL` | Email для входа в `/admin`. Любой, реальная почта не нужна — просто логин. |
| `ADMIN_PASSWORD` | Пароль для входа. Придумай надёжный. |
| `SESSION_SECRET` | Случайная строка 40+ символов, никто её не вводит — только подписывает cookie сессии. Сгенерировать в PowerShell: `[guid]::NewGuid().ToString() + [guid]::NewGuid().ToString()` |
| `GITHUB_TOKEN` | GitHub Personal Access Token (см. ниже). Вставляешь только в Vercel, мне его присылать не нужно. |
| `GITHUB_REPO` | `shakogt-alt/sakura_prod` |

`GITHUB_BRANCH` не обязателен — по умолчанию `main`.

## 2. GitHub-токен

GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.

- Repository access: Only select repositories → `sakura_prod`
- Permissions → Contents: **Read and write**
- Сгенерировать, скопировать, вставить как значение `GITHUB_TOKEN` в Vercel.

Токен даёт доступ на запись только в этот репозиторий — админка коммитит через него каждое сохранение (team/blog/prices), поэтому история изменений видна в GitHub.

## 3. Передеплой

Переменные окружения применяются только к новому деплою. После сохранения всех пяти:
- запушить локальные коммиты (`git push` — есть что пушить), это само по себе создаст новый деплой, либо
- Vercel → Deployments → на последнем деплое → **Redeploy**.

## 4. Проверка

Открыть `https://sakurapro.vercel.app/admin/`, войти с `ADMIN_EMAIL`/`ADMIN_PASSWORD`. Дальше — Кристине можно отдавать только эти email+пароль, в Vercel/GitHub ей заходить не нужно.
