
import "dotenv/config";
import authRoutes from './routes/authRoutes.ts';
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";

import {
  getSupabaseClient,
  getSupabaseUrlSafe,
  isSupabaseConfigured,
} from "./supabaseClient.ts";

const app = express();
const port = Number(process.env.PORT) || 3001;
const startedAt = Date.now();

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  ...(process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
]);

const allowedMethods = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);
const allowedHeaders = new Set(["content-type", "authorization"]);

// CORS must run before JSON parsing and routes so browser preflights can finish.
app.use((req, res, next) => {
  const origin = req.get("Origin");

  if (origin) {
    const normalizedOrigin = origin.replace(/\/$/, "");
    if (!allowedOrigins.has(normalizedOrigin)) {
      res.status(403).json({
        status: "error",
        message: "Origin is not allowed.",
      });
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", normalizedOrigin);
    res.vary("Origin");
  }

  if (req.method === "OPTIONS") {
    const requestedMethod = req.get("Access-Control-Request-Method")?.toUpperCase();
    const requestedHeaders = (req.get("Access-Control-Request-Headers") ?? "")
      .split(",")
      .map((header) => header.trim().toLowerCase())
      .filter(Boolean);

    if (
      !requestedMethod ||
      !allowedMethods.has(requestedMethod) ||
      requestedHeaders.some((header) => !allowedHeaders.has(header))
    ) {
      res.status(400).json({
        status: "error",
        message: "CORS preflight request is not allowed.",
      });
      return;
    }

    res.setHeader("Access-Control-Allow-Methods", [...allowedMethods].join(", "));
    if (requestedHeaders.length) {
      res.setHeader("Access-Control-Allow-Headers", requestedHeaders.join(", "));
    }
    res.setHeader("Access-Control-Max-Age", "600");
    res.status(204).end();
    return;
  }

  next();
});

app.use(express.json());
app.use("/api/auth", authRoutes);

// Express server health check
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    uptime: Number(process.uptime().toFixed(2)),
    startedAt: new Date(startedAt).toISOString(),
  });
});

// Supabase Auth service connectivity check
app.get(
  "/api/db/health",
  async (_req: Request, res: Response) => {
    const url = getSupabaseUrlSafe();
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!isSupabaseConfigured() || !url || !key) {
      res.status(503).json({
        status: "error",
        database: "supabase",
        configured: false,
        connected: false,
        message:
          "Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in .env",
      });
      return;
    }

    const started = Date.now();

    try {
      // Verify that the Supabase client can be initialized.
      getSupabaseClient();

      // Check whether Supabase Auth is reachable.
      const response = await fetch(`${url}/auth/v1/health`, {
        method: "GET",
        headers: {
          apikey: key,
        },
      });

      if (!response.ok) {
        console.error(
          `[server] Supabase Auth returned HTTP ${response.status}`
        );

        res.status(503).json({
          status: "error",
          service: "supabase-auth",
          configured: true,
          connected: false,
          message: `Supabase returned HTTP ${response.status}`,
        });
        return;
      }

      res.status(200).json({
        status: "ok",
        service: "supabase-auth",
        configured: true,
        connected: true,
        latencyMs: Date.now() - started,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown error";

      console.error("[server] Supabase health check failed:", message);

      res.status(503).json({
        status: "error",
        service: "supabase-auth",
        configured: true,
        connected: false,
        message: "Could not reach Supabase",
      });
    }
  }
);

// Supabase roles table connectivity check
app.get(
  "/api/db/roles",
  async (_req: Request, res: Response) => {
    if (!isSupabaseConfigured()) {
      res.status(503).json({
        status: "error",
        table: "roles",
        configured: false,
        connected: false,
        message: "Supabase is not configured",
      });
      return;
    }

    const started = Date.now();

    try {
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from("roles")
        .select("id, name, description, created_at")
        .order("id", { ascending: true });

      if (error) {
        console.error("[server] Roles query failed:", {
          code: error.code,
          message: error.message,
        });

        res.status(500).json({
          status: "error",
          table: "roles",
          configured: true,
          connected: false,
          message: error.message,
          code: error.code,
        });
        return;
      }

      res.status(200).json({
        status: "ok",
        table: "roles",
        configured: true,
        connected: true,
        count: data.length,
        latencyMs: Date.now() - started,
        roles: data,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown error";

      console.error("[server] Roles health check failed:", message);

      res.status(503).json({
        status: "error",
        table: "roles",
        configured: true,
        connected: false,
        message: "Could not query the roles table",
      });
    }
  }
);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    status: "error",
    message: "Not found",
  });
});

// Error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use(
  (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    console.error("[server] Unhandled error:", err);

    res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
);

app.listen(port, "0.0.0.0", () => {
  console.log(`[server] listening on 0.0.0.0:${port}`);
});
