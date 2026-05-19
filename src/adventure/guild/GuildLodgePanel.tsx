"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Sparkle } from "@phosphor-icons/react";
import { useSession } from "next-auth/react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useGame } from "@/adventure/GameContext";
import {
  LODGE_SLOGAN_MAX,
  type DonationKind,
  type LodgeResponse,
} from "@/adventure/data/guildLodge";
import {
  donateToLodge,
  fetchLodge,
  GuildError,
  setLodgeSlogan,
  upgradeLodge,
} from "./api";
import { RankProgress } from "./lodge/RankProgress";
import { DonateForm } from "./lodge/DonateForm";
import { ContributorList } from "./lodge/ContributorList";

export function GuildLodgePanel({
  guildId,
  isMaster,
}: {
  guildId: number;
  isMaster: boolean;
}) {
  const { data: session } = useSession();
  const myUserId = session?.user?.id ?? "";
  const { character, inventory, addNotification, characterStateHook } = useGame();
  const myGold = character.gold;
  // kind="stardust" 는 회관 봉납 자원 의미상 별빛 조각 — 인벤토리 키는 starfall_shard.
  const myStardust = inventory.materialCount("starfall_shard");

  const [data, setData] = useState<LodgeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchLodge(guildId);
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "로드 실패");
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const handleError = (e: unknown) => {
    const msg =
      e instanceof GuildError
        ? e.message
        : e instanceof Error
          ? e.message
          : "처리 실패";
    setError(msg);
    addNotification("info", msg);
  };

  // 봉납 응답이 곧 최신 LodgeResponse — 다시 fetch 하지 않고 통째 치환.
  // 클라 잔고도 같이 차감 (서버 권위 응답을 또 받기엔 비쌈, 다음 새로고침 때 정합화).
  const handleDonate = async (kind: DonationKind, amount: number) => {
    setBusy(true);
    setError(null);
    try {
      const r = await donateToLodge(guildId, { kind, amount });
      setData(r);
      if (kind === "stardust") {
        inventory.consumeMaterial("starfall_shard", amount);
      } else {
        characterStateHook.addGold(-amount);
      }
      addNotification(
        "info",
        kind === "stardust"
          ? `별빛 조각 ${amount.toLocaleString()} 을 봉납했습니다.`
          : `골드 ${amount.toLocaleString()} 을 봉납했습니다.`,
      );
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  const handleUpgrade = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await upgradeLodge(guildId);
      addNotification("info", `회관이 ★${r.rank} 으로 승급했습니다.`);
      await load();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSlogan = async (next: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await setLodgeSlogan(guildId, { slogan: next });
      setData((prev) => (prev ? { ...prev, slogan: r.slogan } : prev));
      addNotification("info", r.slogan ? "슬로건을 저장했습니다." : "슬로건을 비웠습니다.");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) {
    return (
      <Card padding="md">
        <Skeleton rows={4} />
      </Card>
    );
  }

  if (!data) {
    return (
      <Card padding="md">
        <div className="text-sm text-red-600 dark:text-red-400">
          {error ?? "회관 정보를 불러올 수 없습니다."}
        </div>
      </Card>
    );
  }

  return (
    <Card padding="md">
      {error ? (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {data.rank === 0 ? (
        <EmptyLodge
          myStardust={myStardust}
          myGold={myGold}
          busy={busy}
          onDonate={handleDonate}
        />
      ) : (
        <div className="space-y-3">
          <SloganSection
            slogan={data.slogan}
            isMaster={isMaster}
            busy={busy}
            onSave={handleSaveSlogan}
          />
          <RankProgress
            rank={data.rank}
            nextRank={data.nextRank}
            stardustTotal={data.stardustTotal}
            goldTotal={data.goldTotal}
            isMaster={isMaster}
            busy={busy}
            onUpgrade={handleUpgrade}
          />
          <DonateForm
            myStardust={myStardust}
            myGold={myGold}
            busy={busy}
            onDonate={handleDonate}
          />
          <ContributorList
            contributors={data.contributions}
            myUserId={myUserId}
          />
        </div>
      )}
    </Card>
  );
}

function EmptyLodge({
  myStardust,
  myGold,
  busy,
  onDonate,
}: {
  myStardust: number;
  myGold: number;
  busy: boolean;
  onDonate: (kind: DonationKind, amount: number) => void;
}) {
  return (
    <div className="space-y-3 text-center">
      <Sparkle
        size={32}
        weight="duotone"
        className="mx-auto text-violet-500 dark:text-violet-400"
      />
      <div>
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          회관이 아직 비어 있습니다
        </h4>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          첫 별빛 조각을 봉납하면 ★1 회관이 자동으로 세워집니다.
        </p>
      </div>
      <div className="border-t border-zinc-200 pt-3 text-left dark:border-zinc-800">
        <DonateForm
          myStardust={myStardust}
          myGold={myGold}
          busy={busy}
          onDonate={onDonate}
        />
      </div>
    </div>
  );
}

function SloganSection({
  slogan,
  isMaster,
  busy,
  onSave,
}: {
  slogan: string | null;
  isMaster: boolean;
  busy: boolean;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(slogan ?? "");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!editing) setDraft(slogan ?? "");
  }, [slogan, editing]);

  if (editing) {
    const tooLong = draft.trim().length > LODGE_SLOGAN_MAX;
    return (
      <section className="space-y-1.5">
        <input
          type="text"
          value={draft}
          maxLength={LODGE_SLOGAN_MAX + 20}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="회관 첫 줄에 표시될 짧은 슬로건"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          autoFocus
        />
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-[11px] tabular-nums ${
              tooLong
                ? "text-rose-600 dark:text-rose-400"
                : "text-zinc-500 dark:text-zinc-400"
            }`}
          >
            {draft.trim().length} / {LODGE_SLOGAN_MAX}
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(slogan ?? "");
              }}
              disabled={busy}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(draft);
                setEditing(false);
              }}
              disabled={busy || tooLong}
              className="rounded-md border border-violet-700 bg-violet-600 px-2 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              저장
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex items-baseline gap-2">
      {slogan ? (
        <p className="min-w-0 flex-1 truncate text-sm italic text-zinc-700 dark:text-zinc-300">
          “{slogan}”
        </p>
      ) : (
        <p className="min-w-0 flex-1 text-sm italic text-zinc-400 dark:text-zinc-500">
          {isMaster
            ? "슬로건을 적어 회관에 결을 더해보세요."
            : "마스터의 슬로건이 아직 없습니다."}
        </p>
      )}
      {isMaster ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <Pencil size={10} />
          편집
        </button>
      ) : null}
    </section>
  );
}
