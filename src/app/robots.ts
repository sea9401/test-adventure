import type { MetadataRoute } from "next";

const SITE_URL = "https://msmsge.com";

// 검색엔진은 대문과 게임 안내서만 수집한다. Next 정적 자원과 공유 이미지는
// 차단하지 않아 검색 로봇이 공개 페이지를 실제 사용자와 같은 모습으로 읽게 한다.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin",
        "/battle",
        "/character",
        "/create",
        "/dev",
        "/feedback",
        "/guild",
        "/hidden",
        "/icons",
        "/map",
        "/notifications",
        "/outpost",
        "/plaza",
        "/profile",
        "/quests",
        "/settings",
        "/staging-closed",
        "/town",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
