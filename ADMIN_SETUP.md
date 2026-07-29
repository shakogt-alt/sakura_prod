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

## 5. Google-отзывы (необязательно)

Во вкладке «Отзывы» есть кнопка «Синхронизировать с Google» — подтягивает до 5 реальных отзывов с Google-карточки клиники прямо в тот же список, что и отзывы, добавленные вручную (редактировать/удалять можно точно так же). Без этого раздела отзывы можно добавлять только руками — сайт и админка работают и без него.

### 5.1. Переменные окружения

Те же Vercel → `sakura_pro` → **Settings → Environment Variables**:

| Переменная | Значение |
|---|---|
| `GOOGLE_PLACES_API_KEY` | API-ключ из Google Cloud Console (см. ниже). |
| `GOOGLE_PLACE_ID` | ID карточки клиники на Google, вида `ChIJ...` (см. ниже). Без префикса `places/`. |

### 5.2. Как получить `GOOGLE_PLACES_API_KEY`

1. [console.cloud.google.com](https://console.cloud.google.com) → создать проект (или выбрать существующий).
2. **APIs & Services → Library** → найти «Places API (New)» → **Enable**.
3. **APIs & Services → Credentials → Create Credentials → API key**.
4. Обязательно ограничить ключ (кнопка «Restrict key»): **API restrictions → Places API (New)** — иначе ключ действует на все сервисы Google без разбора.
5. Скопировать ключ, вставить как `GOOGLE_PLACES_API_KEY` в Vercel.

Google потребует привязать карту / включить биллинг на проекте — это требование Google для любого использования Places API, даже в рамках бесплатного лимита. Этот шаг я сделать не могу, платёжные данные вводятся только вами напрямую в Google.

**По деньгам:** с марта 2025 у Google 1000 бесплатных вызовов в месяц на карточки места с отзывами. Кнопка синхронизации нажимается вручную и не вызывается автоматически при каждом заходе на сайт — 1000 вызовов при таком сценарии практически невозможно исчерпать. В реальности это должно стоить $0/мес, но сама привязка карты у Google обязательна.

### 5.3. Как найти `GOOGLE_PLACE_ID`

Открыть [Place ID Finder](https://developers.google.com/maps/documentation/places/web-service/place-id#find-id), в поиске ввести название клиники (как она называется на Google Картах) — инструмент покажет ID вида `ChIJ...`. Скопировать без части `places/`.

### 5.4. Передеплой

Как и с остальными переменными — применяются только к новому деплою (см. пункт 3).
