"use client";

import { useState } from "react";
import {
  Crown,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  TITLES,
  TITLE_CATEGORY_ORDER,
  type TitleCategory,
} from "@/adventure/data/titles";

// 모험의 서 — 칭호 탭(V2CodexView 에서 분리, 2026-07). 보유/장착 데이터는 부모의
// /me/state fetch 가 권위라 controlled prop 으로 받고, 장착 mutation(낙관적 갱신)만 소유.
const CODEX_PANEL_SURFACE = `${SURFACE_INSET} p-2.5 sm:p-3`;

export function CodexTitlePanel({
  ownedTitleIds,
  equippedTitleId,
  onEquippedTitleChange,
}: {
  ownedTitleIds: string[];
  equippedTitleId: string | null;
  onEquippedTitleChange: (titleId: string | null) => void;
}) {
  const [titleBusy, setTitleBusy] = useState(false);
  // 칭호 장착/해제 — 낙관적 갱신 후 서버 확정(실패 시 롤백). titleId=null 이면 해제.
  const equipTitle = async (titleId: string | null) => {
    if (titleBusy || titleId === equippedTitleId) return;
    const prev = equippedTitleId;
    setTitleBusy(true);
    onEquippedTitleChange(titleId);
    try {
      const res = await fetch("/api/v2/me/equip-title", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ titleId }),
      });
      const j = (await res.json()) as { ok?: boolean; equippedTitleId?: unknown };
      if (!res.ok || !j?.ok) throw new Error();
      onEquippedTitleChange(
        typeof j.equippedTitleId === "string" ? j.equippedTitleId : null,
      );
    } catch {
      onEquippedTitleChange(prev);
    } finally {
      setTitleBusy(false);
    }
  };

  // 보유 칭호를 카테고리별로 묶음(존재하는 칭호만 — 옛 V1 칭호는 미보유라 자연히 빠짐).
  const ownedTitlesByCategory = (() => {
    const out: Partial<Record<TitleCategory, { id: string }[]>> = {};
    for (const id of ownedTitleIds) {
      const t = TITLES[id];
      if (!t) continue;
      (out[t.category] ??= []).push({ id });
    }
    return out;
  })();
  const ownedTitleCount = ownedTitleIds.filter((id) => TITLES[id]).length;

  return (
        (ownedTitleCount === 0 ? (
          <EmptyState
            icon={<Crown size={40} weight="duotone" />}
            title="아직 획득한 칭호가 없습니다"
            message="낚시·발굴·투기장 상점과 수집 보상으로 칭호를 모으면 여기서 장착할 수 있어요. 장착한 칭호는 채팅과 접속자 목록에 표시됩니다."
          />
        ) : (
          <div className={`${CODEX_PANEL_SURFACE} space-y-4`}>
            <Card padding="sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    현재 장착
                  </div>
                  <div className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    {equippedTitleId && TITLES[equippedTitleId]
                      ? TITLES[equippedTitleId].name
                      : "미장착"}
                  </div>
                </div>
                {equippedTitleId && (
                  <button
                    type="button"
                    disabled={titleBusy}
                    onClick={() => equipTitle(null)}
                    className="shrink-0 rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    해제
                  </button>
                )}
              </div>
            </Card>
            {TITLE_CATEGORY_ORDER.filter(
              (cat) => (ownedTitlesByCategory[cat.id]?.length ?? 0) > 0,
            ).map((cat) => (
              <div key={cat.id} className="space-y-1.5">
                <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  {cat.label}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(ownedTitlesByCategory[cat.id] ?? []).map(({ id }) => {
                    const t = TITLES[id];
                    const isEquipped = equippedTitleId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={titleBusy}
                        onClick={() => equipTitle(isEquipped ? null : id)}
                        className={`rounded-lg border p-3 text-left transition disabled:opacity-60 ${
                          isEquipped
                            ? "border-amber-400 bg-amber-50 dark:border-amber-500/70 dark:bg-amber-900/20"
                            : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                            {t.name}
                          </span>
                          {isEquipped && (
                            <span className="rounded-full bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                              장착됨
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                          {t.description}
                        </p>
                        <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                          {t.condition}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))
  );
}
