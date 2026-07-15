// 단일 기기 세션에서 클라이언트·Auth 콜백·서버 라우트가 공유하는 이름과 검증.
export const DEVICE_SESSION_KEY = "device-session-id.v1";
export const DEVICE_SESSION_COOKIE = "game-device-session.v1";
export const DEVICE_SESSION_TAKEOVER_COOKIE = "game-session-takeover.v1";
export const DEVICE_SESSION_MAX_LENGTH = 100;
export const DEVICE_SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isValidDeviceSessionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= DEVICE_SESSION_MAX_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}
