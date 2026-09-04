"use client";

import { useEffect, type RefObject } from "react";

// 모달/dialog 내부로 Tab 포커스를 가두고, 닫힐 때 직전 포커스로 복원.
// ref 는 dialog 의 *내부 컨테이너* (포커스 가능 요소들이 들어있는 박스) — 보통
// `<div role="dialog">...<div ref={contentRef}>...</div>`.
//
// 동작:
//   1. 마운트 시 ref 내부 첫 번째 포커스 가능 요소에 포커스 (이미 ref 내부에
//      포커스가 있으면 그대로 둠 — 트리거→모달 자동 이동에 두 번 점프 방지).
//   2. Tab / Shift+Tab 이 ref 경계를 넘으려 하면 반대편 끝으로 wrap.
//   3. 언마운트 시 활성화 시점의 document.activeElement 로 포커스 복원.
//
// 사용:
//   const ref = useRef<HTMLDivElement>(null);
//   useFocusTrap(ref);
//   return <div role="dialog"><div ref={ref}>...</div></div>;
//
// enabled=false 로 바꾸면 현재 trap 과 리스너를 정리해 일시 중지하고, 다시 true 로
// 바꾸면 같은 마운트 안에서 현재 포커스를 기준으로 trap 을 재개한다. 중첩 모달이 열린
// 동안 부모 trap 만 멈출 때 컴포넌트를 언마운트할 필요가 없다.
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;

    const container = ref.current;
    if (!container) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    // 초기 포커스: 내부에 포커스 가능 요소가 없으면 컨테이너 자체에 tabindex 부여
    // (스크린리더가 dialog 의 시작을 인식하도록).
    const focusables = getFocusable(container);
    if (focusables.length > 0) {
      // 이미 내부에 포커스가 있는 경우엔 유지.
      if (!container.contains(document.activeElement)) {
        focusables[0].focus();
      }
    } else {
      container.setAttribute("tabindex", "-1");
      container.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = getFocusable(container);
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      // 포커스가 컨테이너 바깥으로 새어나간 경우엔 첫 요소로 복귀.
      if (!container.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      // 복원 — 트리거가 사라졌거나 비활성화됐을 수도 있으니 try.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        try {
          previouslyFocused.focus();
        } catch {
          /* noop */
        }
      }
    };
  }, [enabled, ref]);
}

// 포커스 가능 요소: a[href], button, input/select/textarea (disabled 제외),
// [tabindex]>=0, [contenteditable]. hidden / inert / aria-hidden 은 제외.
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

function getFocusable(root: HTMLElement): HTMLElement[] {
  const all = Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  );
  return all.filter((el) => {
    if (el.hidden) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    // display:none / visibility:hidden 검사 — offsetParent 가 null 이면 보통 숨김.
    // (position:fixed 는 false negative 가능하지만 모달 내부에선 드물어 허용.)
    if (el.offsetParent === null && el !== document.activeElement) return false;
    return true;
  });
}
