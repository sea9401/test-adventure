"use client";

import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/lib/usePagination";

// 길드원 활동 내역 — 최근 가입·임명·금고 입금·국가 선포·창단. 길드 정보 탭 하단.
//   서버(/api/v2/guild/activity)가 type·actorName·targetName·meta·createdAt 을 내려준다.

export type GuildActivity = {
  id: number;
  type: string;
  actorName: string | null;
  targetName: string | null;
  meta: {
    amount?: number;
    role?: string;
    nationName?: string;
    questTitle?: string;
    deliveryTitle?: string;
    itemName?: string;
    smithyLevel?: number;
    buildingName?: string;
    buildingLevel?: number;
    supplyName?: string;
    supplyLevel?: number;
    fameCost?: number;
    drillTitle?: string;
    rewardMastery?: number;
    artisanXp?: number;
    artisanRank?: number;
    titleName?: string;
    rewardGold?: number;
    rewardFame?: number;
    mapFragments?: number;
  } | null;
  createdAt: string;
};

const ROLE_NAME: Record<string, string> = {
  vice_master: "관리자",
  manager: "관리자",
  member: "일반",
};

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 60) return "방금";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return `${Math.floor(day / 30)}달 전`;
}

function describe(a: GuildActivity): string {
  const actor = a.actorName ?? "누군가";
  const target = a.targetName ?? "길드원";
  switch (a.type) {
    case "guild_create":
      return `${actor} 님이 길드를 창단했어요`;
    case "member_join":
      return `${target} 님이 길드에 합류했어요`;
    case "role_change": {
      const role = a.meta?.role ?? "";
      if (role === "member") return `${actor} 님이 ${target} 님의 직책을 해제했어요`;
      return `${actor} 님이 ${target} 님을 ${ROLE_NAME[role] ?? role}로 임명했어요`;
    }
    case "gold_deposit":
      return `${actor} 님이 금고에 ${(a.meta?.amount ?? 0).toLocaleString()} G 입금했어요`;
    case "workshop_weekly_claim":
      return `${actor} 님이 ${a.meta?.questTitle ?? "제작 의뢰"} 보상을 수령했어요`;
    case "exploration_weekly_claim":
      return `${actor} 님이 ${a.meta?.questTitle ?? "탐사 의뢰"} 보상을 수령했어요`;
    case "exploration_expedition_dispatch":
      return `${actor} 님이 ${a.meta?.questTitle ?? "원정대"}를 파견했어요`;
    case "exploration_expedition_claim":
      return `${actor} 님이 ${a.meta?.questTitle ?? "원정대"} 보상을 회수했어요${
        a.meta?.mapFragments
          ? ` · 지도 조각 +${a.meta.mapFragments.toLocaleString()}`
          : ""
      }`;
    case "exploration_event_resolve":
      return `${actor} 님이 ${a.meta?.questTitle ?? "탐사 사건"}에서 ${a.meta?.deliveryTitle ?? "선택지"}을 선택했어요`;
    case "workshop_delivery":
      return `${actor} 님이 ${a.meta?.deliveryTitle ?? "제작품 납품"}을 완료했어요`;
    case "workshop_craft_only":
      return `${actor} 님이 ${a.meta?.itemName ?? "제작 전용 장비"} 제작에 성공했어요`;
    case "artisan_rank_reward":
      return `${actor} 님이 장인 랭킹 ${a.meta?.artisanRank ?? "?"}위 보상${a.meta?.titleName ? ` (${a.meta.titleName})` : ""}을 수령했어요${
        a.meta?.rewardFame ? ` · 명성 +${a.meta.rewardFame.toLocaleString()}` : ""
      }`;
    case "smithy_upgrade":
      return `${actor} 님이 길드 대장간을 Lv ${a.meta?.smithyLevel ?? "?"}로 업그레이드했어요`;
    case "building_upgrade":
      return `${actor} 님이 ${a.meta?.buildingName ?? "영지 건물"}을 Lv ${a.meta?.buildingLevel ?? "?"}로 업그레이드했어요`;
    case "combat_supply_upgrade":
      return `${actor} 님이 ${a.meta?.supplyName ?? "전투보급"}을 Lv ${a.meta?.supplyLevel ?? "?"}로 업그레이드했어요${
        a.meta?.fameCost ? ` · 명성 -${a.meta.fameCost.toLocaleString()}` : ""
      }`;
    case "training_drill_claim":
      return `${actor} 님이 ${a.meta?.drillTitle ?? "훈련"}을 완료했어요${
        a.meta?.rewardMastery
          ? ` · 숙련도 +${a.meta.rewardMastery.toLocaleString()}`
          : ""
      }`;
    case "nation_declare":
      return `${actor} 님이 ${a.meta?.nationName ?? "국가"} 국가를 선포했어요`;
    default:
      return `${actor} 님의 활동`;
  }
}

// 타입별 좌측 점 색 — 가벼운 시각 구분.
const DOT_CLASS: Record<string, string> = {
  guild_create: "bg-amber-500",
  member_join: "bg-emerald-500",
  role_change: "bg-sky-500",
  gold_deposit: "bg-yellow-500",
  workshop_weekly_claim: "bg-emerald-500",
  exploration_weekly_claim: "bg-cyan-500",
  exploration_expedition_dispatch: "bg-cyan-500",
  exploration_expedition_claim: "bg-emerald-500",
  exploration_event_resolve: "bg-violet-500",
  workshop_delivery: "bg-teal-500",
  workshop_craft_only: "bg-emerald-500",
  artisan_rank_reward: "bg-amber-500",
  smithy_upgrade: "bg-orange-500",
  building_upgrade: "bg-orange-500",
  combat_supply_upgrade: "bg-rose-500",
  training_drill_claim: "bg-emerald-500",
  nation_declare: "bg-indigo-500",
};

const ACTIVITY_PAGE_SIZE = 10;

export function GuildActivityList({
  activity,
  loading,
}: {
  activity: GuildActivity[];
  loading?: boolean;
}) {
  const pager = usePagination(
    activity,
    ACTIVITY_PAGE_SIZE,
    activity[0]?.id ?? "empty",
  );

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-200 px-3 py-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        활동 내역
      </div>
      {activity.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
          {loading ? "불러오는 중…" : "아직 활동 내역이 없어요."}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {pager.pageItems.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 px-3 py-2 text-xs"
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLASS[a.type] ?? "bg-zinc-400"}`}
                />
                <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-200">
                  {describe(a)}
                </span>
                <span className="shrink-0 tabular-nums text-zinc-400 dark:text-zinc-500">
                  {relTime(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
          <Pagination
            page={pager.page}
            pageCount={pager.pageCount}
            setPage={pager.setPage}
            className="px-3 pb-3"
          />
        </>
      )}
    </div>
  );
}
