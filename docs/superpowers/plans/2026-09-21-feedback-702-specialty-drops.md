# 피드백 #702 구현 계획

**Goal:** 실제 미개척지에서 누락된 12세트·36종 드랍과 노드 조건 안내를 복구한다.
**Architecture:** 몬스터 정의 → 보상 계획 → 독립 드랍 → 기존 인벤토리 저장 경로.
**Tech Stack:** TypeScript, Next.js 16, Vitest.

사용자 지침에 따라 서브에이전트 없이 executing-plans 절차로 연속 수행한다.
기본 0.004/집중 0.006, 보너스·복사 제외, 기존 RNG 보존. 배포·푸시 없음.

## Task 1: 드랍과 저장

- [x] `unexploredSpecialtyDrops.test.ts`에 36개 실제 몬스터/장비 쌍으로 경계 테스트를
  작성한다. 0.003999/0.004 및 0.005999/0.006에서 장비 유무를 검증한다.
- [x] `hunt/route.test.ts`의 실제 전투·보상과 메모리 저장소를 사용해 미개척지 승리
  응답과 `equipment.v2.owned`의 신규 장비를 검증하고 실패를 확인한다.
- [x] `unexploredMonsterPools.ts`에 `equipmentId: V2EquipmentId` 및 36개 매핑을 넣는다.
- [x] `unexploredHuntRewards.ts`에 `specialtyEquipment: { id, chance } | null`을 추가하고
  마지막 RNG에서 성공하면 `droppedEquipments.push(id)`와 equipment/special grant를 넣는다.
- [x] 관련 테스트를 통과시키고 단판/일괄, 중복, 기본 몬스터 제외를 확인한다.

## Task 2: 조건 안내와 최종 검증

- [x] `unexploredTreeModel.test.ts`에서 노드 선택 시 각 몬스터의 지정 장비가 보이는지
  검증하고 실패를 확인한 뒤 `poolRewards()`가 세 장비를 추가하도록 구현한다.
- [x] `manual/content/hunting.tsx`의 별의 무덤 선택 안내를 실제 미개척지 풀/집중 노드
  조건으로 수정한다. 기존 콘텐츠 검증의 오래된 기대값을 정정한다.
- [x] 보상·조우·장비·공방·사냥 API·미리보기 테스트, `tsc --noEmit`, 변경 파일 ESLint,
  `git diff --check`를 수행한다. diff 자체 검토 후 현 작업 브랜치에 커밋한다.

## 검증 결과

- 드랍 구현 전: 몬스터 36종 매핑/경계 및 독립 보상 테스트 38개가 누락으로 실패.
- API 구현 전: 단판·일괄 모두 승리했지만 `droppedEquipments`가 비어 실패.
- UI 구현 전: 일반/보스 연결 노드의 지정 장비 목록 누락으로 2개 실패.
- 구현 후: 관련 15개 테스트 파일, 386개 테스트 모두 통과.
- `node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit --incremental false` 통과.
  최초 기본 메모리 실행은 2GB 힙 한도로 중단되어 검사 프로세스의 한도만 늘렸다.
- 변경 TypeScript/TSX 9개 파일 ESLint 및 `git diff --check` 통과.
- 자체 검토: 실제 poolId/monsterId 매핑, 엄격한 확률 경계, 보너스·복사 제외,
  기존 보상 RNG 보존, 단판/일괄 저장, 중복 iid, 집중 노드 전달 확인.
- 기존 불투명 SURFACE_CARD/SURFACE_INSET와 반응형 줄바꿈을 그대로 사용한다.
- DB 마이그레이션, main 병합, 푸시, 배포 없음. 작업 브랜치와 /tmp 작업 공간 유지.
