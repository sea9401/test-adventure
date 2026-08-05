export const BULLETIN_TEXT_COLORS = [
  {
    id: "red",
    label: "빨강",
    textClassName: "text-rose-700 dark:text-rose-300",
    swatchClassName: "bg-rose-500",
  },
  {
    id: "orange",
    label: "주황",
    textClassName: "text-amber-700 dark:text-amber-300",
    swatchClassName: "bg-amber-500",
  },
  {
    id: "green",
    label: "초록",
    textClassName: "text-emerald-700 dark:text-emerald-300",
    swatchClassName: "bg-emerald-500",
  },
  {
    id: "blue",
    label: "파랑",
    textClassName: "text-sky-700 dark:text-sky-300",
    swatchClassName: "bg-sky-500",
  },
  {
    id: "purple",
    label: "보라",
    textClassName: "text-violet-700 dark:text-violet-300",
    swatchClassName: "bg-violet-500",
  },
] as const;

export type BulletinTextColorId = (typeof BULLETIN_TEXT_COLORS)[number]["id"];

const COLOR_URL_PREFIX = "bulletin-color:";

export function bulletinTextColorFromUrl(url: string | undefined) {
  if (!url?.startsWith(COLOR_URL_PREFIX)) return null;
  const id = url.slice(COLOR_URL_PREFIX.length);
  return BULLETIN_TEXT_COLORS.find((color) => color.id === id) ?? null;
}

function escapeMarkdownLinkLabel(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]");
}

/**
 * 사용자용 `[빨강]문구[/빨강]` 문법을 react-markdown이 안전하게 처리할 내부 링크로 바꾼다.
 * 한 줄 범위만 지원해 블록 구조를 깨지 않으며, 링크 라벨 문자는 이스케이프한다.
 */
export function expandBulletinTextColors(content: string): string {
  let expanded = content;
  for (const color of BULLETIN_TEXT_COLORS) {
    const pattern = new RegExp(
      `\\[${color.label}\\]([^\\r\\n]*?)\\[\\/${color.label}\\]`,
      "g",
    );
    expanded = expanded.replace(
      pattern,
      (_, body: string) =>
        `[${escapeMarkdownLinkLabel(body)}](${COLOR_URL_PREFIX}${color.id})`,
    );
  }
  return expanded;
}

export function wrapBulletinTextColor(
  content: string,
  selectionStart: number,
  selectionEnd: number,
  colorId: BulletinTextColorId,
): { content: string; selectionStart: number; selectionEnd: number } {
  const color = BULLETIN_TEXT_COLORS.find((entry) => entry.id === colorId);
  if (!color) return { content, selectionStart, selectionEnd };

  const start = Math.max(0, Math.min(content.length, selectionStart));
  const end = Math.max(start, Math.min(content.length, selectionEnd));
  const selected = content.slice(start, end);
  const placeholder = selected || "색상 문구";
  const open = `[${color.label}]`;
  const close = `[/${color.label}]`;
  const lines = placeholder.split("\n");
  const wrapped = lines
    .map((line) => (line.length > 0 ? `${open}${line}${close}` : line))
    .join("\n");
  const nextContent = `${content.slice(0, start)}${wrapped}${content.slice(end)}`;

  if (lines.length > 1) {
    return {
      content: nextContent,
      selectionStart: start,
      selectionEnd: start + wrapped.length,
    };
  }
  return {
    content: nextContent,
    selectionStart: start + open.length,
    selectionEnd: start + open.length + placeholder.length,
  };
}
