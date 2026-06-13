# 길드 — 유저 자치 소규모 모임 시스템

> 상태: ✅ **구현 완료** — 길드(소규모 자치 모임) 출고. 이 문서는 설계 기록.

작은 유저 풀에서도 "끼리 모이는" 느낌이 살도록 **정원 3명 / 마스터 초대제**로 설계한 유저 자치 길드의 단일 출처 설계 문서.

> **원칙** — 거래소(marketplace) 패턴을 그대로 따른다. 서버 권위 + 우편함(inbox) 통합 + 마을 sub-view 진입. 새 인프라(WebSocket, 실시간 채팅 등)는 도입하지 않는다. 자동 해체는 marketplace listing 만료(24h) 와 같은 비동기 정리 패턴.

---

## 1. 컨셉

| 항목 | 내용 |
|---|---|
| **정원** | 3명 (마스터 1 + 멤버 2) |
| **1인 제약** | 1인 1마스터, 1인 1길드 (한 번에 한 곳에만) |
| **가입 방식** | 마스터가 우편함으로 초대장 발송 → 수령자가 우편함에서 수락/거절 |
| **생성 조건** | 레벨 5+ 또는 독립 의뢰 5건 완료 + 200G |
| **affiliation 표시** | 캐릭터의 `affiliation` 필드에 길드명 자동 반영 |
| **진입점** | 마을 → "길드 회관" sub-view (NPC 의뢰 길드와 별도) |
| **자동 해체** | 멤버 0명 즉시 / 전원 30일 미접속 / 마스터 30일 미접속 + 활동 멤버 → 자동 위임 |

길드 시스템의 1차 목적은 **사회적 지표** — 길드명이 affiliation 에 표시되고 길드원 목록을 볼 수 있는 정도. 길드 버프·길드 의뢰 등 게임플레이 영향은 **Phase 3 이후**로 미룬다.

---

## 2. 사용자 흐름

### 2.1 길드 생성

마을 → 길드 회관 → "새 길드 만들기" → 조건 검사 (레벨 ≥ 5 OR 의뢰 5건 + 200G) → 길드명 입력 → 200G 차감 + `guilds`/`guild_members` 생성 + `character.affiliation` 갱신.

### 2.2 초대 발송 / 수락 / 거절

- 마스터: 길드 회관 → "멤버 초대" → 닉네임 검색 → `guild_invites` row + `marketplaceInbox` 에 `guild_invite` 페이로드 enqueue (만료 7일)
- 수령자: 우편함에서 `🤝 X 의 길드 초대` 행 → 수락/거절 두 액션 버튼
- 수락: 정원/소속/쿨다운/만료 검증 → 통과 시 가입 + affiliation 갱신 + 우편 claim
- 거절: 초대장 status='declined', 우편 claim

### 2.3 탈퇴 / 추방 / 양도 / 해체

- 자발 탈퇴: 멤버 → guild_members 제거 + 1일 쿨다운. 마스터는 멤버가 있으면 거부, 혼자면 해체로 흐름 분기
- 마스터의 추방: 길드원 행에서 추방 → 대상자도 1일 쿨다운
- 마스터 양도: 멤버 중 1명을 새 마스터로 → role 스왑, 본인은 일반 멤버
- 강제 해체: 마스터 → 모든 멤버 affiliation 무소속 + 마스터에게만 1일 쿨다운 + `disbandedAt` 마킹

### 2.4 자동 해체 (cron, daily)

| 조건 | 동작 |
|---|---|
| 멤버 수 0 | 즉시 해체 — `disbandedAt` 마킹 |
| 길드 전원 30일 미접속 | 해체 (Phase 2) |
| 마스터만 30일 미접속 + 다른 멤버 활동 중 | **자동 위임** — 가장 최근 접속 멤버에게 (Phase 2) |

해체된 길드 이름은 30일 후 재사용 가능 (`disbandedAt` tombstone hold).

---

## 3. DB 스키마

`src/db/schema.ts`:

- `guilds` (id serial, name unique by lower, masterId, createdAt, disbandedAt)
- `guildMembers` (guildId+userId composite PK, userId 별도 unique = 1인 1길드, role)
- `guildInvites` (id serial, guildId, fromUserId, toUserId, expiresAt, status, partial unique on pending)
- `guildLeaveCooldown` (userId PK, cooldownUntil)

마이그: `drizzle/0001_*.sql` (drizzle-kit generate).

---

## 4. API 엔드포인트

`src/app/api/guilds/`:

| 엔드포인트 | 메서드 | 권한 |
|---|---|---|
| `/me` | GET | 본인 |
| `/` | POST | 본인 |
| `/[id]/invite` | POST | 마스터 |
| `/[id]/leave` | POST | 멤버 |
| `/[id]/kick` | POST | 마스터 |
| `/[id]/transfer` | POST | 마스터 |
| `/[id]/disband` | POST | 마스터 |
| `/invites/[inviteId]/accept` | POST | 수령자 |
| `/invites/[inviteId]/decline` | POST | 수령자 |

모든 mutation은 `db.transaction` + FOR UPDATE 잠금으로 race-safe.

### Cron

`/api/cron/guilds-cleanup` (daily 04:00 UTC):
- 만료된 pending 초대장 → expired
- 멤버 0인 활성 길드 → disbandedAt
- 30일 지난 disbandedAt → hard delete (이름 해방)
- 만료된 leave_cooldown 정리

---

## 5. 우편함 통합

`marketplaceInbox` 테이블에 `kind = 'guild_invite'` 페이로드 신규 추가:

```ts
payload: {
  invite_id: number;
  guild_id: number;
  guild_name: string;
  expires_at: string;
}
```

`InboxView` 의 `summarizePayload` 에 케이스 추가, `InboxRow` 가 guild_invite 일 때 onAccept/onDecline 두 버튼 분기. 전체 수령 버튼에서는 guild_invite 제외.

---

## 6. UI

- `TownScreen` 에 "길드 회관" 메인 메뉴 항목 (sub-view: `guild_hall`)
- `GuildHallView` — 길드 정보 / 길드원 목록 / 관리 버튼 / 길드 생성 폼 (소속 없을 때)
- `GuildInviteModal` — 닉네임 입력 → POST /invite

---

## 7. 단계별 구현 계획

### Phase 1 (✅ 구현 완료)

- DB + 마이그
- API 9개
- 우편함 통합
- UI 길드 회관 + 초대 모달
- character.affiliation 자동 동기화 (서버 + 클라이언트)
- cron 기본 (만료 / 멤버 0 해체 / tombstone purge / cooldown 정리)

### Phase 2 — 자동 해체 + UX 다듬기

- cron 의 30일 미접속 해체 / 자동 위임
- 시스템 알림 우편 (해체/위임 통보)
- 탈퇴/추방 쿨다운 1일 enforce (서버는 이미 적용, 클라 UI는 데이터 기반 표시)
- `guild_invite` 전용 NotificationKind 분리 검토

### Phase 3 — 게임플레이 영향 (별도 plan 분리)

- 길드 게시판 (한 줄 공지 + 짧은 메시지)
- 길드 의뢰 / 협력 보스
- 길드 버프 (소소한 stat 보너스 — 발란스 영향이 있어 주의)

---

## 8. 결정 사항 (default — 검토 후 조정)

| 항목 | 기본값 | 근거 |
|---|---|---|
| 독립 의뢰 N건 | 5건 | 시작 마을 의뢰 라인 한 바퀴 |
| 길드명 길이 | 2~12자 | 거래소 닉네임 패턴과 비슷 |
| 길드명 제약 | 한글/영문/숫자/공백, 중복 불가, 욕설 필터 | 욕설 필터 5단어로 시작 (운영자/관리자/admin/system) |
| 마스터 위임 후 원래 마스터 복귀 | 일반 멤버로 (자동 권한 복귀 X) | 단순 |
| 길드원 목록 정보 | 이름, 레벨, 칭호, 마지막 접속(상대시간) | 얼굴이 보이는 최소 정보 |
| 탈퇴/추방 쿨다운 | 1일 | 갈아타기 남용 막되 너무 가혹하지 않게 |
| 초대장 만료 | 7일 | 우편함 청소 겸함 |
| 해체 길드명 재사용 | 30일 후 | 사칭/연속 재생성 방지 |

---

## 9. 결정 보류 / 추후 검토

- 시즌제 길드 (유저 풀 더 커지면)
- 길드 채팅 (WebSocket 인프라)
- 공개 길드 디렉토리 (마스터 초대제라 사실상 불필요)
- affiliation 비표시 옵션
- 욕설 필터 강도 / 신고 시스템
