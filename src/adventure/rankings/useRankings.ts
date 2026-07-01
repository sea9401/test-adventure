"use client";

import { useAsyncData } from "@/lib/useAsyncData";

// 개인 metric 3종(레벨/전투/낚시) + 길드 누적 명성 1종.
// (명성·고탑(주간/도전) 탭은 v2 에서 제거 — API 는 여전히 지원하나 UI 노출 안 함.)
export type RankingMetric = "level" | "battleCount" | "fishingScore" | "guild";

export type RankingEntry = {
  rank: number;
  name: string;
  level: number;
  /** 총 직업 숙련도(모든 직군 cumLevel 합, 환생/전직 누적). level 탭 표시·정렬. */
  cumLevel: number;
  /** 파라곤 레벨(획득 총 포인트 0~150). 만렙 미만은 0. */
  paragonLevel: number;
  fame: number;
  battleCount: number;
  fishingScore: number;
  weekHighest: number;
  /** 도전 모드 영구 최고층 (tower-challenge.v1.progress.highestFloor). */
  challengeHighest: number;
  mine: boolean;
};

export type RankingMe = {
  rank: number;
  name: string;
  level: number;
  cumLevel: number;
  paragonLevel: number;
  fame: number;
  battleCount: number;
  fishingScore: number;
  weekHighest: number;
  challengeHighest: number;
};

export type GuildRankingEntry = {
  rank: number;
  name: string;
  fameTotal: number;
  memberCount: number;
  grade: string;
  mine: boolean;
};

export type GuildRankingMe = {
  rank: number;
  name: string;
  fameTotal: number;
  memberCount: number;
  grade: string;
};

type RankingsResponse = {
  list: RankingEntry[];
  me: RankingMe | null;
};

type GuildRankingsResponse = {
  list: GuildRankingEntry[];
  me: GuildRankingMe | null;
};

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

// 랭킹 데이터 fetch — 서버가 닉네임 보유 유저 전체에서 derive 해 정렬한 결과를 받는다.
// 본인 등록 액션은 없음 (자동 포함). metric === "guild" 는 useGuildRankings 가 담당.
export function useRankings(metric: RankingMetric) {
  const { data, loading, error } = useAsyncData<RankingsResponse>(
    (signal) => getJson(`/api/rankings?metric=${metric}`, signal),
    [metric],
    { enabled: metric !== "guild", errorMessage: "랭킹을 불러오지 못했습니다." },
  );
  return { list: data?.list ?? null, me: data?.me ?? null, loading, error };
}

export function useGuildRankings(active: boolean) {
  const { data, loading, error } = useAsyncData<GuildRankingsResponse>(
    (signal) => getJson("/api/rankings/guilds", signal),
    [],
    { enabled: active, errorMessage: "길드 랭킹을 불러오지 못했습니다." },
  );
  return { list: data?.list ?? null, me: data?.me ?? null, loading, error };
}
