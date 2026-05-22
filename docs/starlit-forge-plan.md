# 5막 「별빛 재단 무구」 — 장기 장비 파밍 구조

> 상태: ✅ **구현 완료** — 5막 별빛 재단 무구 출고. 일부 잔여는 본문 '잔여' 절 참고. 이 문서는 설계 기록.

## 한 줄

empyrean 위로 *수직* 으로 더 못 쌓는다는 제약 위에서, 별빛 재단 라인을 **옆(사이드그레이드, 1회성) + 위(강화, 영구 sink)** 두 축으로 두어 별빛 조각이 영원히 의미를 갖는 장기 파밍 구조를 만든다.

## 진입 / 톤

- **진입 gate**: `starfall_keeper` 칭호 획득 (Ch 30 「별을 놓는 자」 종착 의식 완료). 유성이 떠나기 전 시작 마을 대장간(`smith`)에 *별빛 재단법* 을 남기고 간다.
- **톤**: 5막 수습·후일담 결의 종착. 옥좌가 흩뜨린 별빛이 결국 *누구의 것도 아닌 무구* 가 되어 모험가 손에 남는다. Ch 30 직후 자연스럽게 풀리는 영구 컨텐츠 — 새 챕터 추가 없이 *기존 5막 종착의 연장선*.

## 디자인 골자

- **empyrean 가치 보존**: 별빛 재단 무구 ≠ tier 6. 같은 tier 5 의 옆 칸. empyrean 무구는 *재단의 원료* 로 의미가 유지된다.
- **잔영 3종 협동 동기 유지**: 재단 1자루 = 잔영 3종 소재 4개씩 + empyrean 1자루 + 별빛 조각 50. 잔영 셋 *모두* 잡아야 재단 가능 → [[project-act5-starfall-plan]] 협동 보스 동선과 한 결.
- **별빛 조각 영구 sink 자리**: 룬 5→6 흡수 강화 (∞) 와 함께 *두 영구 sink* 분기. 유성 의뢰 30개(1회성)는 진입 비용, 두 축이 영구 농사 자리.
- **미니멀 톤 유지**: 강화 실패 확률 / random affix / 6막 떡밥 — 전부 안 둔다.

## PR 분할 (α → β → γ)

### PR-α — 별빛 재단 무구 5종 + 재단 레시피

신규 무구 5종 (`items.ts`):

| itemId | 이름 | slot | 능력치 (대 empyrean) |
|---|---|---|---|
| `starlit_blade`  | 별빛 재단 검   | weapon    | atk +27, str +13 (empyrean: +25/+12, +2/+1) |
| `starlit_aegis`  | 별빛 재단 방패 | weapon    | atk +27, vit +15 (empyrean: +25/+14, +2/+1) |
| `starlit_lance`  | 별빛 재단 창   | weapon    | atk +29, dex +15 (empyrean: +27/+14, +2/+1) |
| `starlit_grip`   | 별빛 재단 너클 | weapon    | atk +29, luk +15 (empyrean: +27/+14, +2/+1) |
| `starlit_mantle` | 별빛 재단 망토 | accessory | dex +12, spd +12, vit +7 (empyrean: +11/+11/+6) |

→ empyrean 대비 *살짝* 위. 강화 +5 단계의 여지를 남겨 두기 위해 작게.

재단 레시피 5종 (`recipes.ts`) — 패턴 통일:

```ts
{
  id: "starlit_blade",
  ingredients: [
    { kind: "equip", itemId: "empyrean_blade", count: 1 },
    { kind: "material", materialId: "giant_scale", count: 4 },       // 거인 잔영
    { kind: "material", materialId: "deep_scale", count: 4 },        // 수심 메아리
    { kind: "material", materialId: "war_banner_scrap", count: 4 },  // 성문지기 잔영
    { kind: "material", materialId: "starfall_shard", count: 50 },
  ],
  result: { kind: "equipment", itemId: "starlit_blade", slot: "weapon" },
  variance: { atk: 1 },
}
```

재단 진입 — 대장간 `smith` 다이얼로그에 「별빛 재단」 옵션 추가. `starfall_keeper` 칭호 가드.

`materials.ts:328` 코멘트의 *별빛 재단 무구* 약속이 α 에서 비로소 실체화.

### PR-β — 별빛 강화 시스템 + +1~+5

장비 인벤토리 항목에 `enhancementLevel: number` (default 0, 영구) 추가. UI 표시: `별빛 재단 검 +3` 식.

**강화 대상**: 별빛 재단 무구 5종 한정 (empyrean 이하는 강화 불가 — 사다리 흐려지지 않게).

**강화 비용** (별빛 조각, 누진):

| 단계 | 비용 | 누적 |
|---|---|---|
| +1 | 30  | 30 |
| +2 | 60  | 90 |
| +3 | 100 | 190 |
| +4 | 150 | 340 |
| +5 | 250 | 590 |

5자루 모두 +5 까지 = **2950 조각**. 잡몹 ~10% 드랍 기준 ~30,000 마리 → 진짜 장기.

**강화 효과** (단계당):
- 무기: atk +1, 주능력치 (str/vit/dex/luk) +1
- 망토: dex/spd 각 +1, vit +1 (3턴마다 vit)

→ +5 풀강 시 무기 ~ atk +5/주능력치 +5, 망토 ~ dex/spd +5/vit +3.

**실패 확률 없음**. 비용 누진만으로 진척 페이스 조절.

**전투 능력치 계산**: 기존 `effectiveStats` 등에 enhancement 합산. 표시 위치는 인벤토리 / 장착 UI 둘 다.

**저장**: 인벤토리 스키마에 `enhancementLevel` 추가. 마이그레이션: default 0 — 안전.

진입 gate — 별빛 재단 무구 1자루 이상 보유 시 「별빛 강화」 탭 해금.

### PR-γ — 잔영 협동 누락분 해소 + legend unique 액세서리

이전 대화에서 짚인 `coop/rewards.ts:TIER_TABLES` 의 잔영 3종 누락분을 별빛 재단 라인과 *함께* 해소.

`별빛 거인 잔영` / `수심의 메아리` / `성문지기 잔영` 누적 데미지 티어 보상 등록 — 패턴은 운봉의 거인·별을 지키는 자 그대로 5단(bronze/silver/gold/epic/legend).

- bronze/silver: 잔영별 소재 + 별빛 조각 소액
- gold: 잔영별 소재 + 별빛 조각 + 별빛 재단 라인 제작서 풀 (recipeOneOf)
- epic: 잔영별 소재 추가
- legend: 칭호 + **1% unique 액세서리** equipRoll

legend unique 3종 (`items.ts`):

| itemId | 이름 | 드랍원 | 스탯 |
|---|---|---|---|
| `giant_yoke` | 거인의 멍에 | 별빛 거인 잔영 legend | vit +18, str +12 |
| `deep_orb`   | 수심의 메아리 보주 | 수심의 메아리 legend | dex +15, spd +15 |
| `gate_bar`   | 성문의 빗장 | 성문지기 잔영 legend | atk +15, luk +18 |

(`apex_regalia` / `star_robe` / `peak_relic` 와 동등한 *legend 도달자 한정 물욕 unique* 패턴.)

칭호 — 잔영 셋 모두 legend 도달 시 별도 칭호 1종 (e.g., `starlit_quietener` — 별빛을 가라앉힌 자) 부여. 컬렉션 목표.

## 머지 순서 / 의존

```
α (재단)  →  β (강화)  →  γ (협동 보상 + unique)
```

- α 가 β 의 *대상 무구* 를 만든다 — 의존 필수.
- γ 의 gold 티어가 *별빛 재단 제작서 풀* 을 굴리므로 α 머지 후. β 와는 독립이라 평행 가능하지만 leg unique 가 α/β 의 *밖 보너스 축* 이라 마지막에 두는 게 깔끔.

## 잔여 / 미해결

- **강화 캡 +6~+10 확장**: 일단 +5 로 시작. 도달 유저 데이터 받고 후속 PR 로 +10 확장 여지 — 본 계획에서는 안 함.
- **재단 무구 *변종 분기***: 잔영별 1종씩 3 변종으로 가는 길도 가능 (거인=탱 / 메아리=속도 / 성문=딜). 본 계획은 *단일 변종* 으로 시작 — 변종 분기는 강화 캡 도달 후 컨텐츠 인플레 자리.
- **유성 떠난 후 NPC 다이얼로그**: 대장간 `smith` 가 "유성이 남기고 갔다" 라인으로 시작. 유성 본인은 Ch 30 이후 영구 부재.

## 연결되는 잔여 작업 해소

- [[project-act5-starfall-plan]] 잔여 (잔영 협동 TIER_TABLES 누락) = γ 에서 해소.
- [[project-codex-audit-followup]] Theme D 클라 권위 마이그레이션과 *무관* — 별빛 재단/강화는 서버 권위 영역(인벤토리·자원 차감) 이라 그쪽 결대로 진행.
