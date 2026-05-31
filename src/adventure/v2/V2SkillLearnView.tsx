"use client";

import { useCallback, useEffect, useState } from "react";
import { Sword } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { V2_SKILLS, type V2SkillId } from "@/adventure/data/v2/v2Skills";

// v2 학습 — 사용 가능 숙련도로 현 직업 체인의 시그니처 스킬을 습득한다.
// 옛 "훈련장"(12시간 타이머 + 포인트 적립) 대체. 자동부여 폐지(docs §6) 후 스킬은
// 여기서 숙련도를 들여 배운다. 대련(연습 전투)은 하단 링크로 보존.

type SignatureRow = {
  skillId: string;
  tier: number;
  cost: number;
  learned: boolean;
};

type StateShape = {
  ok?: boolean;
  signatures?: SignatureRow[];
  proficiency?: { current?: { usable: number } };
};

function skillName(id: string): string {
  return V2_SKILLS[id as V2SkillId]?.name ?? id;
}
function skillDesc(id: string): string {
  return V2_SKILLS[id as V2SkillId]?.description ?? "";
}

export function V2SkillLearnView({
  onBack,
  onStartSparring,
}: {
  onBack: () => void;
  onStartSparring: () => void;
}) {
  const [signatures, setSignatures] = useState<SignatureRow[]>([]);
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
        setSignatures(j.signatures ?? []);
        setUsable(j.proficiency?.current?.usable ?? 0);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
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
          usable?: number;
          required?: number;
          have?: number;
        } | null;
        if (!j?.ok) {
          const label =
            j?.error === "insufficient_proficiency"
              ? `숙련도 부족 (필요 ${j.required ?? cost}, 보유 ${j.have ?? usable})`
              : j?.error === "no_class"
                ? "직업이 없어요 (먼저 직업을 선택하세요)"
                : j?.error === "not_in_chain"
                  ? "아직 배울 수 없는 스킬이에요"
                  : (j?.error ?? `http ${res.status}`);
          setMsg(`✗ ${label}`);
          return;
        }
        setMsg(`✓ ${skillName(skillId)} 학습 완료`);
        if (typeof j.usable === "number") setUsable(j.usable);
        setSignatures((prev) =>
          prev.map((s) => (s.skillId === skillId ? { ...s, learned: true } : s)),
        );
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [usable],
  );

  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="학습" onBack={onBack} />

      <Card padding="md">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">시그니처 학습</h2>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            사용 가능 숙련도{" "}
            <strong className="tabular-nums text-emerald-700 dark:text-emerald-400">
              {usable}
            </strong>
          </div>
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          숙련도를 들여 직업 전용 스킬을 익힌다. 배운 스킬은 자동으로 장착되고, 재전직해도
          기록은 남는다.
        </p>

        {loading ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            불러오는 중…
          </p>
        ) : signatures.length === 0 ? (
          <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
            배울 시그니처가 없어요. 먼저 직업을 선택하세요.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {signatures.map((s) => {
              const affordable = usable >= s.cost;
              return (
                <li
                  key={s.skillId}
                  className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-semibold">
                        {skillName(s.skillId)}
                      </span>
                      <span className="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500">
                        {s.tier}차
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                      {skillDesc(s.skillId)}
                    </p>
                  </div>
                  {s.learned ? (
                    <span className="shrink-0 rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                      습득함
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => learn(s.skillId, s.cost)}
                      disabled={busy != null || !affordable}
                      className="shrink-0 rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy === s.skillId ? "학습 중…" : `학습 (${s.cost})`}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card padding="md">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">대련</h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              연습 상대와 겨뤄 전투 감각을 익힌다. 소모·보상 없음.
            </p>
          </div>
          <button
            type="button"
            onClick={onStartSparring}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <Sword size={14} weight="bold" />
            대련하기
          </button>
        </div>
      </Card>

      {msg && (
        <div
          className={`rounded-md border px-3 py-1.5 text-xs ${
            msg.startsWith("✓")
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
          }`}
        >
          {msg}
        </div>
      )}
    </main>
  );
}
