"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Crown,
  PencilSimple,
  Plus,
  SpinnerGap,
  Sword,
  Trophy,
  X,
} from "@phosphor-icons/react";
import { TITLES } from "@/adventure/data/titles";
import {
  V2_EQUIPMENT,
  v2EquipCatalogTierLabel,
  type V2EquipInstance,
} from "@/adventure/data/v2/v2Equipment";
import { questById } from "@/adventure/data/v2/v2Quests";
import type { ProfileShowcaseSelection } from "@/adventure/profile/profileShowcase";
import { Button } from "@/components/ui/Button";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";

type ShowcaseKind = ProfileShowcaseSelection["kind"];

type ShowcaseOptionsResponse = {
  ok?: boolean;
  selection?: ProfileShowcaseSelection | null;
  titleOptions?: { id: string; name: string; description: string }[];
  achievementOptions?: {
    id: string;
    title: string;
    desc: string;
    points: number;
  }[];
};

const KIND_LABEL: Record<ShowcaseKind, string> = {
  equipment: "장비",
  achievement: "업적",
  title: "칭호",
};

export function ProfileShowcase({
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
  const [titleOptions, setTitleOptions] = useState<
    NonNullable<ShowcaseOptionsResponse["titleOptions"]>
  >([]);
  const [achievementOptions, setAchievementOptions] = useState<
    NonNullable<ShowcaseOptionsResponse["achievementOptions"]>
  >([]);

  const equipmentOptions = useMemo(
    () =>
      owned
        .filter((instance) => V2_EQUIPMENT[instance.id] != null)
        .sort((a, b) => {
          const tierDiff =
            V2_EQUIPMENT[b.id].tier - V2_EQUIPMENT[a.id].tier;
          if (tierDiff !== 0) return tierDiff;
          return (b.enhance?.level ?? 0) - (a.enhance?.level ?? 0);
        }),
    [owned],
  );

  const openEditor = async () => {
    setEditorOpen(true);
    setLoadingOptions(true);
    try {
      const response = await fetch("/api/v2/me/profile-showcase");
      const data = (response.ok ? await response.json() : null) as
        | ShowcaseOptionsResponse
        | null;
      if (data?.ok) {
        setTitleOptions(data.titleOptions ?? []);
        setAchievementOptions(data.achievementOptions ?? []);
      }
    } catch {
      setTitleOptions([]);
      setAchievementOptions([]);
    } finally {
      setLoadingOptions(false);
    }
  };

  const content = resolveShowcaseContent(selection, owned);
  if (!content && !editable) return null;

  return (
    <>
      <section
        aria-label="프로필 쇼케이스"
        className={`${SURFACE_INSET} group relative min-h-28 overflow-hidden p-3`}
      >
        <div className="pointer-events-none absolute -right-5 -top-5 size-20 rounded-full border-[10px] border-amber-200 dark:border-amber-900" />
        <div className="relative flex h-full min-h-20 items-center gap-3">
          {content ? (
            <>
              <span
                className={`flex size-11 shrink-0 items-center justify-center rounded-full ${content.iconClass}`}
              >
                {content.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold tracking-[0.16em] text-zinc-500 uppercase dark:text-zinc-400">
                  {content.eyebrow}
                </p>
                <p className="mt-0.5 truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {content.title}
                </p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                  {content.description}
                </p>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={openEditor}
              className="flex min-h-20 w-full items-center justify-center gap-2 rounded-md border border-dashed border-zinc-300 px-3 text-xs font-semibold text-zinc-600 transition-colors hover:border-amber-400 hover:text-amber-700 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-amber-600 dark:hover:text-amber-300"
            >
              <Plus size={17} weight="bold" aria-hidden="true" />
              무료 쇼케이스 설정
            </button>
          )}
          {editable && content ? (
            <button
              type="button"
              onClick={openEditor}
              aria-label="쇼케이스 편집"
              className="absolute right-0 top-0 rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-500 shadow-sm transition-colors hover:text-amber-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-amber-300"
            >
              <PencilSimple size={14} weight="bold" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </section>
      {editorOpen && (
        <ProfileShowcaseEditor
          initialSelection={selection}
          equipmentOptions={equipmentOptions}
          titleOptions={titleOptions}
          achievementOptions={achievementOptions}
          loadingOptions={loadingOptions}
          onClose={() => setEditorOpen(false)}
          onSaved={(next) => {
            setSelection(next);
            setEditorOpen(false);
          }}
        />
      )}
    </>
  );
}

function resolveShowcaseContent(
  selection: ProfileShowcaseSelection | null,
  owned: V2EquipInstance[],
) {
  if (selection?.kind === "equipment") {
    const instance = owned.find((item) => item.iid === selection.iid);
    const item = instance ? V2_EQUIPMENT[instance.id] : null;
    if (!instance || !item) return null;
    const enhance = instance.enhance?.level
      ? ` · +${instance.enhance.level} 강화`
      : "";
    return {
      eyebrow: "장비 쇼케이스",
      title: item.name,
      description: `${v2EquipCatalogTierLabel(item.tier)}${enhance} · ${item.description}`,
      icon: <Sword size={24} weight="duotone" aria-hidden="true" />,
      iconClass:
        "bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300",
    };
  }
  if (selection?.kind === "achievement") {
    const achievement = questById(selection.achievementId);
    if (!achievement) return null;
    return {
      eyebrow: `업적 쇼케이스 · ${achievement.points ?? 0}점`,
      title: achievement.title,
      description: achievement.desc,
      icon: <Trophy size={24} weight="duotone" aria-hidden="true" />,
      iconClass:
        "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300",
    };
  }
  if (selection?.kind === "title") {
    const title = TITLES[selection.titleId];
    if (!title) return null;
    return {
      eyebrow: "칭호 쇼케이스",
      title: `「${title.name}」`,
      description: title.description,
      icon: <Crown size={24} weight="duotone" aria-hidden="true" />,
      iconClass:
        "bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300",
    };
  }
  return null;
}

function ProfileShowcaseEditor({
  initialSelection,
  equipmentOptions,
  titleOptions,
  achievementOptions,
  loadingOptions,
  onClose,
  onSaved,
}: {
  initialSelection: ProfileShowcaseSelection | null;
  equipmentOptions: V2EquipInstance[];
  titleOptions: NonNullable<ShowcaseOptionsResponse["titleOptions"]>;
  achievementOptions: NonNullable<ShowcaseOptionsResponse["achievementOptions"]>;
  loadingOptions: boolean;
  onClose: () => void;
  onSaved: (selection: ProfileShowcaseSelection | null) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<ShowcaseKind>(
    initialSelection?.kind ?? "equipment",
  );
  const [draft, setDraft] = useState<ProfileShowcaseSelection | null>(
    initialSelection ??
      firstSelection(
        "equipment",
        equipmentOptions,
        titleOptions,
        achievementOptions,
      ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscapeKey(() => {
    if (!saving) onClose();
  });
  useModalA11y(contentRef);

  const chooseKind = (nextKind: ShowcaseKind) => {
    setKind(nextKind);
    setDraft(firstSelection(nextKind, equipmentOptions, titleOptions, achievementOptions));
    setError(null);
  };

  const save = async (nextSelection: ProfileShowcaseSelection | null = draft) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/v2/me/profile-showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection: nextSelection }),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; selection?: ProfileShowcaseSelection | null }
        | null;
      if (!response.ok || !data?.ok) {
        setError("쇼케이스를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
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
      aria-labelledby="profile-showcase-editor-title"
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
              무료 전시 슬롯 1칸
            </p>
            <h2
              id="profile-showcase-editor-title"
              className="mt-0.5 text-lg font-bold text-zinc-900 dark:text-zinc-100"
            >
              프로필 쇼케이스
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              장비, 완료한 업적, 보유 칭호 중 하나를 골라 자랑해 보세요.
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

        <div className="mt-4 grid grid-cols-3 gap-2" role="tablist">
          {(["equipment", "achievement", "title"] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={kind === entry}
              onClick={() => chooseKind(entry)}
              className={`rounded-md border px-2 py-2 text-xs font-semibold transition-colors ${
                kind === entry
                  ? "border-amber-500 bg-amber-50 text-amber-800 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {KIND_LABEL[entry]}
            </button>
          ))}
        </div>

        <div className={`${SURFACE_INSET} mt-3 p-3`}>
          {loadingOptions && kind !== "equipment" ? (
            <div className="flex min-h-16 items-center justify-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <SpinnerGap size={16} className="animate-spin" aria-hidden="true" />
              보유 목록을 불러오는 중…
            </div>
          ) : (
            <ShowcaseSelect
              kind={kind}
              draft={draft}
              equipmentOptions={equipmentOptions}
              titleOptions={titleOptions}
              achievementOptions={achievementOptions}
              onChange={setDraft}
            />
          )}
        </div>

        {error && (
          <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>
        )}

        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <Button
            variant="ghost"
            onClick={() => void save(null)}
            disabled={saving || initialSelection == null}
          >
            전시 해제
          </Button>
          <div className="flex gap-2">
            <Button onClick={onClose} disabled={saving}>
              취소
            </Button>
            <Button
              variant="primary"
              onClick={() => void save()}
              disabled={saving || draft == null || loadingOptions}
            >
              {saving ? "저장 중…" : "전시하기"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ShowcaseSelect({
  kind,
  draft,
  equipmentOptions,
  titleOptions,
  achievementOptions,
  onChange,
}: {
  kind: ShowcaseKind;
  draft: ProfileShowcaseSelection | null;
  equipmentOptions: V2EquipInstance[];
  titleOptions: NonNullable<ShowcaseOptionsResponse["titleOptions"]>;
  achievementOptions: NonNullable<ShowcaseOptionsResponse["achievementOptions"]>;
  onChange: (selection: ProfileShowcaseSelection | null) => void;
}) {
  const emptyMessage =
    kind === "equipment"
      ? "보유한 장비가 없어요."
      : kind === "achievement"
        ? "보상까지 수령한 업적이 없어요."
        : "보유한 칭호가 없어요.";
  const optionsLength =
    kind === "equipment"
      ? equipmentOptions.length
      : kind === "achievement"
        ? achievementOptions.length
        : titleOptions.length;
  if (optionsLength === 0) {
    return <p className="py-5 text-center text-xs text-zinc-500 dark:text-zinc-400">{emptyMessage}</p>;
  }

  const value =
    draft?.kind === "equipment"
      ? draft.iid
      : draft?.kind === "achievement"
        ? draft.achievementId
        : draft?.kind === "title"
          ? draft.titleId
          : "";
  return (
    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-200">
      전시할 {KIND_LABEL[kind]}
      <select
        value={draft?.kind === kind ? value : ""}
        onChange={(event) => {
          const id = event.target.value;
          onChange(
            kind === "equipment"
              ? { kind, iid: id }
              : kind === "achievement"
                ? { kind, achievementId: id }
                : { kind, titleId: id },
          );
        }}
        className="mt-1.5 w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        <option value="" disabled>
          선택하세요
        </option>
        {kind === "equipment" &&
          equipmentOptions.map((instance) => {
            const item = V2_EQUIPMENT[instance.id];
            const enhance = instance.enhance?.level
              ? ` +${instance.enhance.level}`
              : "";
            return (
              <option key={instance.iid} value={instance.iid}>
                {item.name}{enhance} · {v2EquipCatalogTierLabel(item.tier)}
              </option>
            );
          })}
        {kind === "achievement" &&
          achievementOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.title} · {option.points}점
            </option>
          ))}
        {kind === "title" &&
          titleOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
      </select>
    </label>
  );
}

function firstSelection(
  kind: ShowcaseKind,
  equipment: V2EquipInstance[],
  titles: NonNullable<ShowcaseOptionsResponse["titleOptions"]>,
  achievements: NonNullable<ShowcaseOptionsResponse["achievementOptions"]>,
): ProfileShowcaseSelection | null {
  if (kind === "equipment") {
    return equipment[0] ? { kind, iid: equipment[0].iid } : null;
  }
  if (kind === "achievement") {
    return achievements[0]
      ? { kind, achievementId: achievements[0].id }
      : null;
  }
  return titles[0] ? { kind, titleId: titles[0].id } : null;
}
