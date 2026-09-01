"use client";

import { X } from "@phosphor-icons/react";
import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { V2SkillId } from "@/adventure/data/v2/v2Skills";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import { buildSkillDetailModel } from "./skillDetailModel";

const SKILL_DETAIL_TITLE_ID = "skill-detail-title";

export const SKILL_DETAIL_OVERLAY_CLASS =
  "fixed inset-0 z-[160] flex items-end justify-center overflow-y-auto bg-black/50 sm:items-center sm:p-4";

export const SKILL_DETAIL_PANEL_CLASS =
  `flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden ${SURFACE_CARD}`;

export const SKILL_DETAIL_BODY_CLASS =
  "min-h-0 overflow-y-auto p-4 sm:p-5";

function warnUnknownSkill(skillId: V2SkillId): void {
  if (process.env.NODE_ENV === "development") {
    console.warn(`[skill-detail] Unknown skill: ${skillId}`);
  }
}

export function SkillDetailContent({ skillId }: { skillId: V2SkillId }) {
  const model = buildSkillDetailModel(skillId);
  if (!model) {
    warnUnknownSkill(skillId);
    return null;
  }

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <div className="flex flex-wrap gap-1.5" aria-label="스킬 분류">
          {model.badges.map((badge) => (
            <span
              key={badge}
              className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:border-zinc-600 dark:text-zinc-300"
            >
              {badge}
            </span>
          ))}
        </div>
        <h2
          id={SKILL_DETAIL_TITLE_ID}
          className="text-xl font-bold text-zinc-950 dark:text-zinc-50"
        >
          {model.name}
        </h2>
      </header>

      <p
        className={`${SURFACE_ACCENT} p-3 text-sm leading-6 text-amber-950 dark:text-amber-100`}
      >
        {model.summary}
      </p>

      <section aria-labelledby="skill-detail-facts-title">
        <h3
          id="skill-detail-facts-title"
          className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
        >
          핵심 효과
        </h3>
        <ul className={`${SURFACE_INSET} space-y-1.5 p-3 text-sm text-zinc-800 dark:text-zinc-200`}>
          {model.facts.map((fact, index) => (
            <li key={`${fact}-${index}`}>{fact}</li>
          ))}
        </ul>
      </section>

      {model.sections.map((section) => (
        <section
          key={section.id}
          className={`${SURFACE_INSET} p-3`}
          aria-labelledby={`skill-detail-section-${section.id}`}
        >
          <h3
            id={`skill-detail-section-${section.id}`}
            className="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
          >
            {section.title}
          </h3>
          <ul className="mt-2 space-y-1.5 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
            {section.items.map((item, index) => (
              <li key={`${section.id}-${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function SkillDetailTrigger({
  skillId,
  skillName,
  onOpen,
  className,
  children,
}: {
  skillId: V2SkillId;
  skillName: string;
  onOpen: (skillId: V2SkillId, trigger: HTMLButtonElement) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label={`${skillName} 상세 보기`}
      onClick={(event) => onOpen(skillId, event.currentTarget)}
    >
      {children}
    </button>
  );
}

export function SkillDetailDialog({
  skillId,
  onClose,
}: {
  skillId: V2SkillId;
  onClose: () => void;
}) {
  const model = buildSkillDetailModel(skillId);
  if (!model) {
    warnUnknownSkill(skillId);
    return null;
  }

  return <SkillDetailPortal skillId={skillId} onClose={onClose} />;
}

function SkillDetailPortal({
  skillId,
  onClose,
}: {
  skillId: V2SkillId;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEscapeKey(onClose);
  useModalA11y(panelRef);

  const dialog = (
    <div
      className={SKILL_DETAIL_OVERLAY_CLASS}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={SKILL_DETAIL_TITLE_ID}
        className={SKILL_DETAIL_PANEL_CLASS}
      >
        <div className="flex shrink-0 items-start justify-end border-b border-zinc-200 p-3 dark:border-zinc-700">
          <button
            type="button"
            onClick={onClose}
            aria-label="스킬 상세 닫기"
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <X size={19} aria-hidden />
          </button>
        </div>
        <div className={SKILL_DETAIL_BODY_CLASS}>
          <SkillDetailContent skillId={skillId} />
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
