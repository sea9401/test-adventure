# 해안 지선 — 조수 갯벌 · 소만 · 산호초 섬 (설계)

> 상태: ✅ **구현 완료** — 해안 지선(소만·산호초 섬) 출고. 이 문서는 설계 기록.

> 디올라(Lv6 어촌)에서 남쪽으로 갈라지는 **막다른 3지역 라인**. 폐허(Lv9)~산기슭(Lv18) 구간에 산으로 가는 길과 **나란히 놓인** 바닷길 — 한 줄로만 뻗던 월드가 처음으로 "산으로 / 바다로" 두 갈래로 나뉜다. 첫 비(非)내륙 지역 / 물·바다 몹 / 막다른 지선이라 만렙 레이스를 흩뜨린다.

## 지역

| RegionId | 이름 | reqLv | biome | position | 비고 |
| --- | --- | --- | --- | --- | --- |
| `tideflats` | 조수 갯벌 | 10 | `coast`(신설) | (780, 460) | 안개 호수가 바다로 빠지는 하구. 폐허 ≈ 난이도 |
| `saltmarsh` | 소만 | 13 | `village` | (640, 560) | 소금밭·젓갈 창고 포구. 디올라와 교역, 뱃사공 |
| `reef_isle` | 산호초 섬 | 18 | `coast` | (840, 600) | 안개 너머 떠 있는 섬·암초. 산기슭 ≈ 난이도. 보스 "수심의 것" |

- viewBox `height` 500→640 (디올라 아래 빈 공간 활용).
- 엣지: `diola→tideflats`(시련 5전) · `tideflats→saltmarsh`(무조건) · `saltmarsh→reef_isle`(story `ferryman_reef_passage`).
- 소만 fast-travel(`visited`) — 시작 마을·디올라·운향·바람골·천공 성지와 5쌍.

## 몬스터

갯벌 ≈ 폐허(Lv9) tier, 산호초 섬 ≈ 산기슭(Lv18) tier. image 필드는 후속 PR(webp 추가). 잡몹 스킬은 각 지역 일부에 1개씩.

| 이름 | 지역 | hp/atk/def/spd | exp | 특이 | 드랍 |
| --- | --- | --- | --- | --- | --- |
| 집게발 게 | tideflats | 150/11/8/3 | 11 | `pierce` 집게발 비집기(DEF -2) | 게딱지 6% / `crab_shell_buckler` 제작서 4% |
| 갯도요 | tideflats | 95/12/3/9 | 11 | 회피 20% | 게딱지 2% / `tideflats_waders` 제작서 4% |
| 진흙 미꾸라지 | tideflats | 120/10/4/6 | 10 | — | 게딱지 3% / **유실된 명품 `drowned_signet` 0.02%** |
| 산호초 사이렌 | reef_isle | 175/21/6/7 | 20 | 회피 20% | 심해 비늘 4% / `siren_scale_robe` 직조서 4% / `siren_song_mantle` 직조서 1.5% |
| 갑각 약탈자 | reef_isle | 210/19/9/6 | 21 | `heavy_blow` 작살 던지기(3페이즈마다 ×1.8) | 게딱지 5% / 산호 가시 2% / `coral_spine_dagger` 제작서 4% / `crustacean_bulwark` 제작서 2% |
| 가시 산호 골렘 | reef_isle | 250/17/13/2 | 22 | `brace` 가시 산호 껍질(피해 -4) | 산호 가시 5% / `tideglass_charm` 세공서 4% / `barbed_coral_dagger` 제작서 2% / `tidelord_signet_engraving` 새김서 0.3% |
| **수심의 것** (보스) | reef_isle | 800/30/15/5 | 100 | `enrage` 소용돌이(HP 35%↓ → ATK +8) · phaseTrigger HP 30%↓ → DEF +5 · `dropQualityBias` 3 · `onDefeatFlag: the_deep_one_stilled` | 심해 비늘 ×3 / 산호 가시 ×3 / `recipe_one_of` 심연 무구 4종 100% / `abyssal_heart` 세공서 15% / `tidelord_signet_engraving` 새김서 5% |

- `reef_isle.boss = { monsterName: "수심의 것", dailyEntryLimit: 3 }` — 별도 도전 버튼, 자정 기준 일일 3회.

## 재료

`crab_shell` 게딱지(4G) · `coral_spine` 산호 가시(8G) · `deep_scale` 심해 비늘(10G). (sellPrices.ts 등록)

## 장비

마정석 라인(광맥의 수호자 보상) 한 단계 위. 모두 제작 품질 변동 굴림.

- **갯벌 입문 2종**(uncommon, 게딱지): `crab_shell_buckler` 게딱지 손방패(atk+3,def+2) · `tideflats_waders` 갯벌 각반(def+3,spd+1).
- **산호초 섬 잡몹산 3종**(uncommon): `coral_spine_dagger` 산호 가시 단검(atk+5,dex+2) · `siren_scale_robe` 사이렌 비늘 로브(def+4,spd+2) · `tideglass_charm` 조수유리 부적(vit+3,luk+2).
- **업그레이드 3종**(베이스 + 재료 소비): `crustacean_bulwark` 갑각 보루방패(atk+5,def+4,spd-1) · `barbed_coral_dagger` 가시 산호 단검(atk+7,dex+3) · `siren_song_mantle` 사이렌 노래 망토(def+6,dex+2,spd+3).
- **수심의 것 보스 보상**: 심연 무구 4종(weapon, atk+7 공통 + 보조 stat — `abyssal_edge` 힘+4 / `abyssal_ward` 활력+4 / `abyssal_pike` 민첩+5 / `abyssal_clasp` 행운+5, `recipe_one_of`) + `abyssal_heart` 수심의 핵(accessory, dex+3·vit+3 — 보스 15% / `saltmarsh-yeoul-deep-one` 의뢰 확정).
- **유실된 명품**: `drowned_signet` 물에 잠긴 인장반지(accessory, luk+4·spd+1 — 진흙 미꾸라지 0.02%) → 업그레이드 `tidelord_signet` 조수군주의 인장(luk+6·spd+2·dex+1, unique·비거래 — 새김서 `tidelord_signet_engraving`: 가시 산호 골렘 0.3% / 수심의 것 5%).

## NPC (소만) · 다이얼로그

| NpcId | 이름 | role | 다이얼로그 | 역할 |
| --- | --- | --- | --- | --- |
| `saltmarsh_elder` | 원로 여울 | elder | `YeoulDialogue`(커스텀) | 메인 라인 축. 갯벌 의뢰 → 보증(`saltmarsh_vouched`) → 암초 정찰 → 수심의 것 처치 → 정기 토벌 |
| `saltmarsh_ferryman` | 뱃사공 해랑 | quest | `HaerangDialogue`(커스텀) | 게이트. 선저 덧대기(게딱지 ×15) 완료 시 `ferryman_reef_passage` ON → 산호초 섬 해금. 사이렌 쫓기 반복 의뢰 |
| `saltmarsh_salter` | 소금장수 갈매 | vendor | `GalmaeDialogue`(`questLineDialogue`) | 갯벌 잡몹 인트로 3종(게딱지·갯벌 각반 제작서) + 산호 가시 deliver(선저 덧대기 후) |
| `saltmarsh_innkeeper` | 여각 주인 보말 | innkeeper | `BomalDialogue`(`questLineDialogue`) | 게딱지 deliver(회복약) → 곳간 채우기(약 주머니 +1) → 갑각 약탈자 정리(선저 덧대기 후) |
| `saltmarsh_kid` | 갯마을 아이 미르 | lore | `MireuDialogue`(커스텀, 의뢰 X) | "갯벌이 출렁인다" 떡밥 — `ferryman_reef_passage`/`the_deep_one_stilled` 로 대사 분기 |

## storyFlag 흐름

1. `diola→tideflats` 시련 5전 → 갯벌. `tideflats→saltmarsh` 무조건.
2. 소만에서 갈매 인트로(`saltmarsh-galmae-crabs`) + 보말 인트로(`saltmarsh-bomal-crab-shells`)를 한 번씩 완료 → 여울이 보증: **`saltmarsh_vouched`**.
3. 해랑이 선저 덧대기 의뢰(`saltmarsh-haerang-hull-plating`, 게딱지 ×15 deliver) 를 내줌 → 완료 시 **`ferryman_reef_passage`** ON (= `saltmarsh→reef_isle` 게이트). 산호초 섬 적 대상 의뢰 전부 이 의뢰 완료를 `requiresQuestCompleted` 로 둠.
4. 여울 암초 정찰(`saltmarsh-yeoul-reef-survey`, 심해 비늘 ×10 deliver) → 수심의 것 처치(`saltmarsh-yeoul-deep-one`, kill ×1 — 보상에 `abyssal_heart` 제작서).
5. 수심의 것 처치 → 보스 `onDefeatFlag: the_deep_one_stilled`. 정기 토벌(`saltmarsh-deep-one-recurring`, kill ×3 반복) 해금. 여울/해랑/미르 대사 갱신.

`STORY_QUESTS.saltmarsh_deep_one` — "수심의 것" 항목(스토리 탭 메타데이터).

## 퀘스트 (quests.ts)

- 갈매(`saltmarsh_salter`): `-galmae-crabs`(집게발 게 ×20, 반복, 제작서 `crab_shell_buckler`) · `-galmae-mudfish`(진흙 미꾸라지 ×18, 반복, 제작서 `tideflats_waders`) · `-galmae-shore-birds`(갯도요 ×18, 반복) · `-galmae-reef-coral`(산호 가시 ×8 deliver, 반복, ※hull-plating 선행).
- 보말(`saltmarsh_innkeeper`): `-bomal-crab-shells`(게딱지 ×10 deliver, 반복, 회복약) · `-bomal-galley-larder`(게딱지 ×15 deliver, 1회, potionCapacityBonus +1) · `-bomal-reef-stew`(갑각 약탈자 ×15, 반복, ※hull-plating 선행).
- 해랑(`saltmarsh_ferryman`): `-haerang-hull-plating`(게딱지 ×15 deliver, 1회 — 완료 시 `ferryman_reef_passage` ON) · `-haerang-reef-runs`(산호초 사이렌 ×20, 반복, ※hull-plating 선행).
- 여울(`saltmarsh_elder`): `-yeoul-reef-survey`(심해 비늘 ×10 deliver, 1회, ※hull-plating 선행) · `-yeoul-deep-one`(수심의 것 ×1, 1회 — 보상 골드 900·명성 26·EXP 1300·중간 회복약 ×5·제작서 `abyssal_heart`, ※reef-survey 선행) · `-deep-one-recurring`(수심의 것 ×3, 반복, ※deep-one 선행).
- 소만 길드 게시판(반복, giver 없음): `-board-crabs`/`-board-shore-birds`/`-board-mudfish`(갯벌 3종, 누구나) · `-board-sirens`/`-board-coral-golems`(산호초 섬 2종, ※hull-plating 선행).
- `REGION_REPEAT_COOLDOWN_MS.saltmarsh = 7h` (디올라 6h ~ 운향 8h 사이).

## 길드 의뢰 (guildQuests.ts)

Phase B 발란스 전 우선 끼워 넣음 — `f_tideflats_crabs`(F, 집게발 게 ×400, 명성 150·골드 540) · `e_deep_one_pacify`(E, `kill_boss` 수심의 것 ×8, 명성 280·골드 1200·심해 비늘 ×3). 전체 풀 발란스는 Phase B 에서.

## 후속 (별도 PR)

- 지역 배경 webp 3장(`ui/tideflats.webp`·`ui/saltmarsh.webp`·`ui/reef_isle.webp`) + 잡몹/보스 webp 7장 + 소만 NPC 초상화 5장.
- 칭호(소만 라인 클리어 — 예: `tide_warden` 등) — 현재 미정. 칭호가 필요한 레벨대가 아니라 보류.
