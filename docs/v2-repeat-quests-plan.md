# v2 반복 퀘스트 (일일/주간) 설계

> 2026-06-12. 가이드 퀘스트(1회성 마일스톤·10라인)와 별개의 **주기 리셋형** 퀘스트.
> "오늘/이번 주 할 일"을 만들어 접속 리듬을 형성. 옛 "NPC 의뢰 반복 금지" 결정은
> v1 의뢰 얘기 — 이건 시스템 차원의 주기 콘텐츠로 별개.

## 원칙

- **크론 0 — lazy 롤오버**: 성벽 재생·시즌 키와 같은 패턴. 조회/수령 시 주기 키가
  바뀌었으면 그 자리에서 리셋. 일일 = KST 자정, 주간 = 월요일 00:00 KST
  (`thisWeekStartKST` 재사용 — 낚시/보물/PvP 시즌과 정합).
- **차분 판정**: 가이드 퀘(절대값 자동감지)와 달리 "이번 주기 동안 N회" — 주기 시작
  시점 **스냅샷(baseline)** 을 저장하고 `현재값 − baseline ≥ 목표` 로 판정.
  신호는 전부 기존 누적 카운터(세이브/DB) — 신규 write 는 강화 시도 카운터 1개뿐.
- **보상 = 습관 보너스**: 주 수입(사냥)을 대체하지 않는 소액 골드. 강화 골드 sink
  (수백만)와 비교해 미미한 수준 유지 — 인플레 없음.

## 저장 — `repeat-quests.v2` (서버 전용 키)

```
{
  daily:  { key: "2026-06-12", baseline: Snapshot, claimed: ["d_battles30", ...] },
  weekly: { key: "2026-06-08", baseline: Snapshot, claimed: [...] }  // 주 시작일
}
```

- `Snapshot` = { battleCount, siegeAttempts, siegeWins, warTreasuryGold, fishCaught,
  enhanceAttempts } — 퀘스트가 쓰는 누적 신호의 주기 시작 시점 값.
- 롤오버: GET(무락)에서 키 불일치 감지 → 현재 누적값으로 baseline 재스냅샷 +
  claimed 비움 + upsert. race 무해(동시 GET 이 같은 스냅샷을 씀). claim 은 락 후 재검증.

## 신호 (전부 기존 누적치)

| 신호 | 출처 | 비고 |
|---|---|---|
| battleCount | adventure-log.v2 (kills 합+패배) | 가이드 퀘와 동일 파생 |
| siegeAttempts / siegeWins | outpost_claim_attempts (attacker 인덱스) | DB 카운트 차분 |
| warTreasuryGold | adventure-log.v2 | 금고 탈환전 카운터 |
| fishCaught | fishing-codex.v1 totalCaught 합 | 누적 마리 수 |
| **enhanceAttempts** | adventure-log.v2 — **신규 카운터** | enhance 라우트 +1 (전쟁 카운터 패턴) |
| arenaToday | arena-history.v2 entries[].at | 주기 내 기록 존재(트림 10판이라 횟수 차분 불가 — 존재 판정만) |

## 퀘스트 셋 (초기 다이얼)

**일일 (5종, 합 4,000G)** — 10~20분 분량:

| id | 퀘스트 | 목표 | 보상 |
|---|---|---|---|
| d_battles | 오늘의 사냥 | 전투 30회 | 800G |
| d_claim | 오늘의 출정 | 점령전 1회 시도 | 1,000G |
| d_fish | 오늘의 손맛 | 물고기 3마리 | 600G |
| d_enhance | 오늘의 단조 | 강화 1회 시도 | 600G |
| d_arena | 오늘의 결투 | 아레나 1판 | 1,000G |

**주간 (4종, 합 32,000G)** — 한 주 누적:

| id | 퀘스트 | 목표 | 보상 |
|---|---|---|---|
| w_battles | 주간 토벌 | 전투 500회 | 8,000G |
| w_siege | 주간 공성 | 점령전 3승 | 10,000G |
| w_treasury | 주간 금고 사냥 | 금고 회수 5,000G | 8,000G |
| w_fish | 주간 어획 | 물고기 30마리 | 6,000G |

- **주간 올클리어 보너스(선택지)**: 4종 전부 수령 시 🔵 푸른 강화석 1개 — 주당
  유저당 1개의 통제된 수급(접속 동기 ↔ 돌 희소 정책 균형). ⚠️ 사용자 결정 필요.

## API·UI

- **GET /api/v2/me/quests** 응답에 `repeat: { daily: [...], weekly: [...],
  dailyResetAt, weeklyResetAt }` 동봉 — 퀘별 progress/goal/claimed. 기존 1회 호출 유지.
- **POST /api/v2/me/quests/claim** 확장 — repeat 퀘 id 면 락 후 주기 키 일치 확인 +
  차분 재검증 + claimed 추가 + 골드 지급(가이드 claim 과 동일 패턴).
- **UI**: 퀘스트 패널 상단에 "일일 / 주간" 섹션(가이드 라인 위) — 진행 바
  (`progress/goal`), 리셋 카운트다운("12시간 후 리셋"), 받기 버튼. 홈 배너는 가이드
  우선 유지(반복퀘는 배너 미점유).

## PR 분할

1. **PR-1 엔진+API**: repeat-quests.v2 스냅샷/롤오버/판정 순수 모듈(v2RepeatQuests.ts)
   + enhanceAttempts 카운터(enhance 라우트) + quests GET/claim 확장 + 테스트
   (롤오버·차분·주기 경계·재수령 차단).
2. **PR-2 UI**: 패널 일일/주간 섹션 + 진행 바 + 카운트다운.

## 결정 필요

1. 주간 올클리어 보너스 = 푸른 강화석 1개 — 넣을까? (돌 희소 정책과의 균형)
2. 일일 5종·주간 4종 구성/수치 — 위 표대로 갈까?
