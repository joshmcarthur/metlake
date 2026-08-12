// @ts-check
import { defineConfig } from "astro/config";

// Served as plain static files by Caddy, alongside the archive mounted at /data/.
export default defineConfig({
  output: "static",
  trailingSlash: "always",
  build: {
    format: "directory",
  },
  vite: {
    optimizeDeps: {
      exclude: ["@duckdb/duckdb-wasm"],
    },
    worker: {
      format: "es",
    },
    server: {
      watch: {
        ignored: ["**/prototypes/**"],
      },
    },
  },
});
