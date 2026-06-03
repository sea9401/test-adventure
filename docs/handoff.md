# 핸드오프 — v2 전투 밸런스 / SIM 캘리브 (브랜치: `balance/v2-combat-sim-calibration`)

> 작성 2026-06-04. 이 브랜치는 **밸런스/시뮬 캘리브 탐색본**입니다. 바로 머지용이 아니라
> 공동개발자 리뷰용 — `main`과의 차이를 보고 결정/수치/방향을 검토하기 위한 것.

---

## 0. ⚠ main과의 관계 (먼저 읽기)

- 이 작업은 **다소 옛 `main` 스냅샷** 위에서 진행됐습니다. 그 사이 `main`이 진화함:
  **장비 리팩터(`V2EquipInstance`/parseEquipmentSave)**, **몬스터 카탈로그 분리(#439)**,
  그리고 **`main` 자체의 직업 패시브 시스템**(무도가 counter · 궁수 defPenetration · 마법사
  magicBasicAttack).
- 따라서 이 브랜치를 현재 `main`에 얹으면 **충돌 지점**이 있습니다(아래 §6). 특히 **직업
  패시브는 양쪽이 다른 설계** — 머지가 아니라 **설계 조율**이 필요(공동개발자 결정).
- **리뷰 포인트**: 아래 §2~§4의 "전투 모델 + 캘리브 결정/이유/수치"가 핵심 인계물입니다.
  코드는 그 결정을 sim에서 측정·확정한 결과이며, 충돌 영역(패시브·장비)은 main 기준 재구현
  대상입니다.

---

## 1. 한 줄 요약

평타 데미지 모델을 **빼기(atk−def) → 비율경감(atk×C/(C+def))** 으로 바꾸고, 시드 RNG·랜덤성장·
동레벨 미러를 깐 뒤, **6직업 전투길이(winT)를 적당히 균질화 + 레이어(스탯/장비/스킬/패시브)
기여도를 평가**하며 다이얼을 맞춰 온 작업. 모든 §B 신모델은 **게이트(기본 OFF)** 라 라이브 엔진
동작은 보존되고, **sim만 켜서 캘리브**한다.

---

## 2. 전투 모델 결정 (§B) — 무엇을·왜

| 결정 | 내용 | 이유 |
|---|---|---|
| **비율경감 def** | 천장 = `atk × C/(C+def)`, C=100 | 빼기 모델의 "절벽"(atk≈def서 1딜↔풀딜 급변)이 **약빌드 벽(SPI 95턴 교착)** + **PvP 방어 뚫림**의 공통 원인. 비율은 def가 항상 %로만 작동(절대0·절대무력화 둘 다 없음). |
| **damageFloorPct** | 천장×floorPct ~ 천장 uniform roll. floorPct=min(0.9, 0.3+0.0015×(str+0.5int+0.3vit)) | 힘/지능/활력 빌드 = 일관 딜, 민첩/행운 = 변동 → 빌드 정체성 레버 |
| **명중 비율식** | hit% = clamp(10,95,(acc+C)/(acc+eva·k+C)), k=1·C=0 시드 | 빼기식(eva−acc %p)의 고회피=무적/저명중=헛방 양극단 완화. **측정 결과 C=0은 가혹(헛방 폭증) → C~50 권장** |
| **다단감쇠** | 턴 내 2타 ×0.5, 3타+ ×0.3 | 속도/다단 선형 강함 방지(수확체감). 크리·상태이상 발동기회는 안 줄임(데미지만) |
| **크리 오버플로 / critResist** | 유효치명 = max(0, 치명−적치명저항), 캡 초과분 크리뎀 전환 | 정신(SPI)의 치명저항이 PvE서도 작동(기존 PvP만) |
| **평타 elementMult** | 평타에 속성 상성 적용(게이트 ON 시) | 속성이 평타 baseline서도 반영. 라이브 hunt는 atk에 baked라 이중적용 방지 위해 게이트 |
| **시드 RNG** | `setBattleRng(makeSeededRng(seed))`, 전투마다 재현 | "같은 시드 = 같은 전투" → 다이얼 전후를 동일 전투로 비교(노이즈 제거). 라이브 기본 Math.random |
| **파워식** | `derivePowerScore` += magicDef×1.0 · critResist×0.5 | 신술/탱이 파워·sim 양쪽서 저평가되던 것 교정 |

게이트: `combatShared.setV2BattleModel/setRatioDef/setV2HitParams/...` — **기본 OFF(라이브·테스트
불변)**, sim이 켠다. (이게 §6 "라이브 미적용"의 근거.)

---

## 3. ★ 캘리브 과정 + 기준 (무엇을 기준으로 맞춰왔나)

**측정 환경**: `sim-v2-progression.ts` — 7빌드(STR/DEX/VIT/INT/SPI/LUK + BAL) × 6레벨,
**동레벨 유저 미러**(잡몹+보스, 스탯 영점) × 30 trial. 시드 고정 재현. **장비·스킬·패시브 = 실제
전투 시뮬**(마나풀·소모·쿨다운·평타 fallback 전부 반영).

**기준(맞춰가는 잣대)**:
1. **전투길이(winT)를 빌드별 "적당히 비슷"** — 한 빌드가 2턴, 다른 빌드가 200턴 같은 극단 제거.
2. **레이어 기여도 균형** — `leave-one-out`(풀세팅 − 한 레이어, 순서 무관)으로 스탯/장비/스킬/
   패시브가 빌드마다 너무 쏠리지 않게.
3. **미러 = 영점** — "동레벨 유저가 이 정도니 몹도 이 정도". 실제 몹은 캘리브 후 이 위에서 설계.
4. **WR 포화 인지** — 풀스펙이 미러를 100% 이기는 "포화"는 winT로 판별. 진짜 빌드 격차/생존은
   **콘텐츠를 어렵게(WR 포화 풀기)** 해야 보임 → 미완(아래 TODO).

**여정(왜 이 값들로 왔나)**:
- 평타 절벽 → **비율경감** 도입. (Lv50 빌드 WR폭 29→4pt, VIT 교착 103→45턴.)
- 풀스펙 전투가 **버스트 2~5턴**(스킬 계수 2.0~2.8이 지배) → **스킬 데미지 ×0.5**로 눌러 코어
  빌드 winT 6~16턴으로 균질화.
- 장비가 양적 파워의 **~24%**(목표 "장비>스탯" 방향) → **장비 위력 ×2.25**로 ~45% (절충).
- **SPI(신술)가 모든 지표서 outlier**(스킬에도 winT 67~201, 사제 액티브가 0딜 힐이라 오히려
  공격턴 낭비) → **패시브 즉발 신성딜(관통·회복비례) + 홀리 누적(턴마다 ramp 0.3) + 사제 힐스킬
  cd 3**(매턴 힐 스팸·과생존 견제). SPI 36→25턴, 100%승의 "느린 누적 생존형" 정체성.

**확정 다이얼(이 브랜치 sim 기본값)**: 비율경감 C=100 · damageFloorPct(위 식) · 장비 ×2.25 ·
스킬 ×0.5 · 홀리 누적 0.3 · 명중 k=1(C는 0 시드, ~50 권장) · 다단 0.5/0.3.

---

## 4. 다이얼/플래그 (sim 토글)

```
node --import tsx scripts/sim-v2-progression.ts [flags]
  (무플래그 = 결정 모델 기본 ON)
  --legacy           옛 빼기 모델(§B·다이얼 전부 OFF)로 비교
  --mirror           사냥터 풀 = 동레벨 유저 미러(밸런스 영점)
  --skills --passives  스킬/직업 패시브 장착(풀스펙)
  --seed=<str>       전투 재현(전후 비교용)
  --ratiodef=<C>     비율경감 상수(기본 100)
  --hitc=<C> --hitk=<k>  명중 비율식(기본 1,0; C~50 권장)
  --gearscale=<x>    장비 위력(기본 2.25)
  --skillscale=<x>   스킬 데미지(기본 0.5)
  --holyramp=<r>     사제 홀리 누적/턴(기본 0.3)
  --neutral-elem     속성 끔(A/B용) · --noequip 플레이어 장비 제거(기여도 측정)
```
출력에 파워(pw) 컬럼 + winT/lossT/WR/Wilson CI.

---

## 5. 변경 파일 (이 브랜치 = main + 아래만)

| 파일 | 변경 |
|---|---|
| `combatShared.ts` | §B 헬퍼(rollV2BasicDamage·v2HitChancePct·v2MultiHitFalloff·makeSeededRng)·게이트·다이얼(ratioDef/gearScale/skillScale/holyDamage/holyRamp)·battleRandom |
| `engine.ts` | §B 평타 분기(양방향)·명중비율식·다단감쇠(attacksThisTurn)·PvE critResist·사제 즉발홀리(+ramp)·무도가 반사·battleRandom 치환·신규 PlayerCombat 필드 |
| `engine-pvp.ts` | attacksThisTurn 초기화 |
| `derivePlayerCombatV2.ts` | damageFloorPct·장비위력 스케일·passive holy/reflect 산출 |
| `power.ts` | magicDef·critResist 항 |
| `v2Passives.ts` | (충돌) 사제 holyStrikeHealCoef·무도가 reflectPct |
| `v2Skills.ts` | (충돌 가능) 사제 힐스킬 4종 cooldown 0→3 |
| `monsters/types.ts` | Monster.damageFloorPct·critResistPct |
| `route.ts` | 파워식 콜러 갱신 |
| `scripts/sim-v2-progression.ts` | 랜덤성장·미러·속성·전 다이얼·파워컬럼·--noequip |
| `*.test.ts` (power/engine/combatShared.v2model/seed) | §B·시드·홀리·critResist 락 테스트 |
| `package.json` | tsx devDep |

---

## 6. 검증 + 충돌 (공동개발자 확인)

- **작업 베이스에서**: 전체 테스트 **2712 그린 · tsc 0** (모든 다이얼 기본 OFF/중립이라 라이브
  동작 불변 확인). sim 시드 재현·다이얼 측정 정상.
- **현재 main 위에서는 충돌**(이 브랜치 tsc 에러 발생):
  - **장비 리팩터**: main이 `parseEquipmentSave`를 `V2EquipInstance` 구조로 바꿈 → derive의
    옛 statRolls 사용부 불일치.
  - **직업 패시브 설계 충돌**: main(무도가 counter·궁수 defPen·마법사 magicBasic) vs 이 작업
    (무도가 reflect·사제 holyStrike). **둘 중 택1 또는 개념 병합 = 공동개발자 결정.**
  → 즉 §2~§3의 결정/수치는 유효하지만, **패시브·장비 영역 코드는 현 main 위에 재구현** 필요.

---

## 7. 남은 TODO / 리스크

1. **패시브 설계 합의** — main 패시브 vs 이 작업 패시브. (사제 "홀리 누적 + 힐cd" 컨셉은
   main 패시브 위에 올릴 수 있음.)
2. **§B 라이브 채택** = 게이트 기본값 flip + **결정성 테스트 다수 마이그**(uniform roll·명중식이
   "Math.random 상수 mock + 정확 데미지 단언" 테스트를 깸) + **권장 파워 게이트 재조정**.
3. **gear ×2.25 / skill ×0.5 / holy ramp 0.3 = sim 캘리브 값**, 라이브 미적용. 라이브 반영 시
   V2_EQUIPMENT 위력·스킬 계수·패시브에 baked + 권장파워 재튜닝.
4. **WR 포화 미해소** — 미러가 스킬/패시브 없어 풀스펙이 100% 승. 진짜 격차/생존/패시브 효용은
   미러 강화(동급화) 후 측정 필요. SPI "과생존" 견제 실측도 여기서.
5. **명중 C=0 시드 가혹** → C~50 권장(미반영, 다이얼만).

---

## 부록: main과 비교
```
git diff origin/main...balance/v2-combat-sim-calibration -- <위 §5 파일들>
```
