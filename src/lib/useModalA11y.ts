"use client";

import type { RefObject } from "react";
import { useFocusTrap } from "./useFocusTrap";
import { useScrollLock } from "./useScrollLock";

// 모달 표준 a11y 묶음 — focus trap + body scroll lock.
// (Escape 키 닫기는 별도 useEscapeKey 로 호출 — onClose 콜백이 호출 측에 있어
// 분리해 둠.)
//
// ref 는 dialog 의 내부 컨텐츠 컨테이너 — `<div role="dialog">...<div ref={ref}>...</div></div>`.
export function useModalA11y(
  ref: RefObject<HTMLElement | null>,
  enabled = true,
): void {
  useFocusTrap(ref, enabled);
  useScrollLock(enabled);
}
