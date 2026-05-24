// 길드 영지 시스템 피처 플래그.
// 기본 OFF — 별빛 권역 안에 진입점 노드는 항상 그려지지만, 플래그가 OFF일 때는
// AdventureHome 의 진입 카드가 "곧 공개됩니다" 표시만 띄우고 subView 전이를 막는다.
// 본토 플레이어 경험은 플래그 ON/OFF 무관하게 동일하다(별빛 권역은 엔드콘텐츠 영역).
//
// 켜는 법: .env.development.local 또는 환경변수에 NEXT_PUBLIC_FIEFDOM_ENABLED=true.
// NEXT_PUBLIC_ 프리픽스라 클라이언트 번들에 빌드 타임 주입된다 — 토글하려면 재빌드 필요.
export function isFiefdomEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FIEFDOM_ENABLED === "true";
}
