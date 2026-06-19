import type { ReactNode } from "react";
import { SURFACE_FROSTED } from "./surfaces";

// 프로스티드 헤더 = surface 토큰 SSOT(반투명+blur, 유일한 반투명 예외) + 패딩.
const HEADER_PANEL = `${SURFACE_FROSTED} p-4`;

export function HeaderPanel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={[HEADER_PANEL, className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
