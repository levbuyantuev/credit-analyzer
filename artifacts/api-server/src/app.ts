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

// Проксируем /multiagent/* → Python FastAPI сервис на порту 8000
app.use(
  "/multiagent",
  createProxyMiddleware({
    target: "http://localhost:8000",
    changeOrigin: true,
    on: {
      error: (err, req, res: any) => {
        logger.error({ err }, "Proxy error to multiagent service");
        res.status(502).json({ error: "Multiagent service unavailable" });
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
