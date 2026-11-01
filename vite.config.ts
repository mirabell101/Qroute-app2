import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ["PORT", "QROUTE_"]);

  return {
    plugins: [react(), tailwindcss()],

    server: {
      host: "0.0.0.0",
      proxy: {
        "/api": {
          target:
            env.QROUTE_API_PROXY_TARGET ||
            `http://127.0.0.1:${env.PORT || "3001"}`,
          changeOrigin: true,
          configure: (proxy) => {
            // The browser talks to Vite at its own origin; CORS applies only
            // to direct browser-to-API requests.
            proxy.on("proxyReq", (proxyRequest) => {
              proxyRequest.removeHeader("origin");
            });
          },
        },
      },
    },

    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  };
});
