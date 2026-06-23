import type { InputHTMLAttributes } from "react";

// 천단위 콤마 자동 표기 숫자 입력(정수). 큰 금액 입력 시 자릿수 가독성용 — 1,000 식.
//   type=number 는 콤마 입력을 거부하므로 type=text + inputMode=numeric 으로 구현.
//   값(state)은 콤마 포함 문자열로 보관 — 제출 시 parseAmount 로 숫자화.

// 입력 raw → "1,000" 표기 문자열. 숫자 외 문자 제거 + 선행 0 정규화 + 천단위 콤마.
export function formatThousands(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return "";
  // Number 로 선행 0 제거. 안전 정수 초과 입력은 그대로 자릿수만 콤마(정밀도 손실 회피).
  return digits.length <= 15
    ? Number(digits).toLocaleString("en-US")
    : digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// 표기 문자열 → 정수(콤마/비숫자 제거). 빈 값/손상 = 0.
export function parseAmount(formatted: string | null | undefined): number {
  const digits = (formatted ?? "").replace(/[^0-9]/g, "");
  return digits ? Number(digits) : 0;
}

type NumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode"
> & {
  // 표시 문자열(콤마 포함). 초기/외부 세팅 시에도 formatThousands 로 정규화하면 일관.
  value: string;
  // 입력 변경 시 콤마 정규화된 문자열로 콜백.
  onValueChange: (formatted: string) => void;
};

export function NumberInput({
  value,
  onValueChange,
  ...rest
}: NumberInputProps) {
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(e) => onValueChange(formatThousands(e.target.value))}
    />
  );
}
