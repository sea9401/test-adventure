"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 아래로 읽어 내려가는 동안 떠 있는 버튼이 내용을 가리지 않도록 숨김 여부를 돌려준다.
 * 위로 스크롤하거나 맨 위 근처로 오면 다시 보인다. threshold 미만의 작은 흔들림은 무시한다.
 */
export function useHideOnScrollDown({
  disabled = false,
  threshold = 24,
}: { disabled?: boolean; threshold?: number } = {}): boolean {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    if (disabled) return;
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY.current;
      if (y <= threshold) {
        setHidden(false);
        lastY.current = y;
      } else if (delta >= threshold) {
        setHidden(true);
        lastY.current = y;
      } else if (delta < 0) {
        setHidden(false);
        lastY.current = y;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [disabled, threshold]);

  return disabled ? false : hidden;
}
