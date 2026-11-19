
import "dotenv/config";

import app from "./index.ts";

const port = Number(process.env.PORT) || 3000;
const host = "127.0.0.1";

app.listen(port, host, () => {
  console.log(
    `[server] listening on http://${host}:${port}`
  );
});
