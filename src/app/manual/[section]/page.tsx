import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ManualLayout } from "../ManualLayout";
import { MANUAL_CONTENT } from "../content";
import { MANUAL_SLUGS, getSection } from "../sections";

// 게임 안내서 한 섹션 페이지. 슬러그가 등록 목록에 없으면 404.
// generateStaticParams 로 빌드 시 모든 섹션을 정적 생성 — 로딩 속도와 SEO 모두 이득.

export function generateStaticParams() {
  return MANUAL_SLUGS.map((section) => ({ section }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  const meta = getSection(section);
  if (!meta) {
    return { title: "게임 안내서", robots: { index: false, follow: false } };
  }
  return {
    title: `${meta.title} · 게임 안내서`,
    description: meta.summary,
    alternates: { canonical: `/manual/${meta.slug}` },
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      siteName: "무슨무슨게임",
      title: `${meta.title} · 게임 안내서`,
      description: meta.summary,
      url: `/manual/${meta.slug}`,
      locale: "ko_KR",
      images: [
        {
          url: "/og-shield-20260723.jpg",
          width: 1200,
          height: 630,
          alt: "무슨무슨게임",
        },
      ],
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const meta = getSection(section);
  const Content = MANUAL_CONTENT[section];
  if (!meta || !Content) notFound();
  return (
    <ManualLayout
      currentSlug={section}
      title={meta.title}
      summary={meta.summary}
    >
      <Content />
    </ManualLayout>
  );
}
