"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Crown,
  LockSimple,
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
import type { ProfileShowcaseSelection } from "@/adventure/profile/profileShowcase";
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
  initialSelection,
  owned,
  editable,
}: {
  initialSelection?: ProfileShowcaseSelection | null;
  owned: V2EquipInstance[];
  editable: boolean;
}) {
  const [selection, setSelection] = useState(initialSelection ?? null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsFailed, setOptionsFailed] = useState(false);
  const [achievementOptions, setAchievementOptions] = useState<AchievementOption[]>([]);
  const content = resolveBadgeContent(selection, owned);

  if (!content && !editable) return null;

  const openEditor = async () => {
    setEditorOpen(true);
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
          <button
            type="button"
            onClick={openEditor}
            aria-label="대표 배지 편집"
            className="absolute right-1.5 top-1.5 z-20 rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-amber-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-amber-300"
          >
            <PencilSimple size={14} weight="bold" aria-hidden="true" />
          </button>
        ) : null}

        <div className={`flex min-h-24 items-end justify-center ${editable ? "gap-1.5" : "gap-4"}`}>
          {content ? (
            <BadgeMedallion
              content={content}
              onClick={editable ? openEditor : undefined}
            />
          ) : (
            <EmptyBadgeSlot onClick={openEditor} />
          )}
          {editable ? (
            <>
              <LockedBadgeSlot />
              <LockedBadgeSlot />
            </>
          ) : null}
        </div>
      </section>

      {editorOpen ? (
        <BadgeEditor
          initialSelection={selection}
          options={achievementOptions}
          loading={loadingOptions}
          failed={optionsFailed}
          onClose={() => setEditorOpen(false)}
          onSaved={(next) => {
            setSelection(next);
            setEditorOpen(false);
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
          compact ? "size-12" : "size-14"
        } ${tone.outer}`}
      >
        <span
          className={`flex items-center justify-center rounded-full border-2 ${
            compact ? "size-8" : "size-10"
          } ${tone.inner} ${tone.icon}`}
        >
          {content.icon}
        </span>
      </span>
    </>
  );

  return (
    <div className={`flex min-w-0 flex-col items-center ${compact ? "w-20" : "w-[4.5rem]"}`}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          title={`${content.title} · ${content.description}`}
          aria-label={`${content.title} 배지 편집`}
          className="relative flex h-[4.5rem] items-start justify-center rounded-full transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          {medal}
        </button>
      ) : (
        <div
          title={`${content.title} · ${content.description}`}
          className="relative flex h-[4.5rem] items-start justify-center"
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

function EmptyBadgeSlot({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-[4.5rem] flex-col items-center rounded-md text-zinc-500 transition-colors hover:text-amber-700 dark:text-zinc-400 dark:hover:text-amber-300"
    >
      <span className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-zinc-300 bg-white shadow-inner dark:border-zinc-600 dark:bg-zinc-900">
        <Plus size={20} weight="bold" aria-hidden="true" />
      </span>
      <span className="mt-1 text-[10px] font-semibold">배지 선택</span>
      <span className="text-[9px]">무료 슬롯</span>
    </button>
  );
}

function LockedBadgeSlot() {
  return (
    <div
      title="추가 배지 슬롯은 준비 중이에요."
      className="flex w-12 flex-col items-center text-zinc-400 dark:text-zinc-600"
    >
      <span className="flex size-10 items-center justify-center rounded-full border-2 border-zinc-300 bg-zinc-100 shadow-inner dark:border-zinc-700 dark:bg-zinc-800">
        <LockSimple size={15} weight="fill" aria-hidden="true" />
      </span>
      <span className="mt-1 text-[9px] font-medium">잠김</span>
    </div>
  );
}

function BadgeEditor({
  initialSelection,
  options,
  loading,
  failed,
  onClose,
  onSaved,
}: {
  initialSelection: ProfileShowcaseSelection | null;
  options: AchievementOption[];
  loading: boolean;
  failed: boolean;
  onClose: () => void;
  onSaved: (selection: ProfileShowcaseSelection | null) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [draftId, setDraftId] = useState(
    initialSelection?.kind === "achievement"
      ? initialSelection.achievementId
      : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedId =
    options.some((option) => option.id === draftId) ? draftId : (options[0]?.id ?? "");

  useEscapeKey(() => {
    if (!saving) onClose();
  });
  useModalA11y(contentRef);

  const save = async (selection: ProfileShowcaseSelection | null) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/v2/me/profile-showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; selection?: ProfileShowcaseSelection | null }
        | null;
      if (!response.ok || !data?.ok) {
        setError("대표 배지를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      onSaved(data.selection ?? null);
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
              무료 대표 슬롯 1칸
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
          ) : options.length === 0 ? (
            <p className="py-14 text-center text-xs text-zinc-500 dark:text-zinc-400">
              아직 획득한 업적 배지가 없어요.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {options.map((option) => {
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
              {saving ? "저장 중…" : "대표 배지로 설정"}
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
