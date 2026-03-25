import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendHttpTarget =
    env.VITE_BACKEND_PROXY_TARGET?.trim() || "http://127.0.0.1:8000";
  const backendWsTarget = backendHttpTarget.replace(/^http/i, "ws");

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: "0.0.0.0",
      port: 5000,
      allowedHosts: true,
      proxy: {
        "/api/chats/ws": {
          target: backendWsTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
        },
        "/api": {
          target: backendHttpTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
