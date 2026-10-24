import express, { type Request, type Response, type NextFunction } from "express";

const app = express();
const port = Number(process.env.PORT) || 3001;
const startedAt = Date.now();

app.use(express.json());

app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    uptime: Number(process.uptime().toFixed(2)),
    startedAt: new Date(startedAt).toISOString(),
  });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ status: "error", message: "Not found" });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[server] Unhandled error:", err);

  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ status: "error", message });
});

app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
});
