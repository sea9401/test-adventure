# v2 회피 재설계 — 절대 %캡 → 명중 대결형 레이팅 (설계 + sim 검증)

2026-06-21 오너 세션. 선행 = [project-v2-dex-dominance-diagnosis] 메모리 + DEX 재밸런스 PR-1/2(머지).
프로토타입 sim: `scripts/sim-v2-evasion-rating.ts` (`node --import tsx ...`).

## 0. 문제 — "플랫 %를 옵션으로 부여" 모델은 튜닝이 어렵다
현재 회피 = `dex×0.1 + luk×0.08 + 장비/세트 eva + 패시브 eva` **합연산 → 75% 하드캡**. 몹 명중은
캡 **뒤** 뺄셈(`유효회피 = min(eva,75) − 적명중`). 네 가지 구조적 문제:

1. **이진 캡** — 75% 미만은 선형, 75%에서 벽. 부드러운 고점 조절 구간 없음(DEX/LUK은 d14쯤 포화).
2. **콘텐츠 미추종** — "절대 75% 회피"라 Lv1 몹에게도 Lv100 몹에게도 동일. 깊이별로 몹 명중을 **수동**으로
   깎아 넣어야 균형(현 방식).
3. **회피 = EHP 배수** — 75% 회피 = 유효 체력 **×4**(1/(1−0.75)). 한 옵션에서 큰 생존 배수가 나와 거칠다.
4. **DEX 더블딥** — DEX가 공격(템포)+방어(회피 4× EHP)를 한 스탯에서 공짜로. DEX 독주의 절반.

## 1. 제안 — 명중 대결형(contested rating)
회피·명중을 **raw 레이팅**(현 계수 그대로, 캡 제거)으로 키우고 **비율로 대결**:

```
회피확률 = MAX_DODGE × evaRating / (evaRating + 상대명중레이팅 × K)
evaRating = dex×0.1 + luk×0.08 + 장비/세트/패시브 eva   (현 계수 = 레이팅 점수)
accRating = dex×0.05 + str×0.02 + int×0.02 + spi×0.015 + 장비/패시브 acc
```
- **양방향 대칭**: 몹→플레이어 = `dodge(플레이어 evaR, 몹 accR)`, 플레이어→몹 = `dodge(몹 evaR, 플레이어 accR)`(현 missPct 경로), PvP 동일.
- **몹 명중레이팅 = ACC_BASE × floorStatMult(depth)** — 깊이 따라 자동 스케일(몹마다 수동 부여 불필요).
- **회피 무시(apIgnoresEvasion 등)**: 굴림 자체 스킵 — 그대로 보존.

### 다이얼 (sim 캘리브)
| 다이얼 | 값 | 의미 |
|---|---|---|
| `MAX_DODGE` | 75 | 점근 천장(절대 도달X = 항상 ≥25% 피격) |
| `K` | 4 | 기본 회피 높낮이(클수록 명중이 회피를 더 누름) |
| `ACC_BASE` | 1.05 | 몹 명중 = ACC_BASE × floorStatMult(depth) |

## 2. sim 검증 결과 (권장레벨 회피% — 현 모델 → 대결형)
| 깊이 | DEX | LUK | BAL | STR/VIT |
|---|---|---|---|---|
| 8 | 23→**53** | 22→52 | 11→39 | 5→24 |
| 20 | **75(캡)**→**50** | 75→49 | 30→34 | 9→16 |
| 50 | **75(캡)**→**47** | 75→46 | 67→30 | 19→12 |

- ✅ **포화 해소**: DEX가 캡(75)에 영구 안착하던 게 전 깊이 **~50% 안정**.
- ✅ **콘텐츠 자동 추종**: 몹 명중이 floorStatMult로 커져 회피%가 깊이 무관 일정(수동 튜닝 0).
- ✅ **차별화 회복**: DEX/LUK ~50·BAL ~32·STR/VIT ~12 (현 모델은 d20+ 전부 75 포화).
- ✅ **DEX 더블딥 반감**: 회피 75→50% = **EHP ×4 → ×2**. DEX 정체성(제일 회피 높음)은 유지하되 공짜
  탱킹 절반. (템포는 별개 — DEX 독주는 [project-v2-dex-dominance-diagnosis] 약축 부양으로 대응 중.)

## 3. 범위 — 회피↔명중 **두 수치만** (다른 축 불변)
대결형은 "공격자 명중 vs 방어자 회피 굴림" 형태에만 맞다. 다른 %축은 각자 모델 유지:
| 메커닉 | 모델 | |
|---|---|---|
| **회피 ↔ 명중** | **대결형 레이팅** | 신규(이 문서) |
| 치명확률↔저항 | 확률캡+초과분→크리뎀 | 불변 |
| 치명배수 | 점감 곡선 | DEX 재밸런스 PR-2 |
| def | 데미지식 댐핑 | 불변 |
| 회복%/흡혈/statPct | 합연산+캡(또는 secondary safety) | 불변 |

## 4. 구현 변경 (다음 PR — 미착수)
1. **derive**: `evasionPct`/`accuracyPct` 의 `min(.,캡)` 제거 → **레이팅(raw)** 으로 노출(`evaRating`/`accRating`).
   계수 불변. `EVASION_PCT_CAP`/`ACCURACY_PCT_CAP` 폐기.
2. **engine.enemyPhase**: `min(eva,75) − 몹명중` → `dodgeContest(evaR, 몹accR)`. 몹 accR = `floorAccuracy(depth)`.
3. **engine.playerPhase**: missPct → `1 − dodgeContest(몹 evaR, 플레이어 accR)`(대칭). 몹 evaR = 몹 기본(대부분 0~소).
4. **monster**: `floorAccuracy(depth) = ACC_BASE × floorStatMult(depth)` 신설(dungeonLadder). 몹 evaRating은 기존 eva 재해석.
5. **PvP**: engine.pvpPhase 대칭 적용.
6. **golden 스냅샷 재생성** + **sim 전 구간(d8~50) 재캘리브**(MAX_DODGE/K/ACC_BASE + 회피무시 보존 확인).

### 위험 / 주의
- **중간 규모**(크리 곡선 PR 정도): 엔진 dodge 양방향 + 몹 데이터 + PvP + 골든 + 매뉴얼.
- **장비/세트 eva 옵션**: 레이팅으로 그대로 합산(캡 없어짐). 흔한 장비 eva 수치가 레이팅 기준 과하지 않은지 sim 확인.
- **명중 캡 35 제거**: 명중도 대칭 레이팅화. 명중 죽은축([project-v2-accuracy-rework])과 정합성 재확인.
- **회피무시 바이패스**(apIgnoresEvasion) 보존 — 굴림 스킵 경로 유지.

## 5. 잔여 튜닝
- DEX ~50%가 높으면 `K`↑(예 6 → 파리티 회피↓) 또는 `ACC_BASE`↑. 목표 EHP 배수로 역산.
- 라이브 win-rate 영향은 엔진 배선 후 sim-v2-progression 으로 실측(이 문서는 회피% 프로파일까지).
