import { ArrowLeft } from "@phosphor-icons/react";
import { Button } from "./Button";

// 모든 v2 화면 공용 "뒤로" 버튼 — 모양 통일(테두리 + ArrowLeft + "뒤로").
// SubViewHeader 와 각 화면의 인라인 뒤로 버튼이 전부 이 하나를 쓴다.
export function BackButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      onClick={onClick}
      aria-label="뒤로"
      variant="secondary"
      size="sm"
      className={className}
    >
      <ArrowLeft size={16} weight="bold" />
      뒤로
    </Button>
  );
}
