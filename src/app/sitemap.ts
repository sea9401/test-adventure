import type { MetadataRoute } from "next";
import { MANUAL_SECTIONS } from "./manual/sections";

const SITE_URL = "https://msmsge.com";

// 실제 콘텐츠를 반환하는 공개 URL만 싣는다. / 와 /manual 은 각각 대문과 첫
// 안내서로 이동하는 주소라 중복 URL이 되므로 사이트맵에서는 제외한다.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/sign-in`,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...["terms", "privacy", "operations", "account-deletion", "licenses"].map((path) => ({
      url: `${SITE_URL}/${path}`,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
    ...MANUAL_SECTIONS.map((section) => ({
      url: `${SITE_URL}/manual/${section.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
