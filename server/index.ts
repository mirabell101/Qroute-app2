
import "dotenv/config";

import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";

import {
  getSupabaseClient,
  getSupabaseUrlSafe,
  isSupabaseConfigured,
} from "./supabaseClient.js";

const app = express();
const port = Number(process.env.PORT) || 3001;
const startedAt = Date.now();

app.use(express.json());

// Express server health check
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    uptime: Number(process.uptime().toFixed(2)),
    startedAt: new Date(startedAt).toISOString(),
  });
});

// Supabase service connectivity check
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

      // Check the Supabase Auth service.
      const response = await fetch(`${url}/auth/v1/health`, {
        method: "GET",
        headers: {
          apikey: key,
        },
      });

      if (!response.ok) {
        const details = await response.text();

        console.error(
          `[server] Supabase returned HTTP ${response.status}:`,
          details
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

app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
});
