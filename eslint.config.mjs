import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // 마운트 1회 fetch→setState 는 이 코드베이스의 의도적·표준 데이터 로딩 패턴
      // (Suspense/RSC 이전). 버그가 아니라 가시 신호로만 — error 대신 warn.
      "react-hooks/set-state-in-effect": "warn",
      // _ 접두 인자/변수는 의도적 미사용으로 간주(미사용 캐치는 유지).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
