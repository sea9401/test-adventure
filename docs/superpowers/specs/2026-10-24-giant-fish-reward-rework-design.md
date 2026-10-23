# 거대어 보상 개편 (건의 #804)

## 배경

건의 #804: "거대어 컨텐츠가 사실상 사장됐다. 보상이 매력적이지 않다. 증표로 스태미나 포션을 받게 해 달라."
스태미나 포션은 본편 진행 속도(사냥·성소)에 직결되어 채택하지 않는다. 보상이 약하다는 진단에는 동의한다.

### 운영 실측 (2026-10-24, 읽기 전용)

- 누적 287회 출현 중 제압 78회(27%). 9월 2주차 이후 주 0~6회 제압.
- 주간 참여자 최대 40명 → 최근 13~16명.
- 최근 30일 제압전은 대부분 1~3명이 75~100회 시도해 사실상 솔로 처치(최고 기여율 86~100%).
- 증표 거래소 판매 최근 60일 0건. 보유 증표 해일 377개·심연 232개(68명, 1인 최대 32개).
- 제작소 재료 거래 단가(60일): 태양석 약 100만 G·오로라 결정 약 5만 G·심해성철 약 5만 G.

### 원인

1. `dangerousBossReward`가 기여율 10%에서 4개로 막힌다. 4회 시도(5%) 3개, 75회 솔로 처치 4개.
2. 증표 소비처가 일회성(장비 3·칭호 2·테두리 1)이며, 다 채우면 미끼 교환만 남는다.
3. 장비·미끼는 위험 해역 안에서만 쓰여 본편 성장과 연결되지 않는다.

## 변경 1 — 고기여 추가 보상

`src/lib/server/dangerousFishingBoss.ts` `dangerousBossReward`

- 기존 구간(base 1개·80코인 / silver 2·140 / gold 3·190 / legend 4·220)과 발견자 보너스(+1개·+40코인)는 그대로 둔다.
- 기여율을 100%로 상한한 뒤, 10%를 넘는 부분은 **완성된 10%마다 증표 +1개·낚시 코인 +20**을 준다.
  - 정수 계산: `extraSteps = max(0, floor(min(total, max) * 10 / max) - 1)`
  - 10~19.99% → +0, 25% → +1, 50% → +4, 100% → +9.
- 결과 예: 100% 솔로 처치 = 증표 13개·낚시 코인 400 (발견자면 14개·440).
- 반환 형태(`tier`, `fishingCoins`, `materialCount`, `discovererBonus`)는 그대로. 보상은 수령 시점에 계산하므로 아직 받지 않은 지난 거대어에도 새 공식이 적용된다.

## 변경 2 — 증표 → 제작소 재료 반복 교환

`src/adventure/v2/dangerousFishingExchange.ts`

교환 결과 종류에 `{ kind: "material"; materialId: GuildWorkshopMaterialId; count: number }`를 추가하고 반복 항목 4개를 추가한다.

| id | 비용 | 결과 | 주간 한도 |
|---|---|---|---|
| `token_tidal_to_sunstone` | 해일의 거신 증표 3 | 태양석 1 | 태양석 합산 5개 |
| `token_abyss_to_sunstone` | 심연 크라켄 증표 2 | 태양석 1 | 태양석 합산 5개 |
| `token_tidal_to_starsteel` | 해일의 거신 증표 1 | 심해성철 2 | 없음 |
| `token_abyss_to_starsteel` | 심연 크라켄 증표 1 | 심해성철 3 | 없음 |

- 심연 증표 비율이 더 좋은 이유: 크라켄은 시도당 증표 획득량이 약 1.3배 적다(체력 32,000 vs 18,000).
- 주간 한도: `DANGEROUS_FISHING_WEEKLY_SUNSTONE_LIMIT = 5`, 주 경계는 `kstWeekMondayKey`(KST 월요일). 한도 대상 판별은 결과 재료가 태양석인지로 한다(`weeklyLimitedSunstone(entry)`), 항목 형태에 필드를 더하지 않는다.
- 기존 일회성 교환과 미끼 교환은 바꾸지 않는다.

### 서버 (`src/lib/server/dangerousFishingExchange.ts`)

- 교환 상태(`dangerous-fishing-exchange.v1`)에 `weekly?: { key: string; sunstone: number }`를 추가한다. 버전은 1 유지, 없는 값은 0으로 읽는다. 강화·교환 등 모든 쓰기 경로가 `weekly`를 보존해야 한다.
- 지급: `character.v2.materials`에 더한다(명예 상점과 같은 저장 위치).
- 한도 검사: 이번 주 사용량 + `count × batches`가 한도를 넘으면 `weekly_limit`(409)로 거절, 아무것도 차감하지 않는다. 이미 처리된 operationId 재요청은 기존 멱등 경로를 그대로 탄다.
- 화면 데이터: 최상위에 `weeklySunstone: { limit, used, remaining }`을 추가. 한도 항목의 `maxBatches`는 `min(구매 가능 횟수, floor(remaining / count))`.

### 클라이언트

- `useDangerousFishingExchange.ts`: `weeklySunstone` 파싱(없거나 잘못되면 화면 데이터 거부), `weekly_limit` 오류 문구.
- `DangerousFishingExchangeSection.tsx`: "제작 재료 교환" 묶음을 추가하고 이번 주 태양석 남은 수량(`이번 주 태양석 n/5`)을 보여 준다. 결과 문구는 `태양석 1개`처럼 재료명과 수량으로 표시.
- 문구 갱신: 증표 설명(`dangerousFishing.ts`), 거대어 패널 안내 2곳, 보상 수령 피드백 문구에 "제작 재료"를 포함.
- 매뉴얼(`src/app/manual/content/pastimes.tsx`): 고기여 추가 보상 규칙과 교환표 4행·주간 한도 추가.

## 테스트

- `dangerousFishingBoss.test.ts`: 25%·50%·100% 추가 보상, 100% 초과 상한, 발견자 가산, 10~19% 경계.
- `dangerousFishingExchangeRoute.test.ts`(서버 트랜잭션 테스트): 태양석 교환 지급·증표 차감, 주간 한도 초과 거절(무차감), 주가 바뀌면 사용량 초기화, 강화 후에도 주간 사용량 유지, 심해성철 무제한.
- 클라이언트 파서·섹션 렌더 테스트: `weeklySunstone` 표시, 한도 소진 시 교환 버튼 비활성.
- 매뉴얼 테스트 문구 갱신.

## 범위 밖

- 거대어 출현 빈도·체력 조정, 보상 구간 이름(`legend` 등) 한글화, 패치노트(배포 통합 때 작성).
