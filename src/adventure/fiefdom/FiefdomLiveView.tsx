"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { StarlightLiveMap } from "./StarlightLiveMap";
import { VillageBuilder } from "./VillageBuilder";
import { useFiefdomServer } from "./useFiefdomServer";

// 라이브 모드 영지 진입 화면 — 서버 sync + 길드 단위 PvP.
// load 상태별 분기:
//   loading        → 스피너 카드
//   unauthorized   → 로그인 안내
//   no_guild       → 길드 가입 안내
//   network_error  → 재시도 버튼
//   ready          → 별자리 맵 / 빌더 토글 (기본은 맵)
type View = "map" | "village";

export function FiefdomLiveView({ onBack }: { onBack: () => void }) {
  const api = useFiefdomServer();
  const [view, setView] = useState<View>("map");

  if (api.load.kind === "loading") {
    return (
      <ShellCard onBack={onBack} title="길드 영지">
        <Card padding="md" className="text-center text-sm text-zinc-600 dark:text-zinc-300">
          영지 정보를 불러오는 중…
        </Card>
      </ShellCard>
    );
  }
  if (api.load.kind === "unauthorized") {
    return (
      <ShellCard onBack={onBack} title="길드 영지">
        <Card padding="md" className="space-y-2 text-sm">
          <div className="font-semibold">로그인이 필요합니다</div>
          <p className="text-zinc-600 dark:text-zinc-300">
            라이브 모드 영지는 로그인한 길드원만 접근할 수 있어요.
          </p>
        </Card>
      </ShellCard>
    );
  }
  if (api.load.kind === "no_guild") {
    return (
      <ShellCard onBack={onBack} title="길드 영지">
        <Card padding="md" className="space-y-2 text-sm">
          <div className="font-semibold">길드 가입이 필요합니다</div>
          <p className="text-zinc-600 dark:text-zinc-300">
            영지는 길드 단위로 운영됩니다. 광장 → 길드 둘러보기에서 가입 후 다시 진입해주세요.
          </p>
        </Card>
      </ShellCard>
    );
  }
  if (api.load.kind === "network_error") {
    return (
      <ShellCard onBack={onBack} title="길드 영지">
        <Card padding="md" className="space-y-2 text-sm">
          <div className="font-semibold text-rose-700 dark:text-rose-300">서버 연결 오류</div>
          <p className="text-zinc-600 dark:text-zinc-300">{api.load.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
          >
            새로고침
          </button>
        </Card>
      </ShellCard>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {view === "map" ? `${api.load.guildName} · 별빛 권역 지도` : "영주의 회관"}
        </h2>
        <div className="flex gap-2">
          {view === "village" && (
            <button
              type="button"
              onClick={() => setView("map")}
              className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200 dark:hover:bg-indigo-950"
            >
              ✨ 지도
            </button>
          )}
          <button
            type="button"
            onClick={onBack}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            뒤로
          </button>
        </div>
      </div>
      {view === "map" ? (
        <StarlightLiveMap api={api} onEnterVillage={() => setView("village")} />
      ) : (
        <VillageBuilder api={api} />
      )}
    </div>
  );
}

function ShellCard({
  onBack,
  title,
  children,
}: {
  onBack: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          뒤로
        </button>
      </div>
      {children}
    </div>
  );
}
