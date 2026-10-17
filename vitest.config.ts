import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // "server-only" blocca l'import fuori da Next: nei test basta un modulo vuoto
      "server-only": path.resolve(__dirname, "src/lib/__tests__/empty.ts"),
    },
  },
});
