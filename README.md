# Анализатор кредитной истории

  AI-сервис для анализа кредитных историй из российских бюро (НБКИ, ОКБ, Скоринг Бюро).

  ## Стек
  - Frontend: React 18 + TypeScript + Vite + TailwindCSS
  - Backend: Node.js + Express 5 + TypeScript
  - AI: OpenRouter (nvidia/nemotron-3-nano-30b-a3b:free)
  - PDF: Puppeteer + Chrome
  - DB: PostgreSQL + Drizzle ORM

  ## Запуск
  ```bash
  cp .env.example .env
  # Укажите DATABASE_URL и OPENROUTER_API_KEY в .env
  pnpm install
  pnpm --filter @workspace/api-server run dev
  pnpm --filter @workspace/credit-analyzer run dev
  ```

  ## Переменные окружения
  - `DATABASE_URL` — PostgreSQL строка подключения
  - `OPENROUTER_API_KEY` — ключ OpenRouter (бесплатно на openrouter.ai)
  