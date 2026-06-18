# v2 SPI(정신) 죽은축 부활 — A+B 풀버전(지원 + 대항)

2026-06-18. 오너 결정 = **A+B 풀버전(원 설계대로)**. spi 로 **힐도 하고 마법/치명도 버티는** 이중 정체성. 앵커 = 신술 지원 라인(사제 `acolyte`·수도승 `monk`) + 마법사 보조.

## 진단 (현 상태 — Explore 전수조사, 2026-06-18)

4개 역할 전부 **공식은 있으나** 실투자 유인이 없음 = "70% 죽고 30% 형식만".

| 역할 | 공식(derivePlayerCombatV2) | 실태 |
|---|---|---|
| 마법방어 | `spi×0.12 + int×0.03 + 장신구 +5` (line 501) | combatShared 가 `scaling:"magic"` 에서 차감하나 **몬스터가 마법공격 안 함 → PvE 무의미**, PvP 만 |
| 치명저항 | `spi×0.1 %p` (line 548) | engine.pvpPhase:144 에서만 차감 → **PvE 미적용** |
| 회복량 | `1 + vit×0.004 + spi×0.0025` (line 515) | spi 가 VIT 의 **0.625배** → 힐도 사실상 VIT 스탯 |
| 명중 | `spi×0.015` (line 563, 캡 35) | dex 0.05 에 밀리는 3차 보조 |

추가 사인:
- **장비 지원 0** — `V2EquipOptions` = crit/eva/mp/hp/critMult/spd/def. spi·magicDef 옵션 없음. spi 는 100% 단련/직업보너스로만.
- **앵커 직업 없음** — 4기본 앵커 str/vit/int/dex. spi 는 mage 계열 int 와 공동(int:2,spi:2)·일부 하이브리드 흔적.
- **spi 스케일 스킬 0** — `scaling:"spi"` 없음·spi% 패시브 없음(dex/luk·%패시브는 다 깔렸는데 spi 만 빠짐).
- 🔑 **끊긴 루프**: 방금 만든 사제=힐러인데 그 힐이 spi 가 아니라 VIT 로 스케일됨.

## 정체성 (목표)

spi = **신술 = 버스트(마법·치명)를 받아치고 자신/아군을 지탱하는 지원·대항 축.**
- **지원(A)**: 회복 주력 스탯 + 지원 스킬(힐/실드/재생) 스케일.
- **대항(B)**: 마법방어(마법형 몹 카운터) + 치명저항(치명형 몹 카운터)을 PvE 까지 확장. VIT(물리 벌크)와 짝 = SPI(마법·치명 벌크).
- VIT 와의 분업: VIT = 물리 받피·HP, SPI = 마법 받피·치명 받피·회복. INT 와의 분업: INT = 마공(딜), SPI = 마방·지원(딜 아님 → 파워크립 차단).

## 메캴닉 변경

### 1. 회복 spi 주축화 (A)
- `HEAL_MULT_PER_SPI` 0.0025 → **0.005**(VIT 0.004 초과 = spi 가 주력 힐 스탯, vit 보조 유지). sim 보정.
- 실드 흡수량에도 healMult 적용 여부 점검(현재 미적용이면 spi 가 실드도 키우게).

### 2. spi 장비 어픽스 (A·B 공통, itemize 경로 신설)
- `V2EquipOptions` 에 `spi?`(flat 정수) + `magicDef?`(flat 정수) 추가 → `V2_EQUIP_OPTION_KEYS`·`OPTION_LABELS`·`OPTION_PERCENT_KEYS`·aggregate·derive 입력 배선.
- 장신구(반지/목걸이)·갑옷 옵션 풀 합류 → 드랍/거래소에서 spi 를 itemize. (장신구 위력=이미 magicDef. spi 옵션은 별도 축.)

### 3. spi% / 지원 패시브 (A 메타 다양성)
- 지원 라인에 **spi% 패시브**(#794 `statPct` 패턴) + **회복강화% 패시브**(`healPowerPct` 신설 → healMult 에 가산). 직업별 1축 원칙 유지(수집 메리트).
- `V2PassiveSkillEffect` 에 `healPowerPct?` 추가·`aggregateEquippedPassives` 합산·derive 주입.

### 4. 마법방어 PvE 확장 (B — 마법형 몬스터)
- 몬스터 타입에 `atkType?: "physical" | "magic"`(기본 physical). magic 이면 enemy→player 데미지가 `damageBetween(enemyAtk, playerMagicDef)` 사용(engine.enemyPhase 분기).
- 일부 몹/보스를 **마법형으로 태그**(주술사·정령·마법 보스). 🔑 **총 피해 중립**(물리→마법 타입 *교체*, 추가 아님) → 무빌드 유저 net 중립, spi 빌드만 이득.

### 5. 치명저항 PvE 확장 (B — 치명형 몬스터)
- 몬스터 `critPct?`(기본 0)·`critMult?`. 있으면 player `critResistPct` 차감 후 치명 판정(engine.enemyPhase, PvP 로직 미러). 일부 "치명 특화" 몹/보스.
- `critResistPct` 캡 필요(과투자로 치명 완봉 방지, 예 cap 50%).

### 6. 앵커/직업 정체성 + 매뉴얼
- 지원 라인 cultivateProfile spi 비중 확정(acolyte 이미 int:1,spi:2)·tier3/4 지원 직업 spi 강화·지원 직업 jobBonus spi.
- 매뉴얼 spi 섹션 = 실제 동작과 일치하게 갱신([[feedback-manual-with-feature-prs]]).

## PR 단계화 (각: tsc+vitest+codex+머지+배포)

| PR | 내용 | 위험 | 비고 |
|---|---|---|---|
| **PR-1** | 회복 spi 주축화 + spi%/회복강화 지원 패시브 | 저 | ✅ #819 LIVE. 끊긴 사제 루프 복구 |
| **PR-2** | spi·magicDef 장비 어픽스 | 중 | itemize 경로. 개체 모델·옵션 풀 합류 |
| **PR-3a** | 마법형 몹(atkType:"magic" → 마법방어 경감) | 고 | ✅ 구현. 4몹 태그·엔진 분기·sim 검증 |
| **PR-3b** | 치명형 몹(critPct → 치명저항 PvE) | 고 | 잔여. critResist PvE 미러 + 캡 |
| **PR-4** | 앵커/직업 정체성 + 매뉴얼 | 저 | 지원 직업 spi 강화 + 매뉴얼 |

**PR-3a 구현(2026-06-18)**: Monster `atkType?:"physical"|"magic"` 신설(types.ts·v2 전용 옵셔널). engine.enemyPhase `resolveEnemyPhase`(legacy+ATB 공유)에서 magic 이면 `damageBetween(enemyAtk, player.magicDef)` — 물리 파이프라인(brace/pierce/취약/defDebuff/v2DefMult) 우회, 피격후 일반감산(인내/받피감/가드/철벽)은 적용. 로그 `[마법]` 마커. 태그 4몹(스킬 없는 정령/망령, statusSkill 한기와 무충돌): 얼음 정령·호수 망령·성소 망령·독안개 정령. 🔑 atkType 보존 체인 검증: V2_MONSTERS→scaleMonsterForFloor(spread)→hunt route enemyMonster(`...scaledEnemy`)→state.enemy. **sim(sim-v2-spi-magicmob.ts)**: 저~중심도 물리탱크 ×1.9~2.3(약점)·정신 ×0.3~0.4(카운터)·무투자 ×1.0(중립). ⚠️**고심도(atk≫def) 압축 ×1.1** — damageBetween 의 atk−def 지배로 def/magicDef 차이 묻힘(=기존 def 무용화 이슈, 엔드 슬로빌드 생존과 동일 구조. PR-3a 신규 벽 아님).

## 밸런스 가드
- PR-1 힐 주축 이동 → 솔로 PvE 과회복/장기전 무한버티기 주의(sim). 힐은 협동보스·전쟁·엔드 장기전에서 빛나야지 솔로 사냥 무적화는 금지. 🔑 **PR-4 게이트(Codex 권고)**: `healPowerPct` 패시브를 직업에 달기 전에 **고-SPI 사제 sustain sim** 1회(PR-1 기준 spi 단독 천장 healMult≈1.04로 폭주 없음 확인됨 — gear/패시브 추가 시 재점검). PR-2(spi gear)·PR-4(회복강화 패시브)가 healMult 천장을 올리므로 그때 sim 필수.
- PR-3 마법몹 = 물리→마법 *교체*(총량 중립)라 무빌드 net 중립. 치명몹 + critResist 캡.
- INT(딜) vs SPI(받피·지원) 분업 유지 = spi 가 데미지 늘리지 않게(파워크립 차단).
- 행동불가 디버프 금지 원칙 유지([[feedback-no-action-denial-debuffs]]) — 치명형 몹도 DoT/스탯/확률 방향.

## 관련
[[project-v2-int-magic-axis]](INT 부활 선례·대칭) · [[project-v2-job-system-redesign]](앵커·패시브 패턴) · [[project-v2-combat-atb-redesign]](엔드 슬로빌드 생존=대항축이 일부 완화) · [[project-v2-coop-boss]](지원축 수요처) · docs/v2-combat-redesign.md §4(원 설계).
