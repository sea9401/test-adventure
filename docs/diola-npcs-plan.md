# 디올라 마을 NPC 추가 계획

> 상태: ✅ **구현 완료** — 디올라 마을 NPC 출고. 이 문서는 설계 기록.

안개 호수 가장자리의 어촌 **디올라 마을(`diola`)** 에서 만날 수 있는 NPC를 정의·구현하는 계획.
마을 노드를 단순 통과 지점이 아닌 "사람을 만나는 곳"으로 만드는 것이 목표.

## 컨셉

- 호수의 안개·물고기·고립감을 살린 **어촌 무드**.
- NPC 6명 내외의 작은 명단 — 각자 한 가지 명확한 역할(서비스 / 퀘스트 훅 / 분위기).
- 시작 마을과 톤 차이를 둠: 시작 마을이 따뜻한 평지 마을이면, 디올라는 안개 끼고 조금 음울/신비.

## 데이터 모델

```ts
// src/adventure/data/npcs.ts (가칭)
import type { RegionId } from "./world";

export type NpcId =
  | "diola_elder"
  | "diola_fisher"
  | "diola_innkeeper"
  | "diola_merchant"
  | "diola_kid"
  | "diola_stranger";

export type NpcRole =
  | "elder"        // 마을 어른 / 정보 / 메인 퀘스트 훅
  | "vendor"       // 상점
  | "innkeeper"    // 휴식·회복
  | "quest"        // 의뢰 제공자
  | "lore"         // 잡담 / 세계관
  | "stranger";    // 미스터리 훅

export type Npc = {
  id: NpcId;
  region: RegionId;
  name: string;
  role: NpcRole;
  portrait?: string;             // /images/npc/{id}.png (없으면 fallback)
  description: string;           // 한 줄 외형/분위기 설명
  greeting: string;              // 첫 대화 한 줄
  dialogue?: string[];           // 짧은 잡담 풀 (랜덤)
  service?: NpcService;          // 상점/숙소 등
  questIds?: string[];           // 제공 의뢰 (모험가 길드 시스템과 별개로 NPC 직접 의뢰)
  tags?: string[];               // ex) ["mystery", "lake"]
};

export type NpcService =
  | { kind: "rest"; goldCost: number }                 // HP/MP 회복
  | { kind: "shop"; itemIds: string[] }                // 판매 품목
  | { kind: "ferry"; toRegion: RegionId; cost: number }; // 호수 건너편 등
```

`Region`에 `npcIds?: NpcId[]`를 추가하거나, `npcs.ts`에서 `region` 필드로 역참조하는 방식 둘 다 가능. 후자(역참조)가 맵 파일을 깨끗하게 유지함.

## 초기 NPC 명단 (디올라 마을)

| ID | 이름 | 역할 | 한 줄 설명 |
| --- | --- | --- | --- |
| `diola_elder` | 촌장 마린 | elder | 안개 너머의 일을 가장 오래 봐온 노인. 메인 줄거리의 첫 단서를 줌. |
| `diola_fisher` | 어부 카이 | quest | 매일 새벽 호수에 나가는 청년. "물고기가 줄었다"는 의뢰를 줌. |
| `diola_innkeeper` | 여관 주인 노라 | innkeeper | "안개 여관"을 운영. 골드로 휴식해 HP/MP 회복. |
| `diola_merchant` | 잡화상 보로 | vendor | 호수 마을 특산 잡화 판매. 회복 포션·낚시 미끼 등. |
| `diola_kid` | 꼬마 리오 | lore | 안개 호수에 떠다니는 등불을 봤다고 주장. 분위기 빌드업. |
| `diola_stranger` | 후드를 쓴 손님 | stranger | 여관 구석. 일정 조건 충족 시에만 대화 가능. 후속 지역 해금 훅. |

### 톤·말투 가이드
- 촌장 마린: 차분하고 길게 말함. ("…이 호수도, 늘 같은 자리에 있는 건 아니야.")
- 어부 카이: 짧고 무뚝뚝. ("물고기가 줄었어. 그것뿐이야.")
- 노라: 친절·푸근. ("피곤해 보이네, 들어와요.")
- 보로: 사근사근, 조금 음흉. ("좋은 거 들여놨는데, 한번 봐요?")
- 리오: 들뜬 어린이. ("불 봤어요! 진짜!")
- 후드의 손님: 의도적으로 모호하게.

## 상호작용 흐름

```
지도 → 디올라 마을 진입
  └─ DiolaView (마을 진입 화면)
      ├─ 마을 분위기 설명 + 일러스트(추후)
      └─ NPC 목록 (EntryCard 패턴 재사용)
          └─ NPC 선택 → DialogueModal
              ├─ greeting 표시
              ├─ 옵션: [잡담 / 서비스 이용 / 의뢰 듣기 / 떠나기]
              └─ 서비스 결과 / 의뢰 수락 → 모험가 길드의 진행 의뢰에 추가
```

- **마을 진입 화면**은 일반 region(전투 가능 지역)과 분기. `region.tags?.includes("town")`이면 `BattleView` 대신 `TownView`(가칭) 렌더.
- **NPC 카드 리스트**는 기존 `EntryCard` 재활용. 아이콘은 `User`/`UserCircle`/`UserGear` 등 역할별로 변경.
- **대화 UI**는 기존 `NameSetupModal`과 비슷한 모달, 본문이 NPC 대사. 모바일 친화적인 풀스크린 변형도 고려.

## 마일스톤

- **v1**: 정적 명단 + greeting 한 줄만. 카드 클릭 → 그 NPC의 인사말 모달. 서비스/의뢰는 placeholder.
- **v2**: 여관(rest), 잡화상(shop) 동작. 골드 소모, HP/MP 회복, 아이템 구매.
- **v3**: 어부 카이의 의뢰 1건 정상 동작 (수락 → 안개 호수에서 특정 적 처치 → 보고 → 보상).
- **v4**: 후드 손님 해금 조건 + 후속 지역 잠금 해제 훅.
- **v5**: 호감도(친밀도) 시스템 — 반복 대화·의뢰 완수 시 상승, 일정 수치에서 추가 대사/보상.

## 통합 포인트

- `docs/items.md` — NPC가 파는 아이템도 도감 표에 함께 추가 (잡화상 라인업 갱신 시 동기화).
- `docs/battle-system-plan.md` — 의뢰 보상이 전투 보상 흐름과 어떻게 다른지 분리 설계.
- `RegionTag` — 이미 `"town"` 추가됨. 마을은 적이 없고 NPC가 있는 지역으로 분기하는 핵심 플래그.
- `WORLD_MAP` — 마을 region(`village`, `diola`)에는 enemies가 비어있어야 함 (이미 그러함).

## 폴더 구조 제안

```
src/adventure/
├─ data/
│  ├─ world.ts          (지역)
│  ├─ npcs.ts           (NPC 명단 - 신규)
│  └─ items.ts          (구매 가능 아이템 - 추후)
├─ MapView.tsx
├─ BattleView.tsx
├─ TownView.tsx         (마을 진입 화면 - 신규)
└─ NpcDialogue.tsx      (대화 모달 - 신규)
```

## 다음 액션

1. `src/adventure/data/npcs.ts` 작성 — 디올라 6명 데이터만 정적으로.
2. `TownView.tsx` 신규 — `Region`이 `town` 태그를 가지면 BattleView 대신 이걸 렌더.
3. `MapView` 또는 진입 라우팅에서 town 분기 추가.
4. NPC 카드 클릭 → `NpcDialogue` 모달로 greeting만 표시 (v1).
