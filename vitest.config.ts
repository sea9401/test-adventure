import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Next.js 의 server-only marker — vitest 에서는 빈 스텁으로 매핑해 import 만 해소.
      "server-only": path.resolve(__dirname, "test-stubs/server-only.ts"),
    },
  },
  test: {
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "toolkit/**/*.test.ts",
    ],
    environment: "node",
  },
});
