const DEFAULT_API_BODY_LIMIT_BYTES = 256 * 1024;
const UPLOAD_API_BODY_LIMIT_BYTES = 5 * 1024 * 1024;

const API_UPLOAD_PATHS = new Set([
  "/api/feedback",
  "/api/profile/image",
  "/api/v2/guild/emblem",
]);

const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type RequestMetadata = Pick<Request, "headers" | "method">;

/**
 * 선언된 Content-Length가 API 경로별 한도를 넘었는지 확인한다.
 * Content-Length가 없는 스트리밍 요청의 최종 상한은 앞단 nginx(5MB)가 담당한다.
 */
export function isApiRequestBodyTooLarge(
  request: RequestMetadata,
  pathname: string,
): boolean {
  if (
    !pathname.startsWith("/api/") ||
    !BODY_METHODS.has(request.method.toUpperCase())
  ) {
    return false;
  }

  const rawLength = request.headers.get("content-length");
  if (rawLength === null) return false;

  const contentLength = Number(rawLength);
  if (!Number.isSafeInteger(contentLength) || contentLength < 0) return false;

  const limit = API_UPLOAD_PATHS.has(pathname)
    ? UPLOAD_API_BODY_LIMIT_BYTES
    : DEFAULT_API_BODY_LIMIT_BYTES;
  return contentLength > limit;
}
