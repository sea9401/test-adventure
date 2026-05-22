# High 이슈 3건 — 재확인 + 수정 계획 (2026-05-11)

> 상태: ✅ **구현 완료 (2026-05-11)** — High 이슈 3건 수정 반영. 역사 기록.

`docs/audit-findings.md` 의 🟠 High 3건을 실제 코드로 재확인한 결과와 수정 방안.

> **진행 상황 (2026-05-11)**
> - #3 협동 보스 race — ✅ 완료 (커밋 `27b8014` — UPDATE…RETURNING + 처치 CAS)
> - #2 stale torn write — ✅ 완료 (커밋 `dbbdcac` — reload 전 flushSync 제거, 일관성 우선)
> - #1 상점 클라 권위 — ✅ 상점 도메인만 서버 권위화 완료 (`POST /api/shop`, `lib/server/shop.ts` 등).
>   crafting / quest-progress / 신전·훈련 의 서버 권위는 미착수 (server-authority-plan 2~3단계).
>   offline-hunt 는 별도로 이미 서버화됨 (커밋 `6dc1ec9`).

---

## #1 — 상점 구매·판매가 전부 클라이언트 권위 (안티치트)

### 재확인 결과 — 확정 (단, 범위가 상점보다 넓음)

- `src/app/page.tsx:287-316` — `handlePurchasePotion` / `handlePurchaseMaterial` / `handlePurchaseConsumable`: 클라에서 `characterStateHook.addGold(-cost)` + `inventory.add*()` 를 직접 실행. 골드 부족 검사도 클라 메모리값(`characterState.gold`)으로만.
- `src/app/page.tsx:349-409` — `handleSell*`: 동일하게 클라에서 차감/지급.
- 이 state 들은 `savesKv` 로 동기화되는데, `src/app/api/save/route.ts` 의 PATCH 는 **게임 규칙 검증을 전혀 안 함** — 낙관적 동시성(`expectedVersion`)만 보고 값을 그대로 저장. 즉 서버는 dumb blob store.
- 결국 상점뿐 아니라 `character.v2`(골드·EXP·레벨·HP) / `inventory.v2` / `crafting.v2` / `quest-progress.v2` 전부 devtools 로 위조 가능. **이미 `docs/server-authority-plan.md` 가 이 전체 문제를 다루는 설계 문서로 존재함.**

### 수정 방안 — `server-authority-plan.md` 를 단계 착수

`server-authority-plan.md` 의 결정사항을 따르되, 한 번에 다 옮기지 말고 **leverage 순으로 도메인별 단계 진행** (release-train 회피, 그 문서의 원칙):

1. **1단계 — `inventory.v2` + `character.v2` 권위 이전 + 상점/판매 endpoint.** 골드·아이템이 마켓플레이스 listing 의 입력이라 위조 시 멀티플레이어 경제가 오염됨 — 가장 시급. `POST /api/shop/buy`, `POST /api/shop/sell` 로 의도만 받고 서버가 검증 후 변경분 반환. 클라 PATCH 권한 제거.
2. **2단계 — `crafting.v2` (제작) + 신전·훈련.** 단발 트랜잭션 endpoint.
3. **3단계 — `quest-progress.v2` + `adventure-log.v2`.** 전투 결과 시드 기반 재현 검증과 묶임 (큰 작업).
4. 비-진행 키(`map.v2`, `storyFlags.v2`, `edge-unlocks.v2`, `shop.unlocks.v1`)는 그 문서대로 v1 대상 아님.

> **권장 우선순위**: 1단계만 먼저. 마켓플레이스가 이미 inbox 패턴으로 서버 권위라, 그 입력(골드·인벤토리)을 막으면 멀티플레이어 표면 위조가 거의 닫힌다. 2~3단계는 그 다음 분기.

### 작업량

1단계: 중간(엔드포인트 2~3개 + `SaveProvider` 의 PATCH 제외 처리 + 클라 핸들러를 async + 멱등성 `clientActionId`). 2~3단계: 큼.

---

## #2 — stale 동기화 시 cross-key torn write (보상 일부 소실 + 일관성 깨짐)

### 재확인 결과 — 확정 (정확히는 "torn state" 가 진짜 문제)

흐름 (`src/lib/storage/remote.ts:140-194`, `src/lib/storage/SaveProvider.tsx:147-164`):

1. 어떤 키 X 가 같은 flush 사이클에서 4× 409 → `droppedKeys` 에 추가되고 `pending` 에서 제거. snapshot 의 나머지 키는 계속 PATCH 됨.
2. 마지막에 `setStatus({ kind: "stale", droppedKeys })`.
3. `SaveProvider` 가 listener 로 받아 → `remote.flushSync()` (큐에 남은 **다른 키들**을 `expectedVersion` 동봉해 keepalive 발사) → `location.reload()`.
4. reload → `loadAll()` 가 **모든 키를 서버 값으로** hydrate.

결과: 살아남은 키 = 이 디바이스의 값(flushSync로 전송됨), 폐기된 키 = 서버 값(다른 디바이스). **한 캐릭터의 상태가 두 디바이스의 값으로 찢어짐** — 예: `inventory.v2` 엔 새 드롭이 있는데 `character.v2` 의 골드·EXP 는 옛날로 롤백, 또는 그 반대. 코드 주석은 flushSync 가 "cross-key 일괄 손실 차단" 이라 하지만 실제론 **torn state 를 만든다.**

(주의: 오프라인 사냥 보상도 이 경로로 손실 가능 — 단 4× 409 = 진짜 멀티 디바이스 동시 편집이라 빈도는 낮음. localStorage 백업 + 토스트가 사용자에게 인지는 시켜줌.)

### 수정 방안 — 일관성 우선: drop-threshold 도달 시 **flush 전체 포기**

근본 문제는 "데이터 손실" 보다 "**비일관 상태**". 정책을 한쪽으로 통일:

- **권장 (A — 작음)**: 어떤 키든 drop-threshold 에 도달하면 살아남은 키도 flushSync 하지 **않고**, 그냥 reload → 서버 상태를 통째로 채택. 손실은 "마지막 성공 sync 이후 이 디바이스가 한 것" 으로 한정 — 이게 정확히 멀티 디바이스 충돌의 의미론. 결과가 **coherent**(전부 서버 값). `SaveProvider` 에서 `remote.flushSync()` 호출만 제거하고, 토스트 문구를 "다른 기기의 진행으로 되돌렸습니다 — 이 기기의 최근 변경 일부는 반영되지 않았을 수 있습니다" 로 조정.
- 대안 (B — 큼): dropped 키 값을 localStorage 회복 큐에 적재 → 다음 로드에서 머지/안내. 엣지케이스 많음. 후속 과제로.

> 트레이드오프: A 는 비충돌 키의 변경분도 버린다(현재는 살림). 하지만 RPG 세이브에서 "검을 받았는데 골드는 안 빠진" / "퀘스트는 올랐는데 그 킬이 로그에 없는" torn state 가 더 큰 버그 표면. coherent rollback 이 낫다고 판단 — 최종 결정은 사용자 몫.

### 영향 범위 / 테스트

- `src/lib/storage/SaveProvider.tsx` (flushSync 호출 1줄 제거 + 토스트 문구), 필요 시 `remote.ts` 의 stale 처리 주석 갱신.
- `src/lib/storage/remote.test.ts` 에 케이스 추가: "drop-threshold 도달 시 살아남은 키도 더 이상 PATCH 안 됨" (현재 `staleEncountered` 테스트는 살아남은 키가 PATCH 되는 걸 *기대* 하므로 그 테스트도 뒤집어야 함 — 의도된 동작 변경).

### 작업량

작음 (반나절). 다만 기존 테스트의 기대값을 바꾸는 거라 "의도된 동작 변경" 임을 커밋 메시지에 명시.

---

## #3 — 협동 보스 동시 처치 race (중복 방송 + "죽었는데 못 받는" 보스)

### 재확인 결과 — 확정, 서브버그 **2개**

`src/app/api/coop/[region]/route.ts:280-355` (`handleAttack`):

```
const result = simulateCoopAttack({ bossCurrentHp: session.hp, ... });  // session.hp 는 SELECT 시점의 stale 값
const newHp = Math.max(0, session.hp - result.damageDealt);              // ← stale 기반
const defeated = newHp === 0;                                            // ← stale 기반
await db.transaction(...): UPDATE SET hp = GREATEST(0, hp - dmg), defeatedAt = defeated ? now : null
if (defeated) { setStoryFlagServer(...); broadcastBossKill(...); }        // ← stale 기반 분기
```

`defeated` / `newHp` 를 **트랜잭션 전 SELECT 값**으로 계산하고, UPDATE 의 실제 결과(`GREATEST(0, hp - dmg)`)를 안 본다. 그래서:

- **서브버그 ①  중복 부수효과**: 두 공격자 A·B 모두 `hp=30` 을 읽고 각자 ≥30 데미지 → 둘 다 `defeated=true` → 둘 다 `broadcastBossKill`(채팅에 "{보스}가 쓰러졌다" 중복) + `setStoryFlagServer`(idempotent라 무해) + `nextSpawnAt` 두 번 설정(두 번째가 덮음).
- **서브버그 ②  "죽었는데 못 받는" 보스 (더 심각)**: A 가 20 데미지(`defeated=false` 로 계산), B 가 25 데미지(`defeated=false` 로 계산). DB 는 `hp = GREATEST(0, GREATEST(0,30-20)-25) = 0` 이 되지만 **둘 다 `defeatedAt` 을 안 건드림 → `hp=0, defeatedAt=NULL`**. 이후: `handleAttack` 은 `session.hp <= 0` 이라 409 거부, `handleClaim` 은 `!session.defeatedAt` 이라 404 거부, GET 은 여전히 isActive=true 로 표시. **보스가 죽었지만 아무도 보상 못 받고**, `expiresAt` 만료 / `respawnCoopRegion` 정리까지 그대로 박혀 있음.

### 수정 방안 — `defeated` 를 DB 결과로 판정 + 처치를 CAS

스키마 변경 없이 Postgres 만으로 (Drizzle `db.transaction` 기본 READ COMMITTED → 같은 row 의 두 UPDATE 는 직렬화되므로 두 번째 UPDATE 의 `GREATEST(0, hp - dmg)` 와 `RETURNING` 은 첫 커밋 반영값을 본다):

```ts
let iClaimedKill = false;
await db.transaction(async (tx) => {
  // 1. 원자적 HP 차감 + 실제 결과 반환.
  const [u] = await tx.update(coopBossSessions)
    .set({ hp: sql`GREATEST(0, ${coopBossSessions.hp} - ${result.damageDealt})` })
    .where(eq(coopBossSessions.id, session.id))
    .returning({ hp: coopBossSessions.hp });
  const realHp = u.hp;

  // 2. 처치 CAS — hp=0 이고 아직 아무도 안 잡았을 때만 1명이 점유.
  if (realHp === 0) {
    const [c] = await tx.update(coopBossSessions)
      .set({ defeatedAt: now, nextSpawnAt: new Date(now.getTime() + def.respawnMs) })
      .where(and(eq(coopBossSessions.id, session.id), isNull(coopBossSessions.defeatedAt)))
      .returning({ id: coopBossSessions.id });
    iClaimedKill = !!c;
  }

  // 3. contributor UPSERT + attack log (기존 그대로)
});

if (iClaimedKill && def.onDefeatFlag) await setStoryFlagServer(userId, def.onDefeatFlag);
if (def.onAttackFlag) await setStoryFlagServer(userId, def.onAttackFlag);   // 모든 공격자 — 그대로
if (iClaimedKill) await broadcastBossKill(userId, session.id, session.bossName).catch(...);

return Response.json({ ..., session: { hp: realHp, defeated: iClaimedKill || realHp === 0 } });
```

- ①  해소: 동시 처치여도 CAS 에서 `defeatedAt IS NULL` 통과한 1명만 `iClaimedKill=true` → 방송·플래그 1회.
- ②  해소: 누가 됐든 `realHp===0` 을 본 마지막 트랜잭션이 CAS 로 `defeatedAt` 세팅 → "죽었는데 NULL" 상태 사라짐.

### 후속(이번 픽스에 묶을지 선택)

- `simulateCoopAttack` 이 stale `bossCurrentHp` 를 받아 데미지를 그것 기준으로 캡할 경우, 실제 남은 HP 보다 과대 데미지가 contributor 에 크레딧될 수 있음 (`ratio = damage / maxHp` 에 영향 — 보상 티어 약간 후함). `GREATEST(0, …)` 가 세션 HP 자체는 보호하므로 무해 수준. 분리 가능.
- 응답의 `session.hp` 를 stale `newHp` 대신 `realHp` 로 — 클라가 어차피 GET 폴링으로 보정하지만 깔끔.

### 영향 범위 / 테스트

- `src/app/api/coop/[region]/route.ts` 의 `handleAttack` 만 (~30줄).
- 테스트: coop 시뮬/리워드는 단위 테스트 있으나 라우트 동시성 테스트는 없음(`audit-findings.md` #20과 같은 공백). 최소한 "동시 2건 → 정확히 1건만 broadcast, defeatedAt 항상 세팅됨" 통합 테스트 추가 권장. DB 접근이 필요해 비용이 있으면 우선 수동 검증 + 로직 단위 추출.

### 작업량

작음~중간 (반나절~1일, 테스트 포함).

---

## 착수 순서 제안

1. **#3 (coop race)** — 가장 작고, "보스 죽었는데 못 받음" 은 실사용 중 터지면 즉시 항의 들어옴. 스키마 변경 없음.
2. **#2 (torn write)** — 작음. 단 동작 변경이라 사용자 OK 받고 진행 (위 A안 채택 여부 확인 필요).
3. **#1 1단계 (shop/inventory/character 서버 권위)** — 가장 큼. `server-authority-plan.md` 검토 → 1단계 스코프 확정 후 별도 PR 라인.

> 결정 필요: #1 은 1단계만 먼저 갈지 / #2 는 A안(일관성 우선 rollback)으로 갈지.
