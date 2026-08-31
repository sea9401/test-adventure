# 복합 스킬 매뉴얼 감사

이 문서는 캡, 계산식, 피해 종류 예외, 발동 순서, 전투 시작 스냅샷, PvE/PvP 분기가
플레이어의 세팅 판단에 영향을 주는 효과를 추적한다. 수치 변경 문서가 아니라, 실제 데이터와
엔진에서 확인한 규칙을 매뉴얼에 빠뜨리지 않기 위한 점검표다.

| 기믹 | 대표 스킬·효과 | 판단에 중요한 규칙 | 근거 파일 | 매뉴얼 반영 위치 |
| --- | --- | --- | --- | --- |
| 중첩과 상한 | 출혈, 중독, 흉조의 마법 취약, 워메이지 주문 중첩 | 네 계열 모두 최대 10중첩. 같은 시전에서 먼저 부여한 중독도 뒤의 중첩 회수 피해가 읽는다. | `v2CombatConstants.ts`, `combatShared.ts`, `engine.ts`, `engine-pvp.ts` | 스킬과 직업 패시브 → 복합 스킬 효과 읽는 법 |
| 반사와 반격 | 반사 갑주, 가시 갑옷, 수호 반사, 반격의 룬, 무도가 반격 | 직접 공격이 일반 보호막에 전부 막히면 그 피격에 딸린 반사·반격은 발동하지 않는다. 발동한 반사·반격은 별도 적대 피해이며 마나 실드 대상이다. | `engine.enemyPhase.ts`, `engine-pvp.ts`, `engine.pvpPhase.ts`, `shieldReactionGate.test.ts` | 전투 → 반사 피해, 스킬과 직업 패시브 → 반사와 반격 |
| 전투당 1회 생존 | 불굴, 사망 극복 계열 | 치명 피해를 버티는 효과는 전투 상태의 사용 플래그를 남겨 같은 전투에서 반복 발동하지 않는다. | `engineState.ts`, `engine.enemyPhase.ts`, `engine-pvp.ts`, `engine.pvpPhase.ts` | 스킬과 직업 패시브 → 전투당 1회 생존 |
| HP 비용과 자해 | 사혈격 계열 `hpCostDamage`, 광전사 자해 | 현재 HP를 공격 자원으로 쓰는 비용은 보호막·마나 실드 대상이 아니다. 적중 대상 효과가 완전 회피되면 HP 비용도 취소되고, 실제 비용은 시전자를 HP 1 아래로 내리지 않는다. | `v2SkillsCommonCatalog.ts`, `combatShared.ts`, `engine.ts`, `engine-pvp.ts` | 스킬과 직업 패시브 → HP 비용과 보호막 우회 |
| 처형·고정·우회 피해 | 처단·암살의 `executeDamage`, 고정 추가 피해, 명시적 보호막 무시 | 마나 실드 대상에서 제외되며 기존 피해 분류와 적용 순서를 유지한다. | `v2SkillsCommonCatalog.ts`, `combatShared.ts`, `engine.pvpPhase.ts`, `engine-pvp.ts` | 전투 → 마나 실드, 스킬과 직업 패시브 → HP 비용과 보호막 우회 |
| 전투 시작 스냅샷 | 마나 실드 | INT·최대 MP에서 최대 내구도, 흡수율, 내구도 경감률을 전투 시작에 한 번 정한다. 현재 MP를 쓰거나 전투 중 재계산·회복하지 않는다. | `v2CombatConstants.ts`, `derivePlayerCombatV2.ts`, `engine.ts`, `engine-pvp.ts` | 전투 → 데미지와 방어, 스탯 → 6대 스탯 |
| PvE/PvP 분기 | 마나 실드, 회피 대결 | 마나 실드는 사냥 45%/30%, PvP 30%/20%의 흡수·경감 점근 상한을 사용한다. 회피 대항 계수도 사냥 2.5, PvP 3으로 다르다. | `v2CombatConstants.ts`, `CombatMatchupSummary.tsx` | 전투 → 마나 실드·회피와 명중, 스킬과 직업 패시브 → PvE·PvP 차이 |

새 복합 효과를 추가하거나 위 규칙을 바꿀 때는 데이터/엔진 테스트와 함께 이 표와 인게임
안내서를 갱신한다. 툴팁에는 핵심 정체성을 짧게 적고, 공식·순서·예외는 안내서에 모두 남긴다.
