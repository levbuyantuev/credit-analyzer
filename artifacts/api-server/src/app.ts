import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import { createProxyMiddleware } from "http-proxy-middleware";
import router from "./routes";
import { logger } from "./lib/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Нативный SSE-прокси через fetch() — поддерживает ReadableStream без буферизации
app.post("/multiagent/chat/stream", async (req, res) => {
  const body = JSON.stringify(req.body);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const upstream = await fetch("http://localhost:8000/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (!upstream.body) {
      res.write(`data: {"type":"error","message":"No response body from agent"}\n\n`);
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    req.on("close", () => reader.cancel());

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err: any) {
    logger.error({ err }, "SSE fetch proxy error");
    if (!res.writableEnded) {
      res.write(`data: {"type":"error","message":"${err.message}"}\n\n`);
      res.end();
    }
  }
});

// Проксируем /multiagent/* → Python FastAPI сервис на порту 8000
// proxyTimeout 180s — агенты могут работать до ~60с
app.use(
  "/multiagent",
  createProxyMiddleware({
    target: "http://localhost:8000",
    changeOrigin: true,
    proxyTimeout: 180000,
    timeout: 180000,
    on: {
      proxyRes: (proxyRes, req, res: any) => {
        // Для SSE-стриминга отключаем буферизацию и сбрасываем заголовки сразу
        if (proxyRes.headers["content-type"]?.includes("text/event-stream")) {
          proxyRes.headers["x-accel-buffering"] = "no";
          proxyRes.headers["cache-control"] = "no-cache";
          res.flushHeaders?.();
        }
      },
      error: (err, req, res: any) => {
        logger.error({ err }, "Proxy error to multiagent service");
        if (!res.headersSent) {
          res.status(502).json({ error: "Multiagent service unavailable" });
        }
      },
    },
  }),
);

// Раздача статики фронтенда (сборка Vite) — ПОСЛЕ всех API-маршрутов
const FRONTEND_DIST = path.join(__dirname, "../../credit-analyzer/dist/public");
app.use(express.static(FRONTEND_DIST));

// Catch-all для React Router (SPA) — должен быть ПОСЛЕДНИМ
app.get("{*splat}", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }
  res.sendFile(path.join(FRONTEND_DIST, "index.html"));
});

export default app;
