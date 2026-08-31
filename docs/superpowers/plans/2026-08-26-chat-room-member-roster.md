# Chat Room Member Roster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자 채팅방 참여자가 방에 함께 있는 캐릭터 명단과 방장을 확인하게 한다.

**Architecture:** 기존 동적 방 상세 경로에 참여자 전용 `GET`을 추가하고, 클라이언트 API 래퍼와 작은 헤더 팝오버 컴포넌트가 필요할 때만 호출한다. `ChatPanel`은 사용자 채팅방에서만 이 컴포넌트를 렌더하고 기존 프로필 라우팅 콜백을 전달한다.

**Tech Stack:** Next.js 16 Route Handlers, React 19 Client Components, Drizzle ORM, Vitest, Testing Library, Tailwind CSS

## Global Constraints

- 배포하지 않는다.
- 사용자 생성 채팅방만 변경하고 길드 기본 채널은 변경하지 않는다.
- 명단은 접속 상태가 아니라 멤버십이므로 `참여자`라고 표현한다.
- 방 참여자만 명단을 조회할 수 있다.
- 콘텐츠 패널은 `SURFACE_CARD` 또는 `SURFACE_INSET`의 불투명 표면을 사용한다.
- 현재 작업 트리의 채팅 외 미커밋 변경은 수정하거나 커밋하지 않는다.

---

### Task 1: 참여자 명단 Route Handler

**Files:**
- Modify: `src/app/api/chat/rooms/[roomId]/route.ts`
- Create: `src/app/api/chat/rooms/[roomId]/route.members.test.ts`

**Interfaces:**
- Consumes: `ensureUser()`, `chatRoomMembers`, `users`
- Produces: `GET(req, { params }): Promise<Response>` returning `{ members: CustomChatRoomMember[] }`

- [ ] **Step 1: Write the failing API tests**

비참여자는 `403 not in room`을 받고, 참여자는 `userId`, `name`, `role`, 숫자형 `joinedAt`이 포함된 명단을 받는 테스트를 작성한다.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- 'src/app/api/chat/rooms/[roomId]/route.members.test.ts'`
Expected: FAIL because the route does not export `GET`.

- [ ] **Step 3: Write the minimal Route Handler**

인증과 방 번호를 검증하고 요청자의 멤버십을 확인한다. 성공하면 방장 우선·참여 시각 순으로 사용자 이름을 조회해 날짜를 epoch milliseconds로 직렬화한다.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- 'src/app/api/chat/rooms/[roomId]/route.members.test.ts'`
Expected: PASS.

### Task 2: 참여자 팝오버와 채팅 헤더 연결

**Files:**
- Modify: `src/components/chat/chatRoomsApi.ts`
- Create: `src/components/chat/ChatRoomMembers.tsx`
- Create: `src/components/chat/ChatRoomMembers.test.tsx`
- Modify: `src/components/ChatPanel.tsx`

**Interfaces:**
- Produces: `CustomChatRoomMember` and `fetchChatRoomMembers(roomId: number)`
- Produces: `ChatRoomMembers({ roomId, memberCount, onSelectName })`
- Consumes: `router.push('/profile/' + encodeURIComponent(name))`

- [ ] **Step 1: Write the failing component test**

버튼을 누르면 정확한 방 URL을 조회하고 참여자 수·이름·방장 배지를 표시하며, 이름 클릭이 콜백을 호출하는 테스트를 작성한다.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/chat/ChatRoomMembers.test.tsx`
Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the API wrapper and component**

불투명 표면의 팝오버에 로딩·오류·재시도·빈 상태·명단 상태를 구현한다. 헤더 버튼에는 `aria-expanded`와 참여자 수를 포함한 접근 가능한 이름을 제공한다.

- [ ] **Step 4: Integrate with ChatPanel**

사용자 채팅방 헤더에만 `key={activeCustomRoom.id}`로 컴포넌트를 렌더하고 이름 클릭 시 기존 프로필 경로로 이동시킨다.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- src/components/chat/ChatRoomMembers.test.tsx 'src/app/api/chat/rooms/[roomId]/route.members.test.ts'`
Expected: PASS.

### Task 3: 전체 검증과 커밋

**Files:**
- Verify all files above

**Interfaces:**
- Consumes: completed API and UI behavior
- Produces: a verified local commit containing only roster-related changes

- [ ] **Step 1: Run relevant regression tests**

Run: `npm test -- src/components/chat/ChatRoomMembers.test.tsx src/components/ChatPanel.layout.test.ts src/components/chat/chatRoomsApi.test.ts 'src/app/api/chat/rooms/[roomId]/route.members.test.ts' 'src/app/api/chat/rooms/[roomId]/route.test.ts'`
Expected: PASS.

- [ ] **Step 2: Run static checks and build**

Run: `npx eslint src/components/ChatPanel.tsx src/components/chat/ChatRoomMembers.tsx src/components/chat/ChatRoomMembers.test.tsx src/components/chat/chatRoomsApi.ts 'src/app/api/chat/rooms/[roomId]/route.ts' 'src/app/api/chat/rooms/[roomId]/route.members.test.ts'`

Run: `npx tsc --noEmit`

Run: `npm run build`

Expected: all commands exit 0.

- [ ] **Step 3: Review the diff and commit only in-scope files**

```bash
git add docs/superpowers/specs/2026-08-26-chat-room-member-roster-design.md docs/superpowers/plans/2026-08-26-chat-room-member-roster.md src/app/api/chat/rooms/[roomId]/route.ts src/app/api/chat/rooms/[roomId]/route.members.test.ts src/components/chat/chatRoomsApi.ts src/components/chat/ChatRoomMembers.tsx src/components/chat/ChatRoomMembers.test.tsx src/components/ChatPanel.tsx
git commit -m "feat: show chat room participants"
```
