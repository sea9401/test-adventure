"use client";

import { useCallback, useEffect, useState } from "react";
import { SkillsView } from "@/adventure/character/SkillsView";
import type { Skill } from "@/adventure/character/types";

// v2 스킬 화면 — 라이브 SkillsView wrap. 일반 스킬만 (feats/AP 후속).
//
// 사용자 의도: "장착 가능하고 발동되는지 정도만 체크할 수 있는 수준".
// 실제 사냥 시 적용은 derivePlayerCombatFromSaves 가 character.v2.equippedSkills
// 를 읽어 자동 — 별도 wiring 불필요.

type SkillsResponse = {
  ok?: boolean;
  skills?: Skill[];
  effectiveSkillNames?: string[];
  normalSlots?: number;
  equippedSkills?: string[];
  error?: string;
};

export function V2SkillsView({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<SkillsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v2/me/skills");
      const j = (await res.json().catch(() => null)) as SkillsResponse | null;
      setData(j ?? { ok: false });
    } catch {
      setData({ ok: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // equippedSkills 배열 update — equip/unequip 둘 다 같은 endpoint.
  const updateEquipped = useCallback(
    async (next: string[]) => {
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/skills/equip", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ equippedSkills: next }),
        });
        const j = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;
        if (!j?.ok) {
          setMsg(`✗ ${j?.error ?? `http ${res.status}`}`);
          return;
        }
        await refresh();
      } catch (err) {
        setMsg(`✗ network: ${(err as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const handleEquip = (name: string) => {
    const cur = data?.equippedSkills ?? [];
    if (cur.includes(name)) return;
    void updateEquipped([...cur, name]);
  };
  const handleUnequip = (name: string) => {
    const cur = data?.equippedSkills ?? [];
    void updateEquipped(cur.filter((n) => n !== name));
  };

  const skills = data?.skills ?? [];
  const equippedNames = data?.effectiveSkillNames ?? [];
  const normalSlots = data?.normalSlots ?? 0;

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← 캐릭터로
        </button>
        <h1 className="text-lg font-bold">스킬</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          일반 스킬만 (특기·AP 스킬 은 후속). 장착하면 다음 사냥 자동 발동.
        </p>
      </header>

      {loading ? (
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          불러오는 중…
        </div>
      ) : !data?.ok ? (
        <div className="text-sm text-rose-600 dark:text-rose-400">
          스킬 정보를 불러오지 못했어요 ({data?.error ?? "unknown"}).
        </div>
      ) : (
        <SkillsView
          skills={skills}
          equippedNames={equippedNames}
          normalSlots={normalSlots}
          feats={[]}
          equippedFeats={[]}
          featSlots={0}
          onEquip={busy ? undefined : handleEquip}
          onUnequip={busy ? undefined : handleUnequip}
        />
      )}

      {msg && (
        <div className="text-xs text-rose-600 dark:text-rose-400">{msg}</div>
      )}
    </main>
  );
}
