
import "dotenv/config";

import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";

import authRoutes from "./routes/authRoutes.ts";
import accountRoutes from "./routes/accountRoutes.ts";
import adminRoutes from "./routes/adminRoutes.ts";
import communityRoutes from "./routes/communityRoutes.ts";
import recentSearchesRoutes from "./routes/recentSearchesRoutes.ts";

import {
  getSupabaseClient,
  getSupabaseUrlSafe,
  isSupabaseConfigured,
} from "./supabaseClient.ts";

import { getAllowedOrigins } from "./origins.ts";

// =====================================================
// APPLICATION INITIALIZATION
// =====================================================

const app = express();

const startedAt = Date.now();

const allowedOrigins = getAllowedOrigins();

const allowedMethods = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
];

const allowedHeaders = [
  "Content-Type",
  "Authorization",
];

// =====================================================
// CORS CONFIGURATION
// Must run before routes and JSON parsing.
// =====================================================

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

    res.setHeader(
      "Access-Control-Allow-Origin",
      normalizedOrigin
    );

    res.vary("Origin");
  }

  if (req.method === "OPTIONS") {
    const requestedMethod = req
      .get("Access-Control-Request-Method")
      ?.toUpperCase();

    const requestedHeaders = (
      req.get("Access-Control-Request-Headers") ?? ""
    )
      .split(",")
      .map((header) => header.trim().toLowerCase())
      .filter(Boolean);

    const allowedHeadersLowercase = allowedHeaders.map(
      (header) => header.toLowerCase()
    );

    if (
      !requestedMethod ||
      !allowedMethods.includes(requestedMethod) ||
      requestedHeaders.some(
        (header) => !allowedHeadersLowercase.includes(header)
      )
    ) {
      res.status(400).json({
        status: "error",
        message: "CORS preflight request is not allowed.",
      });
      return;
    }

    res.setHeader(
      "Access-Control-Allow-Methods",
      allowedMethods.join(", ")
    );

    if (requestedHeaders.length > 0) {
      res.setHeader(
        "Access-Control-Allow-Headers",
        requestedHeaders.join(", ")
      );
    }

    res.setHeader("Access-Control-Max-Age", "600");

    res.status(204).end();
    return;
  }

  next();
});

// =====================================================
// BODY PARSING
// =====================================================

app.use(express.json({ limit: "1mb" }));

// =====================================================
// API ROUTES
// =====================================================

app.use("/api/auth", authRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/recent-searches", recentSearchesRoutes);

// =====================================================
// GENERAL HEALTH CHECK
// GET /api/health
// =====================================================

app.get(
  "/api/health",
  (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      uptime: Number(process.uptime().toFixed(2)),
      startedAt: new Date(startedAt).toISOString(),
    });
  }
);

// =====================================================
// SUPABASE AUTH HEALTH CHECK
// GET /api/db/health
// =====================================================

app.get(
  "/api/db/health",
  async (_req: Request, res: Response) => {
    const url = getSupabaseUrlSafe();
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!isSupabaseConfigured() || !url || !key) {
      res.status(503).json({
        status: "error",
        service: "supabase-auth",
        configured: false,
        connected: false,
        message:
          "Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in your environment variables.",
      });
      return;
    }

    const started = Date.now();

    try {
      getSupabaseClient();

      const response = await fetch(
        `${url}/auth/v1/health`,
        {
          method: "GET",
          headers: {
            apikey: key,
          },
        }
      );

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
        error instanceof Error
          ? error.message
          : "Unknown error";

      console.error(
        "[server] Supabase health check failed:",
        message
      );

      res.status(503).json({
        status: "error",
        service: "supabase-auth",
        configured: true,
        connected: false,
        message: "Could not reach Supabase.",
      });
    }
  }
);

// =====================================================
// SUPABASE ROLES TABLE HEALTH CHECK
// GET /api/db/roles
// =====================================================

app.get(
  "/api/db/roles",
  async (_req: Request, res: Response) => {
    if (!isSupabaseConfigured()) {
      res.status(503).json({
        status: "error",
        table: "roles",
        configured: false,
        connected: false,
        message: "Supabase is not configured.",
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
        error instanceof Error
          ? error.message
          : "Unknown error";

      console.error(
        "[server] Roles health check failed:",
        message
      );

      res.status(503).json({
        status: "error",
        table: "roles",
        configured: true,
        connected: false,
        message: "Could not query the roles table.",
      });
    }
  }
);

// =====================================================
// API 404 HANDLER
// =====================================================

app.use(
  "/api",
  (_req: Request, res: Response) => {
    res.status(404).json({
      status: "error",
      message: "API endpoint not found.",
    });
  }
);

// =====================================================
// JSON PARSING ERROR HANDLER
// =====================================================

app.use(
  (
    err: unknown,
    _req: Request,
    res: Response,
    next: NextFunction
  ) => {
    if (
      err instanceof SyntaxError &&
      "status" in err &&
      err.status === 400
    ) {
      res.status(400).json({
        status: "error",
        message: "Invalid JSON request body.",
      });
      return;
    }

    next(err);
  }
);

// =====================================================
// GLOBAL ERROR HANDLER
// =====================================================

app.use(
  (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    console.error(
      "[server] Unhandled error:",
      err
    );

    if (res.headersSent) {
      return;
    }

    res.status(500).json({
      status: "error",
      message: "Internal server error.",
    });
  }
);

// =====================================================
// EXPORT EXPRESS APP
// Vercel handles server startup in production.
// server/dev.ts handles local startup.
// =====================================================

export default app;
