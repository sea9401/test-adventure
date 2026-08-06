import ReactMarkdown, { type Components, type UrlTransform } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  bulletinTextColorFromUrl,
  expandBulletinTextColors,
} from "./bulletinTextColors";

// 사용자 게시글은 신뢰할 수 없는 입력이다. HTML·이미지는 렌더 트리에서 제외하고,
// 링크도 앱 내부 경로와 http(s)만 허용한다. react-markdown 기본 escaping 위에
// 허용 목록을 한 번 더 둬 향후 플러그인이 추가돼도 실행 가능한 태그가 열리지 않게 한다.
const BULLETIN_MARKDOWN_ELEMENTS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "p",
  "br",
  "strong",
  "em",
  "del",
  "ul",
  "ol",
  "li",
  "blockquote",
  "hr",
  "a",
  "code",
  "pre",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "input",
] as const;

export const safeBulletinMarkdownUrl: UrlTransform = (url) => {
  if (bulletinTextColorFromUrl(url)) return url;
  if (url.startsWith("/") || url.startsWith("#")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? url
      : "";
  } catch {
    return "";
  }
};

const COMPONENTS: Components = {
  a({ node, href, children, ...props }) {
    void node;
    const textColor = bulletinTextColorFromUrl(href);
    if (textColor) {
      return (
        <span
          className={`${textColor.textClassName} [&_strong]:!text-current`}
        >
          {children}
        </span>
      );
    }
    if (!href) return <span>{children}</span>;
    const external = /^https?:\/\//i.test(href);
    return (
      <a
        {...props}
        href={href}
        className="font-medium text-sky-700 underline decoration-sky-400 underline-offset-2 hover:text-sky-600 dark:text-sky-300 dark:decoration-sky-600 dark:hover:text-sky-200"
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
      >
        {children}
        {external ? <span className="sr-only"> (새 창)</span> : null}
      </a>
    );
  },
  pre({ node, children, ...props }) {
    void node;
    return (
      <pre
        {...props}
        className={`${SURFACE_INSET} mt-4 overflow-x-auto p-3 text-[13px] leading-6`}
      >
        {children}
      </pre>
    );
  },
  table({ node, children, ...props }) {
    void node;
    return (
      <div className="mt-4 overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-700">
        <table {...props} className="w-full min-w-[28rem] border-collapse text-sm">
          {children}
        </table>
      </div>
    );
  },
};

export type BulletinMarkdownSegment =
  | { kind: "markdown"; content: string }
  | { kind: "details"; summary: string; content: string };

type MarkdownFence = { marker: "`" | "~"; length: number } | null;

function nextMarkdownFence(line: string, current: MarkdownFence): MarkdownFence {
  const match = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return current;
  const marker = match[1][0] as "`" | "~";
  if (!current) return { marker, length: match[1].length };
  if (
    marker === current.marker &&
    match[1].length >= current.length &&
    match[2].trim() === ""
  ) {
    return null;
  }
  return current;
}

// 원시 HTML을 열지 않고 게시판 전용 :::details 제목 … ::: 블록만 안전하게 분리한다.
// 코드 펜스 안의 예시 문법과 닫히지 않은 블록은 일반 마크다운으로 그대로 둔다.
export function parseBulletinMarkdownSegments(
  content: string,
): BulletinMarkdownSegment[] {
  const lines = content.split("\n");
  const segments: BulletinMarkdownSegment[] = [];
  let markdownLines: string[] = [];
  let fence: MarkdownFence = null;

  const flushMarkdown = () => {
    if (markdownLines.length === 0) return;
    segments.push({ kind: "markdown", content: markdownLines.join("\n") });
    markdownLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    // CommonMark가 블록 문법에 허용하는 최대 세 칸 들여쓰기를 접기 문법에도
    // 허용한다. 복사·붙여넣기 과정에서 본문 전체에 공백이 붙어도 정상 인식하되,
    // 네 칸 이상 들여쓴 코드 블록은 접기 영역으로 바꾸지 않는다.
    const opening =
      fence == null
        ? /^[ \t]{0,3}:::details(?:[ \t]+(.*?))?[ \t]*$/.exec(line)
        : null;

    if (opening) {
      const detailLines: string[] = [];
      let detailFence: MarkdownFence = null;
      let closingIndex = -1;
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const detailLine = lines[cursor];
        if (
          detailFence == null &&
          /^[ \t]{0,3}:::[ \t]*$/.test(detailLine)
        ) {
          closingIndex = cursor;
          break;
        }
        detailLines.push(detailLine);
        detailFence = nextMarkdownFence(detailLine, detailFence);
      }

      if (closingIndex >= 0) {
        flushMarkdown();
        segments.push({
          kind: "details",
          summary: opening[1]?.trim() || "자세히 보기",
          content: detailLines.join("\n"),
        });
        index = closingIndex;
        continue;
      }
    }

    markdownLines.push(line);
    fence = nextMarkdownFence(line, fence);
  }

  flushMarkdown();
  return segments;
}

function SafeMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      allowedElements={[...BULLETIN_MARKDOWN_ELEMENTS]}
      components={COMPONENTS}
      remarkPlugins={[remarkGfm, remarkBreaks]}
      skipHtml
      urlTransform={safeBulletinMarkdownUrl}
    >
      {expandBulletinTextColors(content)}
    </ReactMarkdown>
  );
}

export function BulletinMarkdown({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  const segments = parseBulletinMarkdownSegments(content);
  return (
    <div
      className={`bulletin-markdown min-w-0 break-words text-[15px] leading-7 text-zinc-800 dark:text-zinc-200 ${className}
        [&>*:first-child]:mt-0 [&>*:last-child]:mb-0
        [&_h1]:mt-6 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:text-zinc-950 dark:[&_h1]:text-zinc-50
        [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:leading-snug [&_h2]:text-zinc-950 dark:[&_h2]:text-zinc-50
        [&_h3]:mt-5 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-zinc-900 dark:[&_h3]:text-zinc-100
        [&_h4]:mt-4 [&_h4]:font-bold [&_h4]:text-zinc-900 dark:[&_h4]:text-zinc-100
        [&_p]:mt-3 [&_strong]:font-bold [&_strong]:text-zinc-950 dark:[&_strong]:text-zinc-50
        [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6
        [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6
        [&_li>ul]:mt-1 [&_li>ol]:mt-1
        [&_blockquote]:mt-4 [&_blockquote]:border-l-4 [&_blockquote]:border-amber-400 [&_blockquote]:pl-4 [&_blockquote]:text-zinc-600 dark:[&_blockquote]:border-amber-600 dark:[&_blockquote]:text-zinc-300
        [&_hr]:my-6 [&_hr]:border-zinc-200 dark:[&_hr]:border-zinc-700
        [&_code]:rounded [&_code]:bg-zinc-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:text-rose-700 dark:[&_code]:bg-zinc-800 dark:[&_code]:text-rose-300
        [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit
        [&_th]:border-b [&_th]:border-zinc-200 [&_th]:bg-zinc-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold dark:[&_th]:border-zinc-700 dark:[&_th]:bg-zinc-800
        [&_td]:border-b [&_td]:border-zinc-200 [&_td]:px-3 [&_td]:py-2 dark:[&_td]:border-zinc-700
        [&_tr:last-child_td]:border-b-0 [&_input]:mr-2`}
    >
      {segments.map((segment, index) =>
        segment.kind === "details" ? (
          <details
            key={`details:${index}`}
            className={`${SURFACE_INSET} group mt-4 px-3 py-2`}
          >
            <summary className="cursor-pointer select-none font-semibold text-zinc-900 marker:text-zinc-400 dark:text-zinc-100">
              {segment.summary}
            </summary>
            <div className="mt-2 border-t border-zinc-200 pt-1 dark:border-zinc-700">
              <SafeMarkdown content={segment.content} />
            </div>
          </details>
        ) : (
          <SafeMarkdown key={`markdown:${index}`} content={segment.content} />
        ),
      )}
    </div>
  );
}
