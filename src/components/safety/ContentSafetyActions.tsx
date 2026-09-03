"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DotsThreeVertical, Flag, Prohibit, X } from "@phosphor-icons/react";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { confirmGameAction } from "@/components/ui/gameDialog";
import {
  CONTENT_REPORT_REASONS,
  UGC_REPORT_REASON_LABELS,
  type UgcReportReason,
  type UgcReportSubject,
  type UgcSourceType,
} from "@/lib/ugc-safety";

type Props = {
  sourceType: Exclude<
    UgcSourceType,
    "marketplace_trade" | "marketplace_listing"
  >;
  sourceId: string | number;
  targetName: string;
  className?: string;
  onBlocked?: (blockedUserId: string) => void;
};

const SOURCE_LABEL: Record<Props["sourceType"], string> = {
  bulletin_post: "게시글",
  bulletin_comment: "댓글",
  chat_message: "채팅 메시지",
  inbox_message: "쪽지",
  profile: "프로필",
  guild_profile: "길드 정보",
  chat_room: "채팅방 정보",
};

function responseMessage(status: number, text: string): string {
  if (status === 409 || text === "already reported") {
    return "이미 접수되어 검토 중인 신고입니다.";
  }
  if (status === 429 || text === "rate limited") {
    return "신고 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
  }
  if (status === 404) return "대상을 찾을 수 없거나 더 이상 볼 수 없습니다.";
  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

export function ContentSafetyActions({
  sourceType,
  sourceId,
  targetName,
  className = "",
  onBlocked,
}: Props) {
  const menuId = useId();
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [subjectType, setSubjectType] =
    useState<UgcReportSubject>("content");
  const [reason, setReason] = useState<UgcReportReason>("harassment");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState<"report" | "block" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const toggleMenu = () => {
    if (menuOpen) {
      setMenuOpen(false);
      setMenuPosition(null);
      return;
    }
    const trigger = menuTriggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 160;
    const menuHeight = 88;
    const viewportGap = 8;
    const left = Math.min(
      Math.max(viewportGap, rect.right - menuWidth),
      window.innerWidth - menuWidth - viewportGap,
    );
    const belowTop = rect.bottom + 4;
    const top =
      belowTop + menuHeight <= window.innerHeight - viewportGap
        ? belowTop
        : Math.max(viewportGap, rect.top - menuHeight - 4);
    setMenuPosition({ left, top });
    setMenuOpen(true);
    setFeedback(null);
  };

  useEffect(() => {
    if (!menuOpen) return;

    const closeMenu = (returnFocus = false) => {
      setMenuOpen(false);
      setMenuPosition(null);
      if (returnFocus) menuTriggerRef.current?.focus();
    };
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuTriggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      closeMenu();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu(true);
    };
    const closeOnViewportChange = () => closeMenu();
    const focusFrame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    });

    document.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!reportOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && busy !== "report") setReportOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, reportOpen]);

  const submitReport = async () => {
    if (busy) return;
    setBusy("report");
    setFeedback(null);
    try {
      const response = await fetch("/api/safety/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectType,
          sourceType,
          sourceId,
          reason,
          details,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        setFeedback(responseMessage(response.status, text));
        return;
      }
      setReportOpen(false);
      setDetails("");
      setFeedback("신고가 접수됐습니다. 운영자가 확인하겠습니다.");
    } catch {
      setFeedback("네트워크 상태를 확인한 뒤 다시 시도해주세요.");
    } finally {
      setBusy(null);
    }
  };

  const blockUser = async () => {
    if (busy) return;
    setMenuOpen(false);
    setMenuPosition(null);
    if (
      !(await confirmGameAction(
        `${targetName}님을 차단할까요?\n\n이 사용자의 공개 콘텐츠와 게시글·댓글·채팅이 숨겨지고 서로 새 쪽지나 채팅방 초대를 보낼 수 없습니다.`,
      ))
    ) {
      return;
    }
    setBusy("block");
    setFeedback(null);
    try {
      const response = await fetch("/api/safety/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType, sourceId }),
      });
      if (!response.ok) {
        const text = await response.text();
        setFeedback(responseMessage(response.status, text));
        return;
      }
      const result = (await response.json()) as { blockedUserId: string };
      setFeedback(`${targetName}님을 차단했습니다.`);
      onBlocked?.(result.blockedUserId);
      window.dispatchEvent(
        new CustomEvent("user-safety:blocked", {
          detail: { userId: result.blockedUserId },
        }),
      );
    } catch {
      setFeedback("네트워크 상태를 확인한 뒤 다시 시도해주세요.");
    } finally {
      setBusy(null);
    }
  };

  const dialog = reportOpen ? (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && busy !== "report") {
          setReportOpen(false);
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`report-title-${sourceType}-${sourceId}`}
        className={`${SURFACE_CARD} w-full max-w-md p-5 text-zinc-900 dark:text-zinc-100`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id={`report-title-${sourceType}-${sourceId}`}
              className="text-lg font-bold"
            >
              신고하기
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              신고 대상과 이유를 선택해주세요. 신고 당시 내용이 운영자에게 전달됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReportOpen(false)}
            disabled={busy === "report"}
            aria-label="신고 창 닫기"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold">신고 대상</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(
              [
                ["content", SOURCE_LABEL[sourceType]],
                ["user", `${targetName} 사용자`],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={`${SURFACE_INSET} flex min-h-12 cursor-pointer items-center gap-2 px-3 py-2 text-sm`}
              >
                <input
                  type="radio"
                  name={`report-subject-${sourceType}-${sourceId}`}
                  value={value}
                  checked={subjectType === value}
                  onChange={() => setSubjectType(value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="mt-4 block text-sm font-semibold" htmlFor={`report-reason-${sourceType}-${sourceId}`}>
          신고 이유
        </label>
        <select
          id={`report-reason-${sourceType}-${sourceId}`}
          value={reason}
          onChange={(event) => setReason(event.target.value as UgcReportReason)}
          className="mt-2 min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {CONTENT_REPORT_REASONS.map((value) => (
            <option key={value} value={value}>
              {UGC_REPORT_REASON_LABELS[value]}
            </option>
          ))}
        </select>

        <label className="mt-4 block text-sm font-semibold" htmlFor={`report-details-${sourceType}-${sourceId}`}>
          추가 설명 <span className="font-normal text-zinc-500">(선택)</span>
        </label>
        <textarea
          id={`report-details-${sourceType}-${sourceId}`}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          maxLength={500}
          rows={4}
          placeholder="운영자가 확인할 내용을 적어주세요."
          className="mt-2 w-full resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <div className="mt-1 text-right text-[11px] tabular-nums text-zinc-500">
          {details.length} / 500
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setReportOpen(false)}
            disabled={busy === "report"}
            className="min-h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submitReport}
            disabled={busy === "report"}
            className="min-h-11 rounded-md bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {busy === "report" ? "접수 중…" : "신고 접수"}
          </button>
        </div>
      </section>
    </div>
  ) : null;

  const menu = menuOpen && menuPosition ? (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label={`${targetName} 콘텐츠 관리`}
      onKeyDown={(event) => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          return;
        }
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            '[role="menuitem"]:not(:disabled)',
          ),
        );
        if (items.length === 0) return;
        event.preventDefault();
        const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
        const nextIndex =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : event.key === "ArrowDown"
                ? (currentIndex + 1) % items.length
                : (currentIndex - 1 + items.length) % items.length;
        items[nextIndex]?.focus();
      }}
      className={`${SURFACE_CARD} fixed z-[110] w-40 overflow-hidden p-1 shadow-lg`}
      style={{ left: menuPosition.left, top: menuPosition.top }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          setMenuOpen(false);
          setMenuPosition(null);
          setFeedback(null);
          setReportOpen(true);
        }}
        disabled={busy !== null}
        className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-rose-600 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-rose-400"
      >
        <Flag size={16} weight="bold" aria-hidden />
        신고
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={blockUser}
        disabled={busy !== null}
        className="flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-rose-600 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-rose-400"
      >
        <Prohibit size={16} weight="bold" aria-hidden />
        차단
      </button>
    </div>
  ) : null;

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      <button
        ref={menuTriggerRef}
        type="button"
        onClick={toggleMenu}
        disabled={busy !== null}
        aria-label={`${targetName} 신고 및 차단 메뉴`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        <DotsThreeVertical size={19} weight="bold" aria-hidden />
      </button>
      {feedback && (
        <span className="text-[11px] text-zinc-600 dark:text-zinc-300" role="status">
          {feedback}
        </span>
      )}
      {typeof document !== "undefined" && dialog
        ? createPortal(dialog, document.body)
        : null}
      {typeof document !== "undefined" && menu
        ? createPortal(menu, document.body)
        : null}
    </div>
  );
}
