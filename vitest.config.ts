import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // La build (.next/standalone) contiene una copia dei sorgenti: i test si eseguono solo da src
  test: { exclude: [...configDefaults.exclude, ".next/**"] },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // "server-only" blocca l'import fuori da Next: nei test basta un modulo vuoto
      "server-only": path.resolve(__dirname, "src/lib/__tests__/empty.ts"),
    },
  },
});
