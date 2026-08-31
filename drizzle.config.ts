import { defineConfig } from "drizzle-kit";
import { loadEnvConfig } from "@next/env";

// drizzle-kit 은 .env 파일을 자동 로드하지 않으므로 Next.js 가 쓰는
// @next/env 로 .env.development.local / .env.local 등을 직접 로드.
// 두 번째 인자 true 로 dev 모드 강제 — `.env.development.local` 우선.
loadEnvConfig(process.cwd(), true);

export default defineConfig({
  schema: [
    "./src/db/schema.ts",
    "./src/db/lotterySchema.ts",
    "./src/db/cookingSchema.ts",
  ],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
