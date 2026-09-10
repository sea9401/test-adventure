# 7차 세 직업 구현 계획

> 실행: superpowers:executing-plans를 적용해 현재 브랜치에서 순차 진행한다. 사용자 지침에 따라 서브에이전트와 별도 승인 질문은 생략한다.

**Goal:** 이지스·세라핌·드래곤로드를 전직하여 고유 스킬을 배우고 실제 전투에 사용할 수 있게 한다.

**Architecture:** tier7Jobs 메타데이터와 v2JobCatalog의 기존 전직 경로를 확장한다. 별도 스킬 카탈로그를 v2Skills에 합성하고 기존 공통 효과 엔진을 재사용한다.

**Tech Stack:** TypeScript, Next.js 16, Vitest.

## 제약

- 선행 숙련도 각각 100,000 / 최초 레벨 100 / 파편 30개 / 최초 이력 기반 영구 해금.
- 각 직업 수행 합 7, 직업 보너스 합 48, 고유 스킬 장착 SP 합 46.
- 사용자 미추적 문서 보존. 외부 쓰기와 배포 없음.

## 1. 공개 경로와 전투 회귀 테스트

- [x] `tier7Expansion.test.ts`에서 세 직업의 실제 전직 가능 여부와 첫 전직 전후 SP 집계, 학습 목록을 검증한다.
- [x] `tier7ExpansionCombat.test.ts`에서 공통 시전과 PvE/PvP의 공격·보호막·회복·연소 및 MP 부족을 검증한다.
- [x] `npx vitest run src/adventure/data/v2/tier7Expansion.test.ts src/adventure/v2/combat/tier7ExpansionCombat.test.ts`로 누락된 직업/스킬 때문에 실패하는지 확인한다.

## 2. 카탈로그 연결

- [x] `tier7Jobs.ts`에 aegis, seraphim, dragonlord와 명세의 두 선행 직업을 등록한다.
- [x] `v2JobCatalog.ts`에 수행·보너스·legacy 매핑을 등록한다.
- [x] `tier7ExpansionSkills.ts`에 세 패키지를 작성하고 `v2Skills.ts`의 ID union과 RAW 카탈로그에 합친다. `v2SkillsByJob.ts`에 학습 목록을 연결한다.
- [x] 기존 정확한 7차 목록·직업 수 테스트를 새 공개 목록에 맞춘다.
- [x] 집중 테스트로 전직·영구 해금·공통 전투 처리를 검증한다.

## 3. 검증과 커밋

- [x] 실효 스킬 계수와 선행 직업 대비 피해, MP/SP, 기본 패턴을 점검한다.
- [x] 관련 데이터·전직 API·로드맵·전투 테스트와 `npx tsc --noEmit`, 변경 파일 ESLint를 실행한다.
- [x] `npm run check-images`, `npm run check-module-budgets`, `git diff --check`를 실행한다.
- [x] 변경 파일을 자체 리뷰하고 필요한 회귀 검증을 마친 뒤 명시적으로 해당 파일만 stage하여 커밋한다.

## 검증 기록

- 최종 집중 회귀: 14개 파일, 455개 테스트 통과.
- 확장 회귀: 257개 파일, 3,044개 테스트 실행. 신규 스킬 목록으로 인한 2건은 수정 후 집중 회귀에서 통과. 나머지 SP fixture 3건은 변경 없는 62e9ba52c에서도 같은 실패를 확인했다.
- TypeScript(8GB 힙), 변경 파일 ESLint, 이미지 참조, 모듈 크기, diff 공백 검사 통과.
- 패키지 성능 점수 16.61/16.80/16.56, 각 46 SP. 단일 시전 비교와 전체 조합 밸런스 검증의 한계를 설계 문서에 기록했다.
