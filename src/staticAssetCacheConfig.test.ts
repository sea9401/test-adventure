import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

const STATIC_CACHE = "public, max-age=86400, stale-while-revalidate=604800";

describe("public static asset cache headers", () => {
  it("게임 이미지·앱 아이콘·manifest를 브라우저에 하루 캐시한다", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const expectedSources = [
      "/images/:path*",
      "/icon-192.png",
      "/icon-512.png",
      "/favicon.ico",
      "/manifest.webmanifest",
    ];

    for (const source of expectedSources) {
      const rule = rules.find((candidate) => candidate.source === source);
      expect(rule, `${source} header rule`).toBeDefined();
      expect(rule?.headers).toContainEqual({
        key: "Cache-Control",
        value: STATIC_CACHE,
      });
    }
  });

  it("서비스 워커는 계속 캐시하지 않는다", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const serviceWorker = rules.find((rule) => rule.source === "/sw.js");

    expect(serviceWorker?.headers).toContainEqual({
      key: "Cache-Control",
      value: "no-cache, no-store, must-revalidate",
    });
  });
});
