"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Envelope, PaperPlaneTilt } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Pagination } from "@/components/ui/Pagination";
import { usePagination } from "@/lib/usePagination";
import { ITEMS, type ItemId } from "@/adventure/data/items";
import { craftTierSuffix, type CraftTier } from "@/adventure/data/craftQuality";
import {
  dropQualityPrefix,
  type DropQuality,
} from "@/adventure/data/dropQuality";
import { MATERIALS, type MaterialId } from "@/adventure/data/materials";
import { getRecipeById } from "@/adventure/data/recipes";
import { SKILL_BOOKS, type SkillBookId } from "@/adventure/data/skillBooks";
import { useGame } from "@/adventure/GameContext";
import {
  acceptGuildInvite,
  declineGuildInvite,
  GuildError,
} from "@/adventure/guild/api";
import { claimInbox, fetchInbox, type InboxItem } from "./api";
import { SendMessageModal } from "./SendMessageModal";
import { InboxRow, type InboxAction } from "./InboxRow";

export function InboxView() {
  const {
    remote,
    inventory,
    characterStateHook,
    crafting,
    inbox,
    addNotification,
    grantTitle,
  } = useGame();
  const addEquipment = inventory.addEquipment;
  const addCraftedEquipment = inventory.addCraftedEquipment;
  const addDroppedEquipment = inventory.addDroppedEquipment;
  const addMaterial = inventory.addMaterial;
  const addSkillBook = inventory.addSkillBook;
  const addEquipmentInstance = inventory.addEquipmentInstance;
  const addGold = characterStateHook.addGold;
  // 거래/우편으로 받은 제작서는 공유 토큰 없이 학습.
  const learnRecipeFromTrade = crafting.learnRecipeFromTrade;
  const refreshInbox = inbox.refresh;
  const pushToast = (msg: string) => addNotification("info", msg);

  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState<{ recipient: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchInbox();
      setItems(r.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "우편함 로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // 길드 초대 수락/거절 — claim 흐름과 별개. 응답 후 우편 목록만 새로고침.
  const respondToGuildInvite = async (
    inviteId: number,
    inboxRowId: number,
    accept: boolean,
  ) => {
    setError(null);
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.add(inboxRowId);
      return next;
    });
    try {
      if (accept) {
        const r = await acceptGuildInvite(inviteId);
        characterStateHook.setAffiliation(r.guildName);
        grantTitle("guild_member");
        pushToast(`${r.guildName} 길드에 가입했습니다.`);
      } else {
        await declineGuildInvite(inviteId);
        pushToast("초대를 거절했습니다.");
      }
      void load();
      refreshInbox();
    } catch (e) {
      const msg =
        e instanceof GuildError
          ? e.message
          : e instanceof Error
            ? e.message
            : "처리 실패";
      setError(msg);
      pushToast(msg);
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(inboxRowId);
        return next;
      });
    }
  };

  const claim = async (ids: number[]) => {
    if (ids.length === 0) return;
    setError(null);
    setBusyIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    try {
      const r = await claimInbox(remote, ids);
      // 서버 응답 기반으로 로컬 골드/인벤 반영. (race window 최소화)
      if (r.goldAdded > 0) addGold(r.goldAdded);
      for (const it of r.itemsAdded) {
        if (it.kind === "equip") {
          if (Object.prototype.hasOwnProperty.call(ITEMS, it.id)) {
            // 변형 키 별로 적절한 storage 에 추가. 미지정/잘못된 키 → base fallback.
            const g = it.variantKey;
            const id = it.id as ItemId;
            if (g === "c-2" || g === "c-1" || g === "c1" || g === "c2") {
              addCraftedEquipment(id, Number(g.slice(1)) as -2 | -1 | 1 | 2, it.quantity);
            } else if (g === "d1" || g === "d2") {
              addDroppedEquipment(id, Number(g.slice(1)) as 1 | 2, it.quantity);
            } else {
              addEquipment(id, it.quantity);
            }
          }
        } else if (it.kind === "skill_book") {
          if (Object.prototype.hasOwnProperty.call(SKILL_BOOKS, it.id)) {
            addSkillBook(it.id as SkillBookId, it.quantity);
          }
        } else {
          if (Object.prototype.hasOwnProperty.call(MATERIALS, it.id)) {
            addMaterial(it.id as MaterialId, it.quantity);
          }
        }
      }
      // 인스턴스 매물 수령(강화/부여 별빛 무구·고리) — 새 instanceId 로 풀에 추가(서버가 발급).
      for (const inst of r.instancesAdded ?? []) {
        addEquipmentInstance(inst);
      }
      // 거래/우편 출처 학습 — 새로 받은 것만 known 에 추가. 토큰 부여는 X
      // (재거래 사이클로 토큰을 영구 갱신하지 못하도록).
      // skipped (이미 알던 것) 는 무시 — 받은 사람 입장에서 바뀌는 것 없음.
      for (const id of r.recipesAdded) learnRecipeFromTrade(id);
      // 토스트 — 합산 표시.
      const parts: string[] = [];
      if (r.goldAdded > 0) parts.push(`🪙 ${r.goldAdded.toLocaleString()} G`);
      const grouped = new Map<string, number>();
      for (const it of r.itemsAdded) {
        const base =
          it.kind === "equip"
            ? ITEMS[it.id as ItemId]?.name
            : it.kind === "skill_book"
              ? SKILL_BOOKS[it.id as SkillBookId]?.name
              : MATERIALS[it.id as MaterialId]?.name;
        const baseLabel = base ?? it.id;
        // 등급 라벨 합성 (equip 만 의미) — "정교한 야구방망이 ⟨고급⟩" 식.
        let label = baseLabel;
        if (it.kind === "equip") {
          const g = it.variantKey;
          let tier: CraftTier | undefined;
          let quality: DropQuality | undefined;
          if (g === "c-2" || g === "c-1" || g === "c1" || g === "c2") {
            tier = Number(g.slice(1)) as CraftTier;
          } else if (g === "d1" || g === "d2") {
            quality = Number(g.slice(1)) as DropQuality;
          }
          label = `${dropQualityPrefix(quality)}${baseLabel}${craftTierSuffix(tier)}`;
        }
        grouped.set(label, (grouped.get(label) ?? 0) + it.quantity);
      }
      for (const [name, qty] of grouped) {
        parts.push(`${name}${qty > 1 ? ` ×${qty}` : ""}`);
      }
      for (const id of r.recipesAdded) {
        const name = getRecipeById(id)?.name ?? id;
        parts.push(`📜 ${name}`);
      }
      if (parts.length > 0) {
        pushToast(`수령 완료 — ${parts.join(", ")}`);
      } else if (r.recipesSkipped.length > 0) {
        pushToast("이미 알고 있는 제작서입니다.");
      } else {
        pushToast("수령 완료");
      }
      // 목록 새로고침 + 헤더 카운트 갱신.
      void load();
      refreshInbox();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "수령 실패";
      setError(msg);
      pushToast(msg);
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }
  };

  const pager = usePagination(items, 10);

  // InboxRow 가 React.memo 라 onAction prop 은 안정해야 한다.
  // claim/respondToGuildInvite/setComposer 가 GameContext value 변경 등으로 매 렌더
  // 새 함수가 될 수 있어, ref 로 최신 핸들러를 잡고 onAction 은 mount-stable.
  const handlersRef = useRef({ claim, respondToGuildInvite, setComposer });
  // deps 없이 매 렌더 ref 만 갱신 — onAction 자체는 mount-stable. claim/respondToGuildInvite
  // 가 GameContext 변화 등으로 매 렌더 새 함수가 돼도 effect 가 그걸 ref 에 동기화한다.
  // lint 가 setState 함수 참조 저장을 "호출" 로 오인해 경고를 띄우므로 명시적으로 끈다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    handlersRef.current = { claim, respondToGuildInvite, setComposer };
  });
  const onAction = useCallback((action: InboxAction) => {
    const h = handlersRef.current;
    switch (action.type) {
      case "claim":
        void h.claim([action.id]);
        return;
      case "reply":
        h.setComposer({ recipient: action.fromName });
        return;
      case "guild_invite_respond":
        void h.respondToGuildInvite(
          action.inviteId,
          action.inboxRowId,
          action.accept,
        );
        return;
    }
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          거래 결과와 다른 모험가의 쪽지가 도착합니다.
        </p>
        <button
          type="button"
          onClick={() => setComposer({ recipient: "" })}
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          <PaperPlaneTilt size={14} weight="fill" />
          쪽지 보내기
        </button>
      </div>

      {error ? (
        <Card padding="sm">
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        </Card>
      ) : null}

      {(() => {
        // 전체 수령 — 길드 초대는 별도 흐름이라 제외.
        const claimable = items.filter((i) => i.kind !== "guild_invite");
        if (claimable.length <= 1) return null;
        return (
          <Card padding="sm">
            <button
              type="button"
              disabled={busyIds.size > 0 || loading}
              onClick={() => claim(claimable.map((i) => i.id))}
              className="w-full rounded-md border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              전체 수령 ({claimable.length}건)
            </button>
          </Card>
        );
      })()}

      {loading && items.length === 0 ? (
        <ul className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <li
              key={i}
              className="rounded-lg border border-zinc-200 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/60"
            >
              <Skeleton rows={2} />
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Envelope size={40} weight="duotone" />}
          title="수령할 우편이 없습니다"
          message="거래 결과나 다른 모험가의 쪽지가 여기에 도착합니다."
        />
      ) : (
        <div className="space-y-2">
          {pager.pageItems.map((it) => (
            <InboxRow
              key={it.id}
              item={it}
              busy={busyIds.has(it.id)}
              onAction={onAction}
            />
          ))}
          <Pagination
            page={pager.page}
            pageCount={pager.pageCount}
            setPage={pager.setPage}
          />
        </div>
      )}

      {composer && (
        <SendMessageModal
          initialRecipient={composer.recipient}
          onClose={() => setComposer(null)}
          onSent={(name) => pushToast(`${name} 에게 쪽지를 보냈습니다.`)}
        />
      )}
    </div>
  );
}
