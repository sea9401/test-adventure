# v2 시스템 슬림화 감사

이 문서는 v2 아이템·스킬 설계의 1차 결정(하이브리드 마법, INT 6스탯, 영웅 전투 중심, 강화/enchant/rune/set/paragon 폐기)을 라이브 코드 구조에 대조한 슬림화 감사다. 목적은 무엇을 살리고 줄이고 버릴지 먼저 고정해, 이후 PR이 라이브 솔로 그라인드 복제를 반복하지 않게 하는 것이다.

| 카테고리 | 라이브 현황 (간단) | v2 결정 | 비고/이유 | 영향받는 코드 |
|---|---|---|---|---|
| 스탯 시스템 (5종 → 6종) | str/dex/vit/spd/luk 5종이 전투·UI·단련에 고정 | 신규 | INT와 MP가 마법 액티브의 주축이므로 전 스탯 루프를 6종으로 확장한다. | src/adventure/data/stats.ts, src/adventure/character/derivePlayerCombat.ts, src/lib/server/derivePlayerCombatFromSaves.ts |
| 장비 — 무기/방어구/장신구 | 라이브 3슬롯 장비와 v2 7종 placeholder가 공존 | 슬림화 | 슬롯 구조는 유지하되 v2 장비는 단순 등급·스탯 보너스 중심으로 축소한다. | src/adventure/data/items/types.ts, src/adventure/data/v2/v2Equipment.ts, src/adventure/v2/V2EquipmentView.tsx |
| 장비 강화 (별빛 강화) | 인스턴스 장비에 0~7 강화와 서버 API가 존재 | 버림 | 강화는 잠금 결정상 폐기라 v2 장비 성장축에서 제외한다. | src/adventure/character/enhancement.ts, src/adventure/character/EnhancementPanel.tsx, src/app/api/enhance/route.ts |
| 마법부여 (enchant) | 장비 슬롯 효과가 전투 엔진과 서버 API에 깊게 연결 | 버림 | v2 마법은 enchant가 아니라 액티브 단발 마법과 길드 주문서로 분리한다. | src/adventure/character/enchant.ts, src/adventure/character/EnchantDialog.tsx, src/app/api/enchant/route.ts |
| 룬 (3슬롯) | 3룬 슬롯과 융합·보너스·탑 드롭이 존재 | 버림 | 3명 토너먼트 관리 부담을 키우므로 v2 전투 derive에서 제거한다. | src/adventure/data/runes.ts, src/adventure/character/runeBonus.ts, src/adventure/RuneView.tsx |
| set 효과 | 장비·파생 전투에 세트성 보너스가 일부 얽힘 | 버림 | 세트 맞춤은 v2의 짧은 영웅 전투와 공용 자원 결에 맞지 않는다. | src/adventure/character/derivePlayerCombat.ts, src/adventure/character/rehydrateEquip.ts, src/adventure/data/items/index.ts |
| AP 스킬 25종 | 라이브 AP 스킬 풀이 PvE/PvP 엔진에 그대로 탑재 | 슬림화 | 단판 발동 가치가 있는 일부만 남기거나 마법 액티브로 대체한다. | src/adventure/character/apSkills.ts, src/adventure/character/APSkillConditionModal.tsx, src/adventure/battle/engine.ts |
| 일반 스킬 (Lv65/Lv90 슬롯) | 일반 스킬 장착 슬롯이 레벨 플래그로 확장 | 슬림화 | 누적·장기 사냥형 효과는 줄이고 일기토용 즉시 효과 위주로 재검토한다. | src/adventure/character/skills.ts, src/adventure/character/SkillsView.tsx, src/adventure/v2/V2SkillsView.tsx |
| 스탯별 6티어 특기 | 5스탯별 6티어 특기가 전투 엔진 테스트까지 존재 | 슬림화 | INT 추가 후 6스탯 체계로 재배치하되 티어 과밀은 줄인다. | src/adventure/character/skills.ts, src/adventure/battle/engine.tier6.test.ts, src/adventure/character/derivePlayerCombat.ts |
| 만렙 100 + EXP 곡선 | Lv100과 EXP 곡선은 라이브 진행의 기본값 | 살림 | v2도 1~100 성장과 5층 던전 흐름을 쓰므로 유지한다. | src/lib/leveling.ts, src/adventure/character/useLevelUpDetection.ts, src/adventure/data/v2/dungeon.ts |
| 단련 포인트 (training.v2) | v2 저장 키와 성장의 신전 UI·API가 분리됨 | 살림 | INT 재임 부담은 있지만 v2 키스페이스라 비파괴 확장이 가능하다. | src/lib/storage-keys.ts, src/adventure/v2/V2GrowthShrineView.tsx, src/app/api/v2/me/training/route.ts |
| 파라곤 (paragon.v1) | 서버 derive가 paragon.v1을 읽어 전투에 반영 | 버림 | 만렙 후 솔로 그라인드 축이라 v2 영웅·길드 구조와 충돌한다. | src/lib/paragon.ts, src/adventure/character/ParagonView.tsx, src/app/api/admin/paragon-tuning/route.ts |
| 골드·재료 시스템 | 라이브 골드·재료·제작과 v2 stone/soldiers가 분리 | 슬림화 | v2는 stone/soldiers/scrolls 공용 풀 중심으로 재정렬한다. | src/adventure/data/materials.ts, src/adventure/data/v2/resources.ts, src/lib/server/v2GuildResources.ts |
| PvE 도전 (던전·탑·솔로 보스·PvP 아레나) | 라이브 탑·보스·아레나와 v2 던전이 병존 | 슬림화 | v2의 PvE는 5층 던전 중심으로 두고 라이브 도전군은 직접 이식하지 않는다. | src/adventure/data/v2/dungeon.ts, src/adventure/tower/TowerPage.tsx, src/adventure/pvp/ArenaView.tsx |
| autoHunt 시스템 | 라이브 자동사냥과 서버 hunt API가 연속 전투를 처리 | 버림 | 액티브 마법과 단판 영웅 전투 중심이라 자동 AI 전제는 v2에서 배제한다. | src/adventure/battle/autoHunt.ts, src/lib/server/autoHunt.ts, src/app/api/hunt/dispatch/route.ts |
| 전투 엔진 (resolveBattle/resolveBattlePvP) | 라이브 PvE/PvP 엔진을 v2 일기토·토너먼트가 재사용 | 슬림화 | 엔진 골격은 쓰되 v2 derive와 마법/INT 분기로 라이브 효과를 차단한다. | src/adventure/battle/engine.ts, src/adventure/battle/engine-pvp.ts, src/lib/server/v2RunTournament.ts |

다음 단계는 v2 전용 `derivePlayerCombatV2`를 먼저 만들어 라이브 rune/enchant/paragon 경로를 끊는 것이다. 그 뒤 INT/MP와 액티브 마법, guild scrolls, 거점 점령의 영웅 결과 반영을 작은 PR로 순차 적용하는 편이 회귀를 가장 잘 통제한다.
