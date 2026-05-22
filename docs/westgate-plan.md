# 서편 옛길 — 서편 옛길 · 마른나루 · 옛 변경 성채 (설계)

> 상태: ✅ **구현 완료** — 서편 옛길(마른나루·옛 변경 성채) 출고. 이 문서는 설계 기록.

> 시작 마을(Lv1)에서 **서쪽**으로 갈라지는 막다른 3지역 라인 — 동쪽 모험길의 반대편. 동쪽이 평야·동굴·숲·호수·폐허·산정·화염·하늘로 뻗고, 디올라에서 남쪽으로 해안 지선이 나갔다면, 이쪽은 시작 마을 서문 밖, 아무도 다니지 않는 옛 변경길. 고대·마법의 `옛 폐허`와 달리 — "한 세대 전 전쟁의 잔해": 인간 노상강도·탈영병 + 녹슨 전쟁기계(자동인형) + 까마귀. 막다른 지선이라 진행 순서를 흩뜨린다. (해안 지선의 자매편 — `docs/coast-plan.md`.)

## 지역

| RegionId | 이름 | reqLv | biome | position | 비고 |
| --- | --- | --- | --- | --- | --- |
| `westgate` | 서편 옛길 | 3 | `plains` | (55, 480) | 시작 마을 서문 밖, 억새에 묻힌 옛 수레길. 동굴(Lv3) ≈ 난이도 |
| `dustford` | 마른나루 | 7 | `village` | (130, 580) | 강이 말라붙은 자리의 옛 역참 마을. 떠나길 거부한 몇 집 |
| `oldwall_keep` | 옛 변경 성채 | 13 | `ruins` | (40, 660) | 옛길 끝, 무너진 변경 요새. 폐허~산기슭 사이(Lv13). 보스 "옛 성문지기" |

- viewBox `height` 640→700 (시작 마을 좌하단 빈 공간 활용).
- 엣지: `village→westgate`(시련 5전) · `westgate→dustford`(무조건) · `dustford→oldwall_keep`(story `oldwall_keep_unsealed`).
- 마른나루 fast-travel(`visited`) — 시작 마을·디올라·소만·운향·바람골·천공 성지와 6쌍.

## 몬스터

옛길 ≈ 동굴(Lv3) tier, 옛 변경 성채 ≈ 폐허(Lv9)~산기슭(Lv18) 사이(Lv13) tier. image 필드는 후속 PR(webp 추가).

| 이름 | 지역 | hp/atk/def/spd | exp | 특이 | 드랍 |
| --- | --- | --- | --- | --- | --- |
| 들까마귀 떼 | westgate | 45/5/1/8 | 4 | 회피 15% | 까마귀 깃 6% / `crow_feather_cap` 제작서 4% / **유실된 명품 `crows_hoard_charm` 0.02%** |
| 갈대 살쾡이 | westgate | 60/6/2/6 | 5 | — | 들고양이 송곳니(`wilddog_fang`) 3% / 까마귀 깃 2% |
| 노상강도 | westgate | 75/7/3/5 | 6 | — | 들고양이 송곳니 3% / `roadbandit_shortsword` 제작서 4% |
| 폐성벽 까마귀 | oldwall_keep | 130/15/4/8 | 13 | 회피 20% | 까마귀 깃 5% / `tattered_standard_cloak` 직조서 4% / `frontier_standard_cloak` 직조서 1.5% |
| 탈영 약탈자 | oldwall_keep | 180/16/7/6 | 15 | `heavy_blow` 투창(3페이즈마다 ×1.8) | 옛 군기 조각 5% / 녹슨 쇳조각 2% / `garrison_hauberk` 제작서 4% / `roadbandit_falchion` 제작서 2% |
| 녹슨 자동인형 | oldwall_keep | 230/14/11/2 | 16 | `brace` 녹슨 장갑판(피해 -4) | 녹슨 쇳조각 5% / `geared_warpick` 단조서 4% / `reinforced_garrison_hauberk` 제작서 2% / `crows_hoard_engraving` 새김서 0.3% |
| **옛 성문지기** (보스) | oldwall_keep | 650/25/16/3 | 85 | `heavy_blow` 성문 빗장 휘두르기(3페이즈마다 ×1.8) · phaseTrigger HP 30%↓ → DEF +5 · `dropQualityBias` 3 · `onDefeatFlag: gatekeeper_felled` | 녹슨 쇳조각 ×4 / 옛 군기 조각 ×3 / `recipe_one_of` 수비대 무구 4종 100% / `gatekeeper_core` 세공서 15% / `crows_hoard_engraving` 새김서 5% |

- `oldwall_keep.boss = { monsterName: "옛 성문지기", dailyEntryLimit: 3 }` — 별도 도전 버튼, 자정 기준 일일 3회.

## 재료

`raven_feather` 까마귀 깃(3G, 옛길+성채 까마귀) · `scrap_iron` 녹슨 쇳조각(8G) · `war_banner_scrap` 옛 군기 조각(12G). 노상강도/들고양이 무기 재료로 기존 `wilddog_fang`(들개 송곳니) 재사용. (sellPrices.ts 등록)

## 장비

마정석 라인(광맥의 수호자)과 운봉 라인 사이. 모두 제작 품질 변동 굴림.

- **옛길 입문 2종**(uncommon): `crow_feather_cap` 까마귀깃 두건(def+1,spd+2 — 까마귀 깃) · `roadbandit_shortsword` 노상강도의 단검(atk+3,dex+1 — 들개 송곳니+까마귀 깃).
- **옛 변경 성채 잡몹산 3종**(uncommon): `garrison_hauberk` 수비대 사슬갑옷(def+4,vit+1 — 녹슨 쇳조각) · `geared_warpick` 톱니 전곡괭이(atk+5,str+2 — 녹슨 쇳조각) · `tattered_standard_cloak` 낡은 군기 망토(def+3,spd+2,luk+1 — 옛 군기 조각).
- **업그레이드 3종**(베이스 + 재료 소비): `roadbandit_falchion` 노상강도의 활검(atk+5,dex+3) · `reinforced_garrison_hauberk` 보강한 수비대 사슬갑옷(def+6,vit+2,spd-1) · `frontier_standard_cloak` 변경 군기 망토(def+5,spd+3,luk+2).
- **옛 성문지기 보스 보상**: 수비대 무구 4종(weapon, atk+6 공통 + 보조 +4 — `garrison_blade` 힘 / `garrison_bulwark` 활력 / `garrison_glaive` 민첩 / `garrison_cudgel` 행운, `recipe_one_of`) + `gatekeeper_core` 성문지기의 핵(accessory, vit+4·str+2 — 보스 15% / `dustford-mujin-gatekeeper` 의뢰 확정).
- **유실된 명품**: `crows_hoard_charm` 까마귀 둥지의 부적(accessory, luk+3·spd+2 — 들까마귀 떼 0.02%) → 업그레이드 `corvid_fortune_charm` 까마귀 보물의 부적(luk+5·spd+3·dex+1, unique·비거래 — 새김서 `crows_hoard_engraving`: 녹슨 자동인형 0.3% / 옛 성문지기 5%).

## NPC (마른나루) · 다이얼로그

| NpcId | 이름 | role | 다이얼로그 | 역할 |
| --- | --- | --- | --- | --- |
| `dustford_keeper` | 옛 수비대장 무진 | elder | `MujinDialogue`(커스텀) | 메인 라인 축. 옛길 의뢰 → 보증(`dustford_vouched`) → 옛길 정리(`oldwall_keep_unsealed`, 무너진 북쪽 벽) → 성채 정찰 → 옛 성문지기 처치 → 정기 토벌 |
| `dustford_scavenger` | 고물장수 두루 | vendor | `DuruDialogue`(`questLineDialogue`) | 옛길 인트로(들개 송곳니·노상강도 단검 제작서) + 녹슨 쇳조각 deliver(옛길 정리 후) |
| `dustford_innkeeper` | 역참 주인 나래 | innkeeper | `NaraeDialogue`(`questLineDialogue`) | 까마귀 깃 deliver(회복약) → 겨우살이(약 주머니 +1) → 탈영 약탈자 정리(옛길 정리 후) |
| `dustford_hunter` | 들사냥꾼 솔개 | quest | `SolgaeDialogue`(`questLineDialogue`) | 갈대 살쾡이/들까마귀 떼(까마귀깃 두건 제작서) + 폐성벽 까마귀(옛길 정리 후) |
| `dustford_kid` | 역참 아이 보리 | lore | `BoriDialogue`(커스텀, 의뢰 X) | "성문이 밤마다 쿵쿵거린다" 떡밥 — `oldwall_keep_unsealed`/`gatekeeper_felled` 로 대사 분기 |

## storyFlag 흐름

1. `village→westgate` 시련 5전 → 옛길. `westgate→dustford` 무조건.
2. 마른나루에서 두루 인트로(`dustford-duru-fangs`) + 나래 인트로(`dustford-narae-feathers`)를 한 번씩 완료 → 무진이 보증: **`dustford_vouched`**.
3. 무진 옛길 정리 의뢰(`dustford-mujin-clear-road`, 노상강도 ×15 kill) → 완료 시 **`oldwall_keep_unsealed`** ON (= `dustford→oldwall_keep` 게이트, 무너진 북쪽 벽으로 가는 길). 성채 적 대상 의뢰 전부 이 의뢰 완료를 `requiresQuestCompleted` 로 둠.
4. 무진 성채 정찰(`dustford-mujin-keep-survey`, 녹슨 쇳조각 ×10 deliver) → 옛 성문지기 처치(`dustford-mujin-gatekeeper`, kill ×1 — 보상에 `gatekeeper_core` 제작서).
5. 옛 성문지기 처치 → 보스 `onDefeatFlag: gatekeeper_felled`. 정기 토벌(`dustford-gatekeeper-recurring`, kill ×3 반복) 해금. 무진/보리 대사 갱신.

`STORY_QUESTS.dustford_gatekeeper` — "옛 성문지기" 항목.

## 퀘스트 (quests.ts)

- 두루(`dustford_scavenger`): `-duru-fangs`(들개 송곳니 ×10 deliver, 반복, 제작서 `roadbandit_shortsword`) · `-duru-feathers`(까마귀 깃 ×12 deliver, 반복) · `-duru-scrap`(녹슨 쇳조각 ×8 deliver, 반복, ※clear-road 선행).
- 나래(`dustford_innkeeper`): `-narae-feathers`(까마귀 깃 ×10 deliver, 반복, 회복약) · `-narae-larder`(까마귀 깃 ×15 deliver, 1회, potionCapacityBonus +1) · `-narae-keep-stew`(탈영 약탈자 ×15 kill, 반복, ※clear-road 선행).
- 솔개(`dustford_hunter`): `-solgae-wildcats`(갈대 살쾡이 ×18 kill, 반복, 제작서 `crow_feather_cap`) · `-solgae-ravens`(들까마귀 떼 ×18 kill, 반복) · `-solgae-wall-ravens`(폐성벽 까마귀 ×15 kill, 반복, ※clear-road 선행).
- 무진(`dustford_keeper`): `-mujin-clear-road`(노상강도 ×15 kill, 1회 — 완료 시 `oldwall_keep_unsealed` ON) · `-mujin-keep-survey`(녹슨 쇳조각 ×10 deliver, 1회, ※clear-road 선행) · `-mujin-gatekeeper`(옛 성문지기 ×1 kill, 1회 — 보상 골드 700·명성 22·EXP 1000·작은 회복약 ×8·제작서 `gatekeeper_core`, ※keep-survey 선행) · `-gatekeeper-recurring`(옛 성문지기 ×3 kill, 반복, ※gatekeeper 선행).
- 마른나루 길드 게시판(반복, giver 없음): `-board-wildcats`/`-board-ravens`/`-board-bandits`(옛길 3종, 누구나) · `-board-wall-ravens`/`-board-automata`(옛 변경 성채 2종, ※clear-road 선행).
- `REGION_REPEAT_COOLDOWN_MS.dustford = 4h` (시작 마을 3h ~ 디올라 6h 사이).

## 길드 의뢰 (guildQuests.ts)

Phase B 발란스 전 우선 끼워 넣음 — `f_westgate_bandits`(F, 노상강도 ×400, 명성 140·골드 510) · `e_gatekeeper_decommission`(E, `kill_boss` 옛 성문지기 ×8, 명성 270·골드 1150·녹슨 쇳조각 ×3). 전체 풀 발란스는 Phase B 에서.

## 후속 (별도 PR)

- 지역 배경 webp 3장(`ui/westgate.webp`·`ui/dustford.webp`·`ui/oldwall_keep.webp`) + 잡몹/보스 webp 7장 + 마른나루 NPC 초상화 5장.
- 칭호(마른나루 라인 클리어 — 예: `frontier_warden` 등) — 현재 미정. 칭호가 필요한 레벨대가 아니라 보류.
