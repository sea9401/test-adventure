# 대지 마법사 5·6차 전투 비교

2026-09-12 구현 검증. 게임 서버·DB 없이 실제 ATB PvE/PvP 엔진을 실행했다.

## 조건

- 100레벨, 동일 성장치(힘 100·체력 250·민첩 100·행운 0·지능 500·정신 400), 무장비. 계보별 직업 보너스는 제외해 스킬 구성만 비교.
- 모든 구성은 정확히 30 SP. 장착 패시브의 능력치·방어·마나 실드·빙결·연소 효과는 실제 파생 함수에 반영.
- 대지는 보호막이 없으면 생성기를 우선하고, 나머지는 공격 우선순위로 시전. 최적 빌드를 전수 탐색한 비교는 아니다.
- 일반·강한 단타·고속·3연타·고방어·장기전 6종 × 구성 7종 × 50시드 = PvE 2,100회. 대지 6차와 다른 구성 6종 × 50시드 = PvP 300회. PvP는 양측 자리를 번갈아 배치.
- 패턴 발동 확률 적용 true/false를 각각 실행해 총 4,800회. 실제 운영 환경 설정을 조회하거나 변경하지 않았다.
- PvE는 60행동 제한과 기존 3,000틱 제한을 모두 유지한다. 장기전은 처치보다 제한 내 피해·생존·MP를 관찰하는 의도적인 실패 시나리오다.
- 피해·잔여 HP/MP는 최종 상태, 행동 수와 보호막 유지율은 행동 틱 로그에서 집계. 보호막 생성·흡수 로그의 최종 잔량이 실제 상태와 같은지도 실행 중 검증한다.

## 구성

| 구성 | 스킬 ID |
| --- | --- |
| earth4 | `v2c_earthmage_tectonic`, `v2c_earthmage_bedrock`, `v2c_mage_shield`, `v2c_magus_acumen3`, `v2c_caster_acumen`, `v2c_mage_acumen`, `v2c_boxer_fortitude`, `v2c_martial_fortitude` |
| earth5 | `v2c_geomancer_upheaval`, `v2c_earthmage_tectonic`, `v2c_geomancer_heart`, `v2c_geomancer_barrier`, `v2c_mage_acumen` |
| earth6 | `v2c_tectomancer_cataclysm`, `v2c_geomancer_upheaval`, `v2c_tectomancer_ground`, `v2c_geomancer_barrier`, `v2c_mutant_adaptation` |
| fire5 | `v2c_pyromancer_brand`, `v2c_pyromancer_spirit`, `v2c_pyromancer_burn`, `v2c_magus_acumen3`, `v2c_mage_acumen` |
| fire6 | `v2c_infernomancer_collapse`, `v2c_pyromancer_brand`, `v2c_infernomancer_burn` |
| frost5 | `v2c_cryomancer_absolutezero`, `v2c_frostmage_glacier`, `v2c_cryomancer_freezingpoint`, `v2c_frostmage_frozenheart`, `v2c_caster_acumen`, `v2c_mage_acumen` |
| frost6 | `v2c_frostsovereign_eternalprison`, `v2c_cryomancer_absolutezero`, `v2c_frostsovereign_permafrost`, `v2c_magus_acumen3` |

## 발동 확률 적용 결과

| 적 | 구성 | 승률 % | 평균 피해 | 플레이어 행동 | 적 행동 | 잔여 HP % | 잔여 MP | 보호막 유지 % | 최대 보호막 | MP 부족 경험 % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ordinary | earth4 | 18 | 12505.72 | 27.86 | 89.06 | 24.41 | 97.72 | 60.23 | 653 | 94 |
| ordinary | earth5 | 62 | 13896.96 | 20.52 | 63.62 | 48.68 | 118.5 | 60.33 | 709 | 82 |
| ordinary | earth6 | 100 | 14000 | 10.52 | 31.38 | 76.97 | 543.4 | 56.08 | 634 | 0 |
| ordinary | fire5 | 80 | 13630.12 | 7.78 | 22.82 | 28.36 | 1462.5 | 0 | 0 | 0 |
| ordinary | fire6 | 98 | 13927.32 | 7.22 | 20.64 | 35.16 | 642.4 | 0 | 0 | 0 |
| ordinary | frost5 | 60 | 13382.2 | 11.3 | 33.52 | 10.65 | 1669 | 0 | 0 | 0 |
| ordinary | frost6 | 70 | 13329.12 | 10.02 | 28.26 | 11.31 | 743.76 | 0 | 0 | 0 |
| heavy | earth4 | 0 | 5024.62 | 17.3 | 42.14 | 0 | 163.3 | 38.61 | 557 | 78 |
| heavy | earth5 | 52 | 12121.96 | 11.32 | 25.64 | 11.59 | 569 | 40.99 | 709 | 2 |
| heavy | earth6 | 40 | 10924.98 | 8.12 | 18.8 | 8.74 | 699.2 | 37.44 | 634 | 0 |
| heavy | fire5 | 2 | 8883.3 | 4 | 9.94 | 0.58 | 1710 | 0 | 0 | 0 |
| heavy | fire6 | 2 | 9572.5 | 4 | 9.94 | 0.58 | 926.9 | 0 | 0 | 0 |
| heavy | frost5 | 0 | 6351.92 | 5 | 10 | 0 | 1915 | 0 | 0 | 0 |
| heavy | frost6 | 0 | 7297.74 | 5 | 10 | 0 | 1265.92 | 0 | 0 | 0 |
| fast | earth4 | 0 | 7233.56 | 21.64 | 102.22 | 0 | 59.16 | 46.3 | 557 | 100 |
| fast | earth5 | 80 | 13467.48 | 12.84 | 57.68 | 36.46 | 396 | 43.77 | 709 | 8 |
| fast | earth6 | 74 | 12980.04 | 9.8 | 43.46 | 26.54 | 555.8 | 35.51 | 634 | 0 |
| fast | fire5 | 28 | 11601.82 | 5.9 | 24.22 | 2.33 | 1582.5 | 0 | 0 | 0 |
| fast | fire6 | 36 | 12270.08 | 5.82 | 23.74 | 4.05 | 768.6 | 0 | 0 | 0 |
| fast | frost5 | 0 | 7879.98 | 6.3 | 29 | 0 | 1873 | 0 | 0 | 0 |
| fast | frost6 | 0 | 8657.52 | 6 | 25 | 0 | 1148.8 | 0 | 0 | 0 |
| multihit | earth4 | 0 | 0 | 7 | 28 | 0 | 1078 | 0 | 557 | 0 |
| multihit | earth5 | 0 | 7593.16 | 4.96 | 18.76 | 0 | 1118 | 0 | 709 | 0 |
| multihit | earth6 | 0 | 5556.84 | 3.86 | 14.64 | 0 | 979 | 0 | 634 | 0 |
| multihit | fire5 | 0 | 6530.7 | 3 | 9 | 0 | 1795 | 0 | 0 | 0 |
| multihit | fire6 | 0 | 6976.74 | 3 | 9 | 0 | 1050.6 | 0 | 0 | 0 |
| multihit | frost5 | 0 | 3776.52 | 3 | 10 | 0 | 2002 | 0 | 0 | 0 |
| multihit | frost6 | 0 | 4175.1 | 3 | 9 | 0 | 1509.92 | 0 | 0 | 0 |
| armored | earth4 | 0 | 1485.48 | 25.48 | 82.9 | 0 | 40.18 | 54.08 | 557 | 100 |
| armored | earth5 | 0 | 4024.02 | 23.26 | 74.2 | 0 | 47 | 49.1 | 709 | 98 |
| armored | earth6 | 0 | 7518.78 | 16.56 | 52.96 | 0 | 181.2 | 51.69 | 634 | 56 |
| armored | fire5 | 0 | 7527.88 | 7 | 23 | 0 | 1515 | 0 | 0 | 0 |
| armored | fire6 | 0 | 7488.06 | 7 | 23 | 0 | 656.4 | 0 | 0 | 0 |
| armored | frost5 | 0 | 1499.38 | 9 | 27 | 0 | 1750 | 0 | 0 | 0 |
| armored | frost6 | 0 | 1412.5 | 7.98 | 23 | 0 | 953.6 | 0 | 0 | 0 |
| endurance | earth4 | 0 | 16118.9 | 32 | 102.06 | 99.92 | 73.76 | 96.75 | 1649 | 98 |
| endurance | earth5 | 0 | 13187.2 | 32 | 103 | 95.35 | 60 | 93.75 | 1719 | 100 |
| endurance | earth6 | 0 | 29672.66 | 32 | 105 | 54.88 | 17.8 | 58.94 | 634 | 100 |
| endurance | fire5 | 0 | 43780.78 | 25 | 82 | 0 | 387.5 | 0 | 0 | 22 |
| endurance | fire6 | 0 | 27527.64 | 25 | 82 | 0 | 36.4 | 0 | 0 | 100 |
| endurance | frost5 | 0 | 37386.04 | 30 | 96 | 0 | 877 | 0 | 0 | 0 |
| endurance | frost6 | 0 | 31329.56 | 26.08 | 82 | 0 | 16.64 | 0 | 0 | 0 |

## PvP 대지 6차 승률

| 상대 | 확률 적용 % | 확률 미적용 % |
| --- | ---: | ---: |
| earth4 | 84 | 100 |
| earth5 | 42 | 0 |
| fire5 | 40 | 0 |
| fire6 | 34 | 100 |
| frost5 | 56 | 100 |
| frost6 | 66 | 0 |

## 해석과 한계

- 확률 적용 일반 적: 대지 6차는 승률 100%, 평균 10.52행동, 잔여 HP 76.97%. 화염 6차는 승률 98%, 7.22행동, 잔여 HP 35.16%. 대지는 생존을, 화염은 빠른 처치를 보상하는 차이를 보였다.
- 대지 6차의 보호막 유지율은 일반 적 56.08%지만 3연타 적에서는 0%였다. 3연타 적에게는 매번 다음 공격 전에 보호막이 소진되어 조건부 공격 이점을 얻지 못한다.
- 대지 6차는 고방어 적에게 화염 6차와 유사한 누적 피해를 냈지만 더 오래 싸웠다. 장기전 누적 피해는 냉기 6차보다 낮았다. 모든 적에서 공격·생존을 함께 앞서는 결과는 아니므로 제안 효과량을 유지한다.
- PvP에서는 확률 적용 시 대지 6차가 화염 6차에 34%, 냉기 6차에 66% 승리했다. 확률 미적용은 우선순위와 확정 시전의 영향으로 결과가 크게 갈린다. 이 결과를 전체 환경의 승률이나 메타 균형으로 일반화하지 않는다.
- 장비·다른 성장 분포·피해 및 회복 보정이 있는 별도 PvP 표면·사용자별 패턴은 더 다양한 조합을 만든다. 보호막 1만 남겨도 동일 공격 보너스라는 조건은 별도 회귀 테스트로 확인했다.

## 재현

```bash
NEXT_PUBLIC_V2_CORE_LOOP_V2=true NEXT_PUBLIC_V2_SKILL_PROC_IN_PATTERN=true NODE_PATH=./scripts/server-only-stub node --import tsx scripts/sim-earth-mage-advancement.ts
NEXT_PUBLIC_V2_CORE_LOOP_V2=true NEXT_PUBLIC_V2_SKILL_PROC_IN_PATTERN=false NODE_PATH=./scripts/server-only-stub node --import tsx scripts/sim-earth-mage-advancement.ts
```
