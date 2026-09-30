# numismat-server — AI-проксі для мобільних додатків Numismat

## Мета
Спільний бекенд для трьох клієнтів одного навчального додатку (облік колекції монет):
- Expo / React Native: `/Users/viktor_kravchuk/traning/numismat-expo-app` (загальний контекст проєкту — в його `AGENTS.md`)
- Kotlin / Android: `/Users/viktor_kravchuk/traning/numismat-kotlin-app`
- Swift / iOS: `/Users/viktor_kravchuk/traning/numismat-swift-app`

Навіщо: кнопки «цікаві факти» від різних AI-провайдерів (Groq, OpenAI, OpenRouter, …). Ключі цих API не можна
тримати в додатку → один сервіс-проксі на всі три клієнти. Промпт і список провайдерів змінюються без релізу
додатків, rate limit / логи / кеш — в одному місці. Gemini через Firebase AI Logic лишається в додатках окремим підходом «без свого сервера».

## Як працюємо (правила для AI)
- Малі кроки, без великих шматків коду за раз. Спершу коротко «навіщо», потім «як».
- Автор знає Express → Hono пояснювати через порівняння з Express.
- Код мінімальний, без передчасних абстракцій і зайвих бібліотек.
- Мова спілкування — українська.
- Після завершення кроку оновлювати «Поточний стан» і «Журнал» у цьому файлі.

## Стек
- Node 20+ (на сервері 20.9, локально 24) + TypeScript 5.9 + Hono (`@hono/node-server`), ESM.
- Dev: `npm run dev` (`tsx watch --env-file=.env`). Прод: `npm run build` (`tsc` → `dist/`), `npm start`.
- Виклики провайдерів — `fetch` без SDK (усі OpenAI-сумісні `/chat/completions`).
- Секрети — `.env` (є `.env.example`), читається `node --env-file=.env`, без `dotenv`.

## Контракт API
```
GET  /providers → [{ id: "groq-gpt-oss", title: "GPT-OSS 120B (Groq)", logo: "https://github.com/openai.png?size=128" }, ...]
                (9 шт., див. src/index.ts)
POST /chat      { provider, coin: Coin, messages: [{ role: "user" | "assistant", content }] } → { text }
                400 { error: "Unknown provider" }, 502 { error: "Provider error" | "Empty response" },
                500 { error: "Server error" } (у т.ч. таймаут провайдера 50 с) — завжди JSON
```
- Сервер stateless: клієнт щоразу шле всю історію `messages`, сервер додає `system`-промпт про монету.
- Клієнти: Expo — `fetch`, Kotlin — Ktor Client / OkHttp, Swift — `URLSession` + `async/await`.
- Відповіді містять markdown → клієнтам рендерити markdown.

## Інфраструктура
- Hetzner CX11 (1 vCPU, 2 GB RAM, Ubuntu), IP `116.203.220.233`, там же nginx + сайт `tetiana-redko.com`.
- Домен: `https://inua.tetiana-redko.com` → nginx (443, certbot-сертифікат `live/inua.tetiana-redko.com/`) →
  `proxy_pass http://127.0.0.1:3000` (`proxy_read_timeout 60s`); порт 80 → 301 на HTTPS. Порт 3000 назовні не відкривати.
- DNS — goodnet.ua (записи `@`, `www`, `inua`, `next` → той самий IP).
- Код на сервері: `/var/www/numismat-server` (`git clone` з GitHub `Shperung/numismat-server`), ключі — `.env` там же.
- pm2: процес `numismat-server`, запущений з `--node-args="--env-file=.env"`.
  `tetiana-redko.com` (id 0) — основний сайт, НЕ ЧІПАТИ. Команди pm2 лише за іменем, без `all` / `kill`.
- Оновлення: `cd /var/www/numismat-server && git pull && npm ci && npm run build && pm2 restart numismat-server`.
- Ollama на CX11 не тягне (2 GB RAM) → відкриті моделі через Groq / OpenRouter (`:free`). OpenAI — платно (prepaid, від $5).

### Пастки nginx / certbot
- У `sites-enabled/default` є 443-блок з `server_name *.tetiana-redko.com tetiana-redko.com` і сертифікатом лише
  `tetiana-redko.com` → будь-який піддомен без власного 443-блоку отримує чужий сертифікат (SSL-помилка).
- `certbot --nginx -d <піддомен>` через цей wildcard пише сертифікат у `default` і ламає основний сайт.
  Для нових піддоменів: `certbot certonly --nginx -d <домен>` + 443-блок у файлі піддомену вручну.
- Бекап конфігу nginx: `/root/nginx.bak`. Не лишати `*.save` у `sites-enabled/` — nginx їх теж вантажить.
- Інші порти на сервері: `777`, `3001`, `8082` (старий `inua-node`, зупинений у pm2).

## Поточний стан
Задеплоєно: `GET /providers` і `POST /chat` (Groq, `openai/gpt-oss-120b`) на `https://inua.tetiana-redko.com`,
поки без авторизації. Підключено в усіх трьох клієнтах (Expo, Kotlin, Swift).

## План
1. [x] Каркас Hono, `GET /providers`
2. [x] Деплой: nginx + HTTPS на `inua`, pm2
3. [x] `POST /chat` через Groq, ключ у `.env`
4. [x] Підключення в клієнтах (Expo, Kotlin, Swift) — Groq працює на всіх платформах
5. [ ] Захист: `Authorization: Bearer <токен>` (`hono/bearer-auth`) + rate limit
6. [ ] Інші провайдери: OpenRouter (`:free`), OpenAI
7. [ ] Промпт: менше галюцинацій, більше полів монети

## Журнал
- Каркас: Hono + `@hono/node-server`, слухає лише `127.0.0.1:3000`.
- На сервері Node 20.9 → TypeScript 7 (`tsc` — ESM без розширення) не запускається → `typescript@5.9`.
- Деплой `inua`: certbot записав сертифікат у `default` (див. «Пастки») → відкат з бекапу, 443-блок `inua` прописано вручну.
- `POST /chat`: провайдери в масиві `{ id, title, url, model, apiKey }`, `/providers` віддає лише `id`/`title`.
  Системний промпт — той самий, що для Gemini в Expo. Помилка провайдера → `console.error` + `502`.
- Groq: Llama тепер Enterprise («Contact Sales») → `openai/gpt-oss-120b` (Developer plan), id `groq-gpt-oss`.
- pm2 `restart` зберігає аргументи створення → змінити `--node-args` можна лише `pm2 delete` + `pm2 start` + `pm2 save`.
- Модель галюцинує факти про монети (вигадані серії, метали) і відповідає з markdown (`**`).
- OpenRouter: другий провайдер `openrouter-nemotron` (`nvidia/nemotron-3-super-120b-a12b:free`, `OPENROUTER_API_KEY`) — лише
  новий об'єкт у масиві, код `/chat` без змін. Список `:free` моделей часто змінюється: `curl https://openrouter.ai/api/v1/models` (без ключа).
  Gemma `:free` — 429 «rate-limited upstream» (спільний пул Google AI Studio), `inkling:free` — 403 (лише для агентів).
  `qwen3.8-27b:free` працює, але з граматичними помилками в українській.
- `provider` у `POST /chat` — наш `id` з `/providers`, не назва моделі (інакше `Unknown provider`).
  Клієнт моделей не знає: список лише з `/providers`, модель/URL/ключ — на сервері (інакше чужі витрати на платні моделі).
- 9 провайдерів через хелпери `groq()` / `openrouter()`: Groq — gpt-oss 120B/20B, qwen3.8-27b;
  OpenRouter `:free` — nemotron super/ultra, qwen, ling-3.0-flash, dots-3-note-preview, lfm-2.5-2.6b.
  Не працюють: Groq Llama (`model_not_found`, Enterprise), `inkling-small` (403), Gemma (429), `nemotron-3.5-lightning` (timeout).
  Дрібні моделі (lfm 2.6B, nemotron nano) галюцинують найсильніше. `dots` відповідає з `\n` на початку → `text.trim()`.
- Помилки в клієнтах при 10 кнопках одночасно:
  - на проді не було `OPENROUTER_API_KEY` у `.env` / без `pm2 restart` → усі OpenRouter `502`;
  - «JSON Parse error: Unexpected character: I» — reasoning-модель повернула порожній `content` → `.trim()` впав →
    Hono віддав текст `Internal Server Error`. Тепер: перевірка `text` → `502 Empty response`, `app.onError` → JSON.
  - повільні моделі (Nemotron Ultra 550B) → nginx 504 HTML через 60 с → `AbortSignal.timeout(50_000)` на `fetch`.
  - Nemotron Nano прибрано: пише англійські міркування замість відповіді. Qwen `:free` / Groq preview — часто `429`.
- `logo` у `/providers` — логотип виробника моделі (не хостингу): аватар офіційної GitHub-організації
  (`https://github.com/<org>.png?size=128`, PNG/JPEG, редірект на `avatars.githubusercontent.com`).
  PNG, бо SwiftUI `AsyncImage` не вміє SVG/ICO, Coil — SVG без окремого декодера.
  Організації: `openai`, `QwenLM`, `NVIDIA`, `inclusionAI`, `dots-studio`, `Liquid4All` (сайт у профілі = офіційний сайт компанії).
