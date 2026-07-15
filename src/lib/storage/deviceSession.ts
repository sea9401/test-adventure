"use client";

import {
  DEVICE_SESSION_KEY,
  DEVICE_SESSION_MAX_LENGTH,
} from "../deviceSessionConfig";

// 디바이스별 고유 ID — 단일 세션 enforce 의 토큰. localStorage 에 박혀 같은 브라우저
// 안에서는 모든 탭이 공유한다. 다른 디바이스/브라우저는 자기 localStorage 가 비어
// 있어 새 UUID 를 만든다. /api/session/claim 이 같은 값을 HttpOnly 쿠키에도 발급하고
// 서버 users.activeSessionId 와 비교해 다른 기기의 요청을 차단한다.
//
// SaveProvider 가 핵심 호출자(부트스트랩 시 createOrGet → claim) 이고, 자동 사냥
// 기존 저장 API는 X-Session-Id 헤더도 함께 보내 점진적 호환을 유지한다.
export { DEVICE_SESSION_KEY } from "../deviceSessionConfig";

function makeFreshId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * localStorage 에 토큰이 있으면 그대로, 없으면 새로 만들어 박고 반환.
 * SaveProvider 처럼 "이 디바이스를 활성 세션으로 claim 할 권한이 있다" 는
 * 부트스트랩 경로에서 사용. 일반 변경성 호출은 readDeviceSessionId 로 충분.
 */
export function getOrCreateDeviceSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = localStorage.getItem(DEVICE_SESSION_KEY);
    if (
      existing &&
      existing.length > 0 &&
      existing.length <= DEVICE_SESSION_MAX_LENGTH
    ) {
      return existing;
    }
  } catch {}
  const fresh = makeFreshId();
  try {
    localStorage.setItem(DEVICE_SESSION_KEY, fresh);
  } catch {}
  return fresh;
}

/**
 * 토큰이 이미 있으면 반환, 없으면 빈 문자열. 새로 만들지 않음 — 헤더 동봉용.
 * SaveProvider 부트스트랩 전 호출되면 "" 가 나가지만, checkSession 이 빈 헤더는
 * 통과시켜서 무해. 부트스트랩 직후엔 다른 호출자도 같은 토큰을 보게 된다.
 */
export function readDeviceSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(DEVICE_SESSION_KEY) ?? "";
  } catch {
    return "";
  }
}
