# v2 협동 보스 — 소환서 소환 + 공유 HP 토벌 (2026-06-13)

> 상태: ✅ 구현 완료. 수치 다이얼은 라이브 실측 후 조정.

## 컨셉 (exten 원형의 v2 이식)

`sea9401/exten`(v1 이전 게임)의 coop 시스템 복원: **사냥 → 소환서 드랍 → N장 모아 소환
→ 모든 유저가 공유 HP 보스를 누적 데미지로 토벌 → 기여 비율 5티어 보상**.
v1 협동 보스(태고의 노룡, 시간 리젠 방식)가 의도적으로 뺐던 "소환 아이템" 루프를 되살렸다.

옛 솔로 "보스 도전"(#622 테마 보스 파일럿)은 이 시스템으로 **대체·삭제**. 보스 3종의
이름/아트/스킬/전용 유니크/칭호 자산은 협동 보스로 승계(기보유 유저 호환·이미지 재사용).

## 루프

1. **소환서 수집** — 사냥 승리 시 `SUMMON_SCROLL_DROP_PCT`(0.5%) 독립 롤(강화석 패턴).
   재료(`v2_boss_summon_scroll`)로 인벤 재료 탭·거래소 거래 가능, NPC 환금 불가.
2. **소환** — `POST /api/v2/coop/summon`. 소환서 차감 + 세션 생성(2시간). kind 당 동시
   1마리(partial uniqueIndex). 소환 시 전체 소식(coop_summon).
3. **공격** — `POST /api/v2/coop/attack`. 스태미너 20 + 쿨다운 2분. resolveBattle
   플레이어 20턴 캡(엔진 maxTurns ×2 = 페이즈 단위) 시뮬, 보스 반격으로 HP 실감소
   (충전약 자동 회복은 hunt 와 동일). 깎은 양만 기여 적립(오버킬 클램프).
4. **처치/만료** — hp 0 → 킬 CAS(세션 FOR UPDATE 보유자 1명) + coop_kill 피드.
   만료(2h) → defeatedAt 셋 + hp>0 표식, 보상 없음. 만료 정리는 cron 없이 lazy sweep.
5. **보상 수령** — `POST /api/v2/coop/claim`. 기여/maxHp 비율 → bronze 3%·silver 10%·
   gold 20%·epic 40%·legend 60%(v1 임계 승계). 골드(티어 누적 합산) + 보스 유니크
   (티어 확률 단일 롤) + 첫 처치 칭호(멱등 — 가이드 퀘스트 bossKills 판정 호환).
   contributor FOR UPDATE + claimedRewardSnapshot 으로 retry 멱등(v1 audit #9 승계).

## 보스 3종 (⚠️ 전부 캘리브 다이얼)

| 보스 | 소환서 | 공유 HP | 시뮬 스탯 깊이 | 유니크 | 칭호 |
|---|---|---|---|---|---|
| 산적 두목 | 5장 | 15,000 | 12 | 산왕의 쌍도끼 | v2_boss_mountain |
| 사구의 포식자 | 10장 | 40,000 | 24 | 사구 군주의 독니 | v2_boss_canyon |
| 호심의 군주 | 20장 | 100,000 | 42 | 동결의 권갑 | v2_boss_lake |

상위 보스일수록 시뮬 스탯이 깊은 깊이로 스케일 — 약빌드는 비싼 보스에서 반격 피해가
크다(티어 사다리). 골드 보상: 산군급 누적 200~3,000 / 포식자 ×2 / 군주 ×4.
유니크 확률: bronze 2% → legend 30%.

## 인프라

- **DB 마이그레이션 0** — v1 `coop_boss_sessions`/`coop_boss_contributors`/
  `coop_boss_attack_log` 재사용. regionId 컬럼에 kind id. v1 coop-respawn cron 은
  빈 COOP_BOSSES 라 영구 no-op(충돌 없음).
- **동시성** — v1 attack.ts 의 C1/C2 race fix 승계: 세션 FOR UPDATE 직렬화 + 처치
  CAS + 쿨다운 in-lock 체크. 락 순서는 전 라우트 공통 character.v2 우선.
- **데이터** — `src/adventure/data/v2/coopBosses.ts`(SSOT). 옛 dungeonBosses.ts 삭제,
  BOSS_UNIQUE_IDS/BOSS_TITLE_IDS export 시그니처 유지(v2QuestContext 호환).
- **UI** — 전투 탭 → 협동 보스(`/battle/coop`, V2CoopBossView). HP바·기여 순위·최근
  공격·소환/공격/수령 + ReplayBattleScene 다시보기. 20초 폴링.

## 다이얼 (라이브 실측 대상)

`coopBosses.ts`: SUMMON_SCROLL_DROP_PCT(0.5%) · COOP_ATTACK_TURNS(20) ·
COOP_ATTACK_STAMINA_COST(20) · COOP_ATTACK_COOLDOWN_MS(2분) · sharedMaxHp ·
rewards(골드/유니크 확률). 특히 공유 HP 는 라이브 유저 DPS(공격 로그 damageDealt
분포) 실측 후 "평균 빌드 4~6명 협력 처치" 기준으로 재캘리브.

## 잔여/추후

- 보스 소환서 → 보스별 상위 소환서 "제작" 단계(exten 원형의 ×5/×10/×20 합성 아이템)는
  생략하고 소환 시 직접 차감으로 단순화 — 거래소에 "보스별 소환권"을 내놓고 싶어지면
  그때 아이템화.
- 전광판(WarTicker) 노출·푸시 알림 연동 미구현(피드만).
- 만료 시 소환서 일부 환불 여부(현재 0) — 라이브 반응 보고 결정.
