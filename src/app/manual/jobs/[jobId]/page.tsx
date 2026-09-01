import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ManualLayout } from "../../ManualLayout";
import {
  buildJobManualEntry,
  jobManualStaticParams,
} from "../../jobManualModel";
import { JobManualContent } from "./JobManualContent";

export const dynamicParams = false;

export function generateStaticParams() {
  return jobManualStaticParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ jobId: string }>;
}): Promise<Metadata> {
  const { jobId } = await params;
  const entry = buildJobManualEntry(jobId);
  if (!entry) {
    return {
      title: "직업 정보 · 게임 안내서",
      robots: { index: false, follow: false },
    };
  }
  return {
    title: `${entry.name} · 직업 도감 · 게임 안내서`,
    description: entry.summary,
    alternates: { canonical: `/manual/jobs/${entry.id}` },
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      siteName: "무슨무슨게임",
      title: `${entry.name} · 직업 도감`,
      description: entry.summary,
      url: `/manual/jobs/${entry.id}`,
      locale: "ko_KR",
      images: [
        {
          url: "/og-question-20260723.jpg",
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
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const entry = buildJobManualEntry(jobId);
  if (!entry) notFound();

  return (
    <ManualLayout
      currentSlug="job-codex"
      title={entry.name}
      summary={entry.summary}
    >
      <JobManualContent entry={entry} />
    </ManualLayout>
  );
}
