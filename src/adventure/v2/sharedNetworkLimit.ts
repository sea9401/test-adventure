// 같은 인터넷 연결(IP)에서 여러 계정이 낚시·벌목·채광·농장을 쓰면 서버가 그 연결 전체를
// 잠시 멈춘다. 일반 요청 제한(1분)과 이유·시간이 달라 응답 코드를 따로 두고 화면에서 안내한다.
export const SHARED_NETWORK_LIMIT_ERROR = "shared_network_limited";
export const SHARED_NETWORK_LIMIT_WINDOW_MS = 10 * 60_000;

export class SharedNetworkLimitError extends Error {
  readonly retryAfterSec: number | null;

  constructor(retryAfterSec: number | null) {
    super(SHARED_NETWORK_LIMIT_ERROR);
    this.name = "SharedNetworkLimitError";
    this.retryAfterSec = retryAfterSec;
  }
}

function readRetryAfterSec(value: unknown): number | null {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

/** 실패 응답을 오류로 바꾼다. 다계정 제한이면 남은 시간을 담고, 아니면 fallback 코드를 쓴다. */
export function lifeRequestError(json: unknown, fallback: string): Error {
  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  if (body?.error === SHARED_NETWORK_LIMIT_ERROR) {
    return new SharedNetworkLimitError(readRetryAfterSec(body.retryAfterSec));
  }
  return new Error(fallback);
}

export function sharedNetworkLimitMessage(error: unknown): string | null {
  if (!(error instanceof Error) || error.message !== SHARED_NETWORK_LIMIT_ERROR) return null;
  const seconds =
    error instanceof SharedNetworkLimitError && error.retryAfterSec !== null
      ? error.retryAfterSec
      : SHARED_NETWORK_LIMIT_WINDOW_MS / 1000;
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `같은 인터넷 연결에서 여러 계정이 생활 콘텐츠를 이용하고 있어 잠시 제한되었습니다. 약 ${minutes}분 뒤 다시 이용할 수 있습니다.`;
}
