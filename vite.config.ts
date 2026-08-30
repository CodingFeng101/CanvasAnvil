import { defineConfig } from "vite";
import type { Connect, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiMiddleware } from "./server/http/vite-middleware";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Runs the API inside the dev and preview servers so `npm run dev` is a single
 * command. The routes come from server/http/routes.ts, the same table the
 * production Express server reads.
 */
function localApiPlugin(): Plugin {
  const attach = (middlewares: Connect.Server) => {
    middlewares.use(apiMiddleware());
  };
  return {
    name: "local-api-routes",
    configureServer: (server) => attach(server.middlewares),
    configurePreviewServer: (server) => attach(server.middlewares),
  };
}

export default defineConfig({
  server: { host: "0.0.0.0", port: 8001 },
  preview: { host: "0.0.0.0", port: 8001 },
  resolve: {
    alias: {
      "@contracts": path.resolve(root, "contracts"),
      "@prompts": path.resolve(root, "resources/prompts"),
      "@": path.resolve(root, "client"),
    },
  },
  optimizeDeps: { entries: ["index.html"] },
  build: {
    sourcemap: "hidden",
    rollupOptions: {
      output: {
        // Split by package. The object form of manualChunks makes each listed
        // package a chunk entry, which let Vite's dynamic-import preload
        // helper get hoisted into a vendor chunk and pulled into the initial
        // load; returning undefined leaves placement to Rollup.
        manualChunks(id: string) {
          // Every lazy chunk needs this helper. Left to Rollup it landed in
          // the PowerPoint chunk, which made the entry preload 800 kB.
          if (id.includes("vite/preload-helper")) return "vendor-react";
          if (!id.includes("node_modules")) return;

          const match = /node_modules[\\/](?:(@[^\\/]+)[\\/])?([^\\/]+)/.exec(id);
          const pkg = match ? `${match[1] ? `${match[1]}/` : ""}${match[2]}` : "";

          if (pkg === "react" || pkg === "react-dom" || pkg === "scheduler") return "vendor-react";
          if (pkg === "pptxgenjs" || pkg === "pdf-lib") return "vendor-office";
          if (pkg === "jszip" || pkg === "pako") return "vendor-zip";
          if (pkg === "mammoth") return "vendor-docs";
          if (pkg === "react-markdown" || pkg === "remark-gfm" || pkg === "prism-react-renderer") {
            return "vendor-markdown";
          }
          if (pkg === "react-drawio") return "vendor-drawio";
          if (pkg === "ai" || pkg.startsWith("@ai-sdk/") || pkg === "openai") return "vendor-ai";
          if (pkg === "lucide-react" || pkg === "motion" || pkg === "sonner") return "vendor-ui";
          if (pkg.startsWith("@radix-ui/")) return "vendor-radix";
          return;
        },
      },
    },
  },
  plugins: [localApiPlugin(), react()],
});
