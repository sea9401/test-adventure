# 패시브 흡혈 구현 계획

**Goal:** 불사의 순교의 직접 피해 흡혈과 식별 가능한 회복 로그 복구.
**Architecture:** derive에서 패시브를 별도 필드로 전달하고 PvE/PvP의 일반 공격·추가타·스킬 회복 처리에 연결한다.
**Tech Stack:** TypeScript, Vitest.

- [x] derive 및 전투 회귀 테스트를 작성하고 실패를 확인한다.
- [x] engineState/derivePlayerCombatV2에서 passiveLifestealPct를 분리한다.
- [x] PvE/PvP 일반 공격과 추가타에 패시브 흡혈 및 로그를 연결한다.
- [x] PvE/PvP 스킬의 실제 HP 피해에 패시브 흡혈을 적용한다. 중복 회복·로그·보호막 코드는 `engine.skillHealing.ts`로 옮겨 기존 엔진 파일 크기 제한을 지킨다.
- [x] 스킬 다단 피해·보호막·초과 피해·HP 상한·회복 보정·0 회복 로그를 검증한다.
- [x] 관련 테스트와 TypeScript, ESLint, diff를 확인하고 이번 변경만 커밋한다.

검증 결과: 구현 전 누락 테스트 15개 실패 확인. 전투 디렉터리 및 derive 테스트 78개 파일 876개 통과. 최종 정리 후 직접 관련 테스트 161개 재확인. 전체 TypeScript(6GB 힙), 변경 파일 ESLint, 모듈 크기 제한 12개, diff 공백 검사 통과.
