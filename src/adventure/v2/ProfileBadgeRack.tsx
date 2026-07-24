"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Crown,
  Eye,
  EyeSlash,
  PencilSimple,
  Plus,
  SpinnerGap,
  Sword,
  Trophy,
  X,
} from "@phosphor-icons/react";
import { TITLES } from "@/adventure/data/titles";
import { V2_EQUIPMENT, type V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import { questById } from "@/adventure/data/v2/v2Quests";
import {
  type ProfileShowcaseSelection,
  type ProfileShowcaseSlots,
} from "@/adventure/profile/profileShowcase";
import { Button } from "@/components/ui/Button";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";

type AchievementOption = {
  id: string;
  title: string;
  desc: string;
  points: number;
};

type ShowcaseOptionsResponse = {
  ok?: boolean;
  achievementOptions?: AchievementOption[];
};

type BadgeTone = "bronze" | "silver" | "gold" | "legendary" | "rose" | "violet";

type BadgeContent = {
  title: string;
  description: string;
  detail: string;
  icon: ReactNode;
  tone: BadgeTone;
};

const BADGE_TONE: Record<
  BadgeTone,
  { outer: string; inner: string; icon: string; ribbon: string }
> = {
  bronze: {
    outer: "border-orange-700 bg-orange-300 dark:border-orange-500 dark:bg-orange-800",
    inner: "border-orange-200 bg-orange-50 dark:border-orange-700 dark:bg-orange-950",
    icon: "text-orange-700 dark:text-orange-300",
    ribbon: "bg-orange-700 dark:bg-orange-600",
  },
  silver: {
    outer: "border-zinc-500 bg-zinc-300 dark:border-zinc-400 dark:bg-zinc-700",
    inner: "border-zinc-100 bg-white dark:border-zinc-600 dark:bg-zinc-900",
    icon: "text-zinc-600 dark:text-zinc-200",
    ribbon: "bg-zinc-500 dark:bg-zinc-500",
  },
  gold: {
    outer: "border-amber-600 bg-amber-300 dark:border-amber-500 dark:bg-amber-800",
    inner: "border-amber-100 bg-amber-50 dark:border-amber-700 dark:bg-amber-950",
    icon: "text-amber-700 dark:text-amber-300",
    ribbon: "bg-amber-600 dark:bg-amber-500",
  },
  legendary: {
    outer: "border-violet-600 bg-violet-300 dark:border-violet-400 dark:bg-violet-800",
    inner: "border-fuchsia-100 bg-violet-50 dark:border-violet-700 dark:bg-violet-950",
    icon: "text-violet-700 dark:text-violet-200",
    ribbon: "bg-violet-700 dark:bg-violet-500",
  },
  rose: {
    outer: "border-rose-600 bg-rose-300 dark:border-rose-500 dark:bg-rose-800",
    inner: "border-rose-100 bg-rose-50 dark:border-rose-700 dark:bg-rose-950",
    icon: "text-rose-700 dark:text-rose-300",
    ribbon: "bg-rose-700 dark:bg-rose-600",
  },
  violet: {
    outer: "border-indigo-600 bg-indigo-300 dark:border-indigo-400 dark:bg-indigo-800",
    inner: "border-indigo-100 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950",
    icon: "text-indigo-700 dark:text-indigo-200",
    ribbon: "bg-indigo-700 dark:bg-indigo-500",
  },
};

export function ProfileBadgeRack({
  initialSlots,
  standOwned,
  initialVisible,
  owned,
  editable,
}: {
  initialSlots: ProfileShowcaseSlots;
  standOwned: boolean;
  initialVisible: boolean;
  owned: V2EquipInstance[];
  editable: boolean;
}) {
  const [slots, setSlots] = useState<ProfileShowcaseSlots>(initialSlots);
  const [visible, setVisible] = useState(initialVisible);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [visibilityError, setVisibilityError] = useState(false);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsFailed, setOptionsFailed] = useState(false);
  const [achievementOptions, setAchievementOptions] = useState<AchievementOption[]>([]);
  const contents = slots.map((selection) => resolveBadgeContent(selection, owned));

  const updateVisibility = async (nextVisible: boolean) => {
    if (visibilitySaving) return;
    setVisibilitySaving(true);
    setVisibilityError(false);
    try {
      const response = await fetch("/api/v2/me/profile-showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible: nextVisible }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; visible?: boolean }
        | null;
      if (!response.ok || !data?.ok) throw new Error("visibility save failed");
      setVisible(data.visible ?? nextVisible);
    } catch {
      setVisibilityError(true);
    } finally {
      setVisibilitySaving(false);
    }
  };

  if (!standOwned) return null;
  if (!editable && (!visible || contents.every((content) => content === null))) {
    return null;
  }
  if (editable && !visible) {
    return (
      <section
        aria-label="대표 배지 전시대 비공개 설정"
        className={`${SURFACE_INSET} flex min-h-20 items-center gap-3 p-3`}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          <EyeSlash size={21} weight="duotone" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
            대표 배지 전시대 비공개
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
            다른 모험가에게는 전시대가 보이지 않습니다.
          </p>
          {visibilityError ? (
            <p className="mt-1 text-[10px] text-rose-600 dark:text-rose-400">
              설정을 저장하지 못했어요. 다시 시도해 주세요.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={visibilitySaving}
          onClick={() => void updateVisibility(true)}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-500 bg-amber-500 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {visibilitySaving ? (
            <SpinnerGap size={13} className="animate-spin" aria-hidden="true" />
          ) : (
            <Eye size={13} weight="bold" aria-hidden="true" />
          )}
          공개하기
        </button>
      </section>
    );
  }

  const openEditor = async (slotIndex: number) => {
    setEditingSlot(slotIndex);
    setLoadingOptions(true);
    setOptionsFailed(false);
    try {
      const response = await fetch("/api/v2/me/profile-showcase");
      const data = (response.ok ? await response.json() : null) as
        | ShowcaseOptionsResponse
        | null;
      if (!data?.ok) throw new Error("showcase options unavailable");
      setAchievementOptions(
        [...(data.achievementOptions ?? [])].sort(
          (a, b) => b.points - a.points || a.title.localeCompare(b.title, "ko"),
        ),
      );
    } catch {
      setOptionsFailed(true);
      setAchievementOptions([]);
    } finally {
      setLoadingOptions(false);
    }
  };

  return (
    <>
      <section
        aria-label="대표 배지 전시대"
        className={`${SURFACE_INSET} relative min-h-28 overflow-hidden p-2`}
      >
        {editable ? (
          <div className="absolute right-1.5 top-1.5 z-20 flex gap-0.5">
            <button
              type="button"
              disabled={visibilitySaving}
              onClick={() => void updateVisibility(false)}
              aria-label="대표 배지 전시대 숨기기"
              title="전시대 숨기기"
              className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-amber-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-amber-300"
            >
              {visibilitySaving ? (
                <SpinnerGap size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <EyeSlash size={14} weight="bold" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={() =>
                void openEditor(
                  slots.findIndex((selection) => selection === null) >= 0
                    ? slots.findIndex((selection) => selection === null)
                    : 0,
                )
              }
              aria-label="대표 배지 편집"
              className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-amber-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-amber-300"
            >
              <PencilSimple size={14} weight="bold" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <div className="flex min-h-24 items-end justify-center gap-1.5">
          {contents.map((content, index) =>
            content ? (
              <BadgeMedallion
                key={index}
                content={content}
                compact
                onClick={editable ? () => void openEditor(index) : undefined}
              />
            ) : editable ? (
              <EmptyBadgeSlot
                key={index}
                slotIndex={index}
                onClick={() => void openEditor(index)}
              />
            ) : null,
          )}
        </div>
        {visibilityError ? (
          <p className="absolute bottom-1 left-2 text-[9px] text-rose-600 dark:text-rose-400">
            공개 설정을 저장하지 못했어요.
          </p>
        ) : null}
      </section>

      {editingSlot != null ? (
        <BadgeEditor
          slots={slots}
          slotIndex={editingSlot}
          options={achievementOptions}
          loading={loadingOptions}
          failed={optionsFailed}
          onClose={() => setEditingSlot(null)}
          onSaved={(next) => {
            setSlots(next);
            setEditingSlot(null);
          }}
        />
      ) : null}
    </>
  );
}

function BadgeMedallion({
  content,
  onClick,
  compact = false,
}: {
  content: BadgeContent;
  onClick?: () => void;
  compact?: boolean;
}) {
  const tone = BADGE_TONE[content.tone];
  const medal = (
    <>
      <span
        aria-hidden="true"
        className={`absolute bottom-1 left-1/2 h-7 w-5 -translate-x-[80%] rotate-[10deg] ${tone.ribbon} [clip-path:polygon(0_0,100%_0,86%_100%,50%_76%,14%_100%)]`}
      />
      <span
        aria-hidden="true"
        className={`absolute bottom-1 left-1/2 h-7 w-5 -translate-x-[20%] -rotate-[10deg] ${tone.ribbon} [clip-path:polygon(0_0,100%_0,86%_100%,50%_76%,14%_100%)]`}
      />
      <span
        className={`relative z-10 flex items-center justify-center rounded-full border-4 shadow-md ${
          compact ? "size-11" : "size-14"
        } ${tone.outer}`}
      >
        <span
          className={`flex items-center justify-center rounded-full border-2 ${
            compact ? "size-7" : "size-10"
          } ${tone.inner} ${tone.icon}`}
        >
          {content.icon}
        </span>
      </span>
    </>
  );

  return (
    <div className={`flex min-w-0 flex-col items-center ${compact ? "w-14" : "w-[4.5rem]"}`}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          title={`${content.title} · ${content.description}`}
          aria-label={`${content.title} 배지 편집`}
          className={`relative flex items-start justify-center rounded-full transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${compact ? "h-16" : "h-[4.5rem]"}`}
        >
          {medal}
        </button>
      ) : (
        <div
          title={`${content.title} · ${content.description}`}
          className={`relative flex items-start justify-center ${compact ? "h-16" : "h-[4.5rem]"}`}
        >
          {medal}
        </div>
      )}
      <span className="-mt-1 w-full truncate text-center text-[10px] font-bold text-zinc-800 dark:text-zinc-100">
        {content.title}
      </span>
      <span className="w-full truncate text-center text-[9px] text-zinc-500 dark:text-zinc-400">
        {content.detail}
      </span>
    </div>
  );
}

function EmptyBadgeSlot({
  slotIndex,
  onClick,
}: {
  slotIndex: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${slotIndex + 1}번 배지 선택`}
      className="flex w-14 flex-col items-center rounded-md text-zinc-500 transition-colors hover:text-amber-700 dark:text-zinc-400 dark:hover:text-amber-300"
    >
      <span className="flex size-11 items-center justify-center rounded-full border-2 border-dashed border-zinc-300 bg-white shadow-inner dark:border-zinc-600 dark:bg-zinc-900">
        <Plus size={20} weight="bold" aria-hidden="true" />
      </span>
      <span className="mt-1 text-[10px] font-semibold">{slotIndex + 1}번 칸</span>
      <span className="text-[9px]">배지 선택</span>
    </button>
  );
}

function BadgeEditor({
  slots,
  slotIndex,
  options,
  loading,
  failed,
  onClose,
  onSaved,
}: {
  slots: ProfileShowcaseSlots;
  slotIndex: number;
  options: AchievementOption[];
  loading: boolean;
  failed: boolean;
  onClose: () => void;
  onSaved: (slots: ProfileShowcaseSlots) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const initialSelection = slots[slotIndex];
  const [draftId, setDraftId] = useState(
    initialSelection?.kind === "achievement"
      ? initialSelection.achievementId
      : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usedAchievementIds = new Set(
    slots.flatMap((slot, index) =>
      index !== slotIndex && slot?.kind === "achievement"
        ? [slot.achievementId]
        : [],
    ),
  );
  const availableOptions = options.filter(
    (option) => !usedAchievementIds.has(option.id),
  );
  const selectedId =
    availableOptions.some((option) => option.id === draftId)
      ? draftId
      : (availableOptions[0]?.id ?? "");

  useEscapeKey(() => {
    if (!saving) onClose();
  });
  useModalA11y(contentRef);

  const save = async (selection: ProfileShowcaseSelection | null) => {
    const nextSlots = [...slots] as ProfileShowcaseSlots;
    nextSlots[slotIndex] = selection;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/v2/me/profile-showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots: nextSlots }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; slots?: ProfileShowcaseSlots }
        | null;
      if (!response.ok || !data?.ok) {
        setError("대표 배지를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      onSaved(data.slots ?? nextSlots);
    } catch {
      setError("네트워크 오류로 저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="badge-editor-title"
      onClick={saving ? undefined : onClose}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm sm:items-center"
    >
      <div
        ref={contentRef}
        onClick={(event) => event.stopPropagation()}
        className={`${SURFACE_CARD} w-full max-w-lg p-5 shadow-2xl`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              전시대 {slotIndex + 1}번 칸
            </p>
            <h2 id="badge-editor-title" className="mt-0.5 text-lg font-bold text-zinc-900 dark:text-zinc-100">
              대표 배지 선택
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              보상까지 수령한 업적만 대표 배지로 사용할 수 있어요.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="닫기"
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className={`${SURFACE_INSET} mt-4 max-h-[52vh] overflow-y-auto p-3`}>
          {loading ? (
            <div className="flex min-h-36 items-center justify-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <SpinnerGap size={17} className="animate-spin" aria-hidden="true" />
              획득한 배지를 불러오는 중…
            </div>
          ) : failed ? (
            <p className="py-14 text-center text-xs text-rose-600 dark:text-rose-400">
              배지 목록을 불러오지 못했어요. 창을 닫고 다시 시도해 주세요.
            </p>
          ) : availableOptions.length === 0 ? (
            <p className="py-14 text-center text-xs text-zinc-500 dark:text-zinc-400">
              이 칸에 전시할 수 있는 다른 업적 배지가 없어요.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {availableOptions.map((option) => {
                const selected = option.id === selectedId;
                const content = achievementBadgeContent(option);
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setDraftId(option.id)}
                    className={`${SURFACE_INSET} flex min-w-0 flex-col items-center p-2 transition-shadow ${
                      selected
                        ? "ring-2 ring-amber-500 ring-offset-1 dark:ring-offset-zinc-900"
                        : "hover:border-amber-300 dark:hover:border-amber-700"
                    }`}
                  >
                    <BadgeMedallion content={content} compact />
                    <span className="mt-1 line-clamp-2 text-center text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                      {option.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error ? <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}

        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <Button
            variant="ghost"
            onClick={() => void save(null)}
            disabled={saving || initialSelection == null}
          >
            배지 해제
          </Button>
          <div className="flex gap-2">
            <Button onClick={onClose} disabled={saving}>
              취소
            </Button>
            <Button
              variant="primary"
              onClick={() => void save({ kind: "achievement", achievementId: selectedId })}
              disabled={saving || loading || failed || selectedId.length === 0}
            >
              {saving ? "저장 중…" : "이 칸에 전시"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function resolveBadgeContent(
  selection: ProfileShowcaseSelection | null,
  owned: V2EquipInstance[],
): BadgeContent | null {
  if (selection?.kind === "achievement") {
    const achievement = questById(selection.achievementId);
    return achievement
      ? achievementBadgeContent({
          id: achievement.id,
          title: achievement.title,
          desc: achievement.desc,
          points: achievement.points ?? 0,
        })
      : null;
  }
  if (selection?.kind === "equipment") {
    const instance = owned.find((item) => item.iid === selection.iid);
    const item = instance ? V2_EQUIPMENT[instance.id] : null;
    if (!instance || !item) return null;
    return {
      title: item.name,
      description: item.description,
      detail: instance.enhance?.level ? `+${instance.enhance.level} 장비` : "장비",
      icon: <Sword size={23} weight="duotone" aria-hidden="true" />,
      tone: "rose",
    };
  }
  if (selection?.kind === "title") {
    const title = TITLES[selection.titleId];
    if (!title) return null;
    return {
      title: title.name,
      description: title.description,
      detail: "칭호",
      icon: <Crown size={23} weight="duotone" aria-hidden="true" />,
      tone: "violet",
    };
  }
  return null;
}

function achievementBadgeContent(option: AchievementOption): BadgeContent {
  return {
    title: option.title,
    description: option.desc,
    detail: `${option.points}점`,
    icon: <Trophy size={23} weight="duotone" aria-hidden="true" />,
    tone: achievementTone(option.points),
  };
}

function achievementTone(points: number): BadgeTone {
  if (points >= 50) return "legendary";
  if (points >= 25) return "gold";
  if (points >= 10) return "silver";
  return "bronze";
}
