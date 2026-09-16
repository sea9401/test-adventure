"use client";

import { useState } from "react";
import type { CoopVisibility } from "@/adventure/data/v2/coopBosses";
import { Card } from "@/components/ui/Card";
import { SURFACE_ACCENT, SURFACE_INSET } from "@/components/ui/surfaces";
import { CoopFreeSupportOption } from "./CoopFreeSupportOption";
import { ownActiveCoopSessions } from "./coopBulkSettings";
import type { useCoopManagement } from "./useCoopManagement";
import type { CoopSessionSummary } from "./useCoopBossState";

export function CoopManagementPanel({ management, sessions, busy, loaded }: {
  management: ReturnType<typeof useCoopManagement>;
  sessions: CoopSessionSummary[];
  busy: boolean;
  loaded: boolean;
}) {
  const [support, setSupport] = useState("keep");
  const [visibility, setVisibility] = useState<CoopVisibility | "keep">("keep");
  const ownCount = ownActiveCoopSessions(sessions).length;
  const disabled = busy || management.busy;

  return (
    <Card padding="md" className="space-y-4">
      <section className="space-y-2" aria-label="소환 자동 설정">
        <h2 className="text-sm font-semibold">소환 시 자동 무료 지원</h2>
        <CoopFreeSupportOption
          checked={management.autoFreeSupport}
          disabled={disabled || !management.ready || management.loading}
          onChange={(value) => void management.saveAutoFreeSupport(value)}
        />
        <p className="text-xs text-zinc-600 dark:text-zinc-300">
          계정에 저장되어 다음 소환부터 자동 적용됩니다. 낚시로 출현하는 보스에도
          적용되며, 이미 소환한 보스의 설정은 바뀌지 않습니다.
        </p>
        {!management.ready && (management.loading ? (
          <p className="text-xs">설정 불러오는 중…</p>
        ) : (
          <button type="button" onClick={() => void management.reload()} className="min-h-11 text-sm underline">
            설정 다시 불러오기
          </button>
        ))}
      </section>
      <section className={`${SURFACE_INSET} space-y-3 p-3`} aria-label="내 보스 일괄 설정">
        <h2 className="text-sm font-semibold">내 보스 일괄 설정</h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-300">
          현재 목록에서 진행 중인 내 보스 {ownCount}마리에 적용합니다. 전체 공개한
          보스의 공개 범위는 줄일 수 없습니다. 소속 길드가 없으면 길드원만 설정은 나만으로 적용됩니다.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span>무료 지원 일괄 설정</span>
            <select value={support} disabled={disabled} onChange={(e) => setSupport(e.target.value)}
              className={`${SURFACE_INSET} min-h-11 w-full px-2 text-sm`}>
              <option value="keep">변경 안 함</option>
              <option value="on">허용</option>
              <option value="off">허용 안 함</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span>공개 범위 일괄 설정</span>
            <select value={visibility} disabled={disabled} onChange={(e) => setVisibility(e.target.value as CoopVisibility | "keep")}
              className={`${SURFACE_INSET} min-h-11 w-full px-2 text-sm`}>
              <option value="keep">변경 안 함</option>
              <option value="summoner_only">나만</option>
              <option value="guild_only">길드원만</option>
              <option value="public">모두에게 공유</option>
            </select>
          </label>
        </div>
        <button type="button"
          disabled={disabled || !loaded || ownCount === 0 || (support === "keep" && visibility === "keep")}
          onClick={() => void management.applyBulk({
            ...(support !== "keep" ? { allowFreeSupport: support === "on" } : {}),
            ...(visibility !== "keep" ? { visibility } : {}),
          })}
          className="min-h-11 w-full rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
          내 보스 {ownCount}마리에 적용
        </button>
      </section>
      {management.notice && <p role="status" className={`${SURFACE_ACCENT} p-3 text-sm`}>{management.notice}</p>}
    </Card>
  );
}
