
process.env.QROUTE_SERVER_HOST = "127.0.0.1";

const { default: app } = await import("./index.ts");

const port = Number(process.env.PORT) || 3001;
const host = process.env.QROUTE_SERVER_HOST || "127.0.0.1";

app.listen(port, host, () => {
  console.log(`QRoute API server running at http://${host}:${port}`);
});
