"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { V2_SKILLS, type V2SkillId } from "@/adventure/data/v2/v2Skills";
import { SkillEffectChips } from "./SkillEffectChips";
import { V2LoadoutPanel, type V2LoadoutData } from "./V2LoadoutPanel";
import { V2LoadoutPresetsPanel } from "./V2LoadoutPresetsPanel";

// v2 학습 — 숙달 포인트로 직업 스킬을 습득하고 SP 로드아웃을 구성한다.
// 캐릭터 탭 "스킬" 항목(/character/skills). 옛 "훈련장"(마을 탭) 대체 — 대련(허수아비)은
// 전투 탭(/battle/sparring)으로 분리.

type ElementalRow = {
  skillId: string;
  name: string;
  cost: number;
  learned: boolean;
};

type StateShape = {
  ok?: boolean;
  elementalSkills?: ElementalRow[];
  proficiency?: { current?: { points: number } };
  loadout?: V2LoadoutData; // 코어루프 flag-on 만 존재(SP 로드아웃).
};

function skillName(id: string): string {
  return V2_SKILLS[id as V2SkillId]?.name ?? id;
}
function skillDesc(id: string): string {
  return V2_SKILLS[id as V2SkillId]?.description ?? "";
}

export function V2SkillLearnView({
  onBack,
  embedded = false,
  section = "all",
}: {
  onBack: () => void;
  // 스킬 허브(탭)에 끼워질 때 — 자체 헤더/페이지 컨테이너 생략(허브가 제공).
  embedded?: boolean;
  // 허브 탭 분리 — "learn"=학습 라이브러리만, "loadout"=프리셋+장착만, "all"=전부(독립).
  section?: "all" | "learn" | "loadout";
}) {
  const [elementalSkills, setElementalSkills] = useState<ElementalRow[]>([]);
  const [loadout, setLoadout] = useState<V2LoadoutData | null>(null);
  const [usable, setUsable] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // 마운트 1회 로드 — setState 동기 호출을 피하려 loading 초기값(true)에서 시작, 완료 시 해제.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/me/state");
      const j = (await res.json().catch(() => null)) as StateShape | null;
      if (j?.ok) {
        setElementalSkills(j.elementalSkills ?? []);
        setLoadout(j.loadout ?? null);
        setUsable(j.proficiency?.current?.points ?? 0);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 스킬/로드아웃 fetch
    refresh();
  }, [refresh]);

  const learn = useCallback(
    async (skillId: string, cost: number) => {
      setBusy(skillId);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/learn-skill", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ skillId }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          points?: number;
          required?: number;
          have?: number;
        } | null;
        if (!j?.ok) {
          const label =
            j?.error === "insufficient_proficiency"
              ? `숙달 포인트 부족 (필요 ${j.required ?? cost}, 보유 ${j.have ?? usable})`
              : j?.error === "no_class"
                ? "직업이 없어요 (먼저 직업을 선택하세요)"
                : j?.error === "not_in_chain"
                  ? "아직 배울 수 없는 스킬이에요"
                  : (j?.error ?? `http ${res.status}`);
          setMsg(`✗ ${label}`);
          return;
        }
        setMsg(`✓ ${skillName(skillId)} 학습 완료`);
        if (typeof j.points === "number") setUsable(j.points);
        setElementalSkills((prev) =>
          prev.map((s) => (s.skillId === skillId ? { ...s, learned: true } : s)),
        );
        // 새로 배운 스킬이 라이브러리/로드아웃에 반영되도록 상태 재동기화(코어루프 로드아웃 패널).
        refresh();
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [usable, refresh],
  );


  const Wrapper = embedded ? "div" : "main";
  return (
    <Wrapper
      className={
        embedded
          ? "space-y-3"
          : "mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100"
      }
    >
      {!embedded && <SubViewHeader title="스킬" onBack={onBack} />}

      {section !== "learn" && !loading && loadout && (
        <V2LoadoutPresetsPanel
          currentEquipped={loadout.equipped}
          onApplied={refresh}
        />
      )}

      {section !== "learn" && !loading && loadout && (
        <V2LoadoutPanel loadout={loadout} onChanged={refresh} />
      )}

      {section !== "loadout" && !loading && elementalSkills.length > 0 && (
        <Card padding="md">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">학습</h2>
            <div className="flex gap-3 text-xs text-zinc-500 dark:text-zinc-400">
              <span>
                숙달 포인트{" "}
                <strong className="tabular-nums text-emerald-700 dark:text-emerald-400">
                  {usable}
                </strong>
              </span>
            </div>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {loadout
              ? "학습한 스킬은 라이브러리에 영구 보관됩니다. 「스킬」 탭에서 스킬포인트 예산 안으로 장착하세요."
              : "학습한 스킬은 전투에서 자동 발동합니다. 발동 순서·조건은 스킬 패턴에서 설정하세요."}
          </p>
          <ul className="mt-3 space-y-1.5">
            {elementalSkills.map((s) => {
              const affordable = usable >= s.cost;
              return (
                <li
                  key={s.skillId}
                  className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-semibold">
                        {s.name}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                      {skillDesc(s.skillId)}
                    </p>
                    <SkillEffectChips skillId={s.skillId} />
                  </div>
                  {!s.learned ? (
                    <Button
                      onClick={() => learn(s.skillId, s.cost)}
                      disabled={busy != null || !affordable}
                      variant="success"
                      size="xs"
                      className="shrink-0"
                    >
                      {busy === s.skillId ? "학습 중…" : `학습 (${s.cost})`}
                    </Button>
                  ) : (
                    <span className="shrink-0 rounded-md border border-sky-500 bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-700 dark:text-sky-300">
                      보유
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {msg && (
        <StatusBanner tone={msg.startsWith("✓") ? "success" : "error"}>
          {msg}
        </StatusBanner>
      )}
    </Wrapper>
  );
}
