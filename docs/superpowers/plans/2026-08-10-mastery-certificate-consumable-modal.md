# Mastery Certificate Consumable Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 인벤토리 소모품과 숙련의 탑 양쪽에서 같은 모달로 숙련 증서를 직업 숙련도 또는 숙달 포인트로 사용할 수 있게 한다.

**Architecture:** `inventory.v2.masteryCertificates` 저장과 기존 사용 POST API는 유지한다. 부수효과 없는 증서 전용 GET API와 공용 `MasteryCertificateUseModal`을 추가하고, 인벤토리와 숙련의 탑은 각각 진입 카드와 성공 후 새로고침만 담당한다.

**Tech Stack:** Next.js App Router Route Handlers, React 19 client components, TypeScript, Drizzle ORM, Vitest, Tailwind CSS

## Global Constraints

- 인벤토리와 숙련의 탑은 동일한 공용 모달을 사용한다.
- 인벤토리에서 모달을 열 때 숙련의 탑 롤오버나 전날 보상 자동 지급을 실행하지 않는다.
- 기존 `POST /api/v2/mastery-tower/use-certificate`의 서버 검증, 트랜잭션, 경제 기록을 유지한다.
- 증서 1개는 직업 숙련도 1점 또는 숙달 포인트 1점으로 사용한다.
- 저장 구조와 기존 증서 보유량은 변경하거나 마이그레이션하지 않는다.
- 패널과 모달 본문에는 `src/components/ui/surfaces.ts`의 불투명 표면 상수를 사용한다.
- 배포하지 않는다.

---

### Task 1: 부수효과 없는 숙련 증서 상태 API

**Files:**
- Create: `src/lib/server/masteryCertificateStatus.ts`
- Create: `src/lib/server/masteryCertificateStatus.test.ts`
- Create: `src/app/api/v2/me/mastery-certificates/route.ts`
- Create: `src/app/api/v2/me/mastery-certificates/route.test.ts`

**Interfaces:**
- Consumes: `readSave`, `parseProficiencyForChar`, `V2_JOB_LIST`, `MASTERY_CERTIFICATE_KEY`
- Produces: `MasteryCertificateJob`, `MasteryCertificateStatus`, `readMasteryCertificateStatus(executor, userId)`, `GET /api/v2/me/mastery-certificates`

- [ ] **Step 1: 상태 파생 회귀 테스트 작성**

```ts
it("증서 수량과 사용 가능한 전투 직업만 반환한다", () => {
  const status = masteryCertificateStatusFromSaves(
    { class: "warrior" },
    { points: 10, groups: { warrior: { cumLevel: 20 } } },
    { masteryCertificates: 37 },
  );
  expect(status.certificates).toBe(37);
  expect(status.jobs.some((job) => job.id === "warrior")).toBe(true);
  expect(status.jobs.some((job) => job.id === "fisher")).toBe(false);
});
```

- [ ] **Step 2: 테스트를 실행해 실패 확인**

Run: `npx vitest run src/lib/server/masteryCertificateStatus.test.ts`

Expected: FAIL because `masteryCertificateStatusFromSaves` does not exist.

- [ ] **Step 3: 상태 파생기와 DB 읽기 함수 구현**

```ts
export type MasteryCertificateJob = {
  id: string;
  name: string;
  tier: number;
  group: string;
  mastery: number;
};

export type MasteryCertificateStatus = {
  certificates: number;
  jobs: MasteryCertificateJob[];
};

export function masteryCertificateStatusFromSaves(
  charSave: unknown,
  proficiencyRaw: unknown,
  inventoryRaw: unknown,
): MasteryCertificateStatus;

export async function readMasteryCertificateStatus(
  executor: DbExecutor,
  userId: string,
): Promise<MasteryCertificateStatus>;
```

파생기는 기존 숙련의 탑 GET과 동일하게 잠금 해제된 루트 전투 직업만 포함하고 낚시·농사 등 생활 직업은 제외한다. 읽기 함수는 `character.v2`, `proficiency.v2`, `inventory.v2`만 조회한다.

- [ ] **Step 4: 상태 파생 테스트 통과 확인**

Run: `npx vitest run src/lib/server/masteryCertificateStatus.test.ts`

Expected: PASS.

- [ ] **Step 5: 인증과 응답 형태를 검증하는 라우트 테스트 작성**

```ts
it("숙련의 탑 상태를 건드리지 않고 증서 상태를 반환한다", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    ok: true,
    certificates: 37,
    jobs: expect.any(Array),
  });
  expect(settleMasteryTowerRollover).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: 라우트 테스트 실패 확인**

Run: `npx vitest run src/app/api/v2/me/mastery-certificates/route.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 7: 읽기 전용 GET 라우트 구현**

```ts
export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const status = await readMasteryCertificateStatus(db, userId);
  return Response.json({ ok: true, ...status });
}
```

- [ ] **Step 8: Task 1 테스트 통과 확인**

Run: `npx vitest run src/lib/server/masteryCertificateStatus.test.ts src/app/api/v2/me/mastery-certificates/route.test.ts`

Expected: PASS.

- [ ] **Step 9: Task 1 커밋**

```bash
git add src/lib/server/masteryCertificateStatus.ts src/lib/server/masteryCertificateStatus.test.ts src/app/api/v2/me/mastery-certificates/route.ts src/app/api/v2/me/mastery-certificates/route.test.ts
git commit -m "feat: expose mastery certificate status"
```

### Task 2: 공용 숙련 증서 사용 모달

**Files:**
- Create: `src/adventure/v2/MasteryCertificateUseModal.tsx`
- Create: `src/adventure/v2/MasteryCertificateUseModal.test.tsx`
- Modify: `src/adventure/v2/V2MasteryTowerView.tsx`

**Interfaces:**
- Consumes: Task 1의 `MasteryCertificateStatus`, GET API, 기존 `POST /api/v2/mastery-tower/use-certificate`
- Produces: `MasteryCertificateUseModal({ open, initialStatus?, onClose, onUsed })`

- [ ] **Step 1: 모달 정적 UI와 순수 오류 문구 테스트 작성**

```tsx
it("두 사용 모드와 보유량을 표시한다", () => {
  const html = renderToStaticMarkup(
    <MasteryCertificateUseModal
      open
      initialStatus={{ certificates: 10, jobs: [warriorJob] }}
      onClose={() => {}}
      onUsed={() => {}}
    />,
  );
  expect(html).toContain('role="dialog"');
  expect(html).toContain("직업 숙련도");
  expect(html).toContain("숙달 포인트");
  expect(html).toContain("보유 10개");
});

it("서버 오류를 이용자 문구로 변환한다", () => {
  expect(masteryCertificateErrorLabel("no_certificate")).toBe(
    "보유한 숙련 증서가 없습니다.",
  );
});
```

- [ ] **Step 2: 모달 테스트 실패 확인**

Run: `npx vitest run src/adventure/v2/MasteryCertificateUseModal.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: 공용 모달 최소 구현**

```ts
export function MasteryCertificateUseModal({
  open,
  initialStatus = null,
  onClose,
  onUsed,
}: {
  open: boolean;
  initialStatus?: MasteryCertificateStatus | null;
  onClose: () => void;
  onUsed: () => void | Promise<void>;
}) { /* 조회, 모드/직업/수량 상태, 제출 UI */ }
```

열릴 때 `/api/v2/me/mastery-certificates`를 조회한다. 제출 시 기존 POST API를 호출하고 성공 응답의 `remaining`으로 수량을 갱신한 다음 `await onUsed()`를 호출한다. `remaining === 0`이면 성공 알림 후 닫는다. 네트워크 실패 시 선택과 입력을 유지하고 재시도할 수 있게 한다.

모달 컨테이너는 `role="dialog"`, `aria-modal="true"`, 제목 연결을 제공하고 배경 클릭과 닫기 버튼으로 닫을 수 있게 한다. 카드에는 `SURFACE_CARD`와 `SURFACE_INSET`을 사용한다.
열린 동안 `keydown`의 Escape를 처리하고 `document.body.style.overflow = "hidden"`으로
배경 스크롤을 잠근 뒤 cleanup에서 기존 값을 복원한다. 모달 패널은
`max-h-[90dvh] overflow-y-auto`와 데스크톱 최대 너비를 적용하고, 실행 버튼은 모바일에서도
스크롤 끝에서 쉽게 찾을 수 있도록 하단 동작 영역에 둔다.

- [ ] **Step 4: 모달 테스트 통과 확인**

Run: `npx vitest run src/adventure/v2/MasteryCertificateUseModal.test.tsx`

Expected: PASS.

- [ ] **Step 5: 숙련의 탑 진입점 회귀 테스트 작성**

```tsx
it("숙련 증서 사용 카드는 공용 모달 진입 버튼을 제공한다", () => {
  const html = renderToStaticMarkup(
    <MasteryCertificateEntryCard certificates={10} onUse={() => {}} />,
  );
  expect(html).toContain("숙련 증서 사용");
  expect(html).toContain("보유 10개");
});
```

- [ ] **Step 6: 숙련의 탑 테스트 실패 확인**

Run: `npx vitest run src/adventure/v2/V2MasteryTowerView.test.tsx`

Expected: FAIL because `MasteryCertificateEntryCard` does not exist.

- [ ] **Step 7: 숙련의 탑 인라인 폼을 진입 카드와 공용 모달로 교체**

`V2MasteryTowerView`에서 증서 사용 전용 mode/job/amount/busy 상태와 `spendCertificates`를 제거한다. 대신 `certificateModalOpen` 상태를 두고 다음 구조로 렌더한다.

```tsx
<MasteryCertificateEntryCard
  certificates={status.certificates}
  onUse={() => setCertificateModalOpen(true)}
/>
<MasteryCertificateUseModal
  open={certificateModalOpen}
  initialStatus={{ certificates: status.certificates, jobs: status.jobs }}
  onClose={() => setCertificateModalOpen(false)}
  onUsed={refresh}
/>
```

- [ ] **Step 8: Task 2 테스트 통과 확인**

Run: `npx vitest run src/adventure/v2/MasteryCertificateUseModal.test.tsx src/adventure/v2/V2MasteryTowerView.test.tsx`

Expected: PASS.

- [ ] **Step 9: Task 2 커밋**

```bash
git add src/adventure/v2/MasteryCertificateUseModal.tsx src/adventure/v2/MasteryCertificateUseModal.test.tsx src/adventure/v2/V2MasteryTowerView.tsx src/adventure/v2/V2MasteryTowerView.test.tsx
git commit -m "feat: share mastery certificate use modal"
```

### Task 3: 인벤토리 소모품 진입점

**Files:**
- Modify: `src/app/api/v2/me/inventory/route.ts`
- Modify: `src/app/api/v2/me/inventory/route.test.ts`
- Modify: `src/adventure/v2/V2InventoryView.tsx`
- Modify: `src/adventure/v2/V2InventoryView.test.tsx`
- Modify: `src/adventure/v2/inventory/RareMapsTab.tsx`
- Modify: `src/adventure/v2/inventory/RareMapsTab.test.tsx`

**Interfaces:**
- Consumes: `MASTERY_CERTIFICATE_KEY`, Task 2의 `MasteryCertificateUseModal`
- Produces: inventory 응답의 `masteryCertificates: number`, 소모품 카드와 모달 진입점

- [ ] **Step 1: 인벤토리 API가 증서 수량을 반환하는 실패 테스트 작성**

```ts
it("inventory.v2의 숙련 증서 수량을 노출한다", async () => {
  store.set("inventory.v2", { masteryCertificates: 10 });
  const response = await GET();
  await expect(response.json()).resolves.toMatchObject({
    ok: true,
    masteryCertificates: 10,
  });
});
```

- [ ] **Step 2: 인벤토리 API 테스트 실패 확인**

Run: `npx vitest run src/app/api/v2/me/inventory/route.test.ts`

Expected: FAIL because `masteryCertificates` is missing.

- [ ] **Step 3: 인벤토리 응답에 안전하게 정규화한 수량 추가**

```ts
const masteryCertificates = Math.max(
  0,
  Math.floor(Number(invSave[MASTERY_CERTIFICATE_KEY]) || 0),
);

return Response.json({
  ok: true,
  materials,
  masteryCertificates,
  // existing fields
});
```

- [ ] **Step 4: 인벤토리 API 테스트 통과 확인**

Run: `npx vitest run src/app/api/v2/me/inventory/route.test.ts`

Expected: PASS.

- [ ] **Step 5: 소모품 카드 렌더 테스트 작성**

```tsx
it("숙련 증서를 보유하면 사용 카드를 표시한다", () => {
  const html = renderToStaticMarkup(
    <RareMapsTab
      {...baseProps}
      masteryCertificates={10}
      onUseMasteryCertificate={() => {}}
    />,
  );
  expect(html).toContain("숙련 증서");
  expect(html).toContain("×10");
  expect(html).toContain("직업 숙련도 또는 숙달 포인트");
});
```

- [ ] **Step 6: 소모품 카드 테스트 실패 확인**

Run: `npx vitest run src/adventure/v2/inventory/RareMapsTab.test.tsx`

Expected: FAIL because the mastery certificate props/card do not exist.

- [ ] **Step 7: 소모품 카드와 빈 목록 억제 조건 구현**

`RareMapsTab`에 `masteryCertificates`와 `onUseMasteryCertificate` props를 추가한다. 1개 이상이면 `숙련 증서` 카드, 수량, 용도 설명, 사용 버튼을 표시하고 `suppressEmpty` 계산에도 포함한다.

- [ ] **Step 8: 인벤토리 뷰 모달 연결 테스트 작성**

```ts
it("숙련 증서 사용 콜백이 공용 모달을 연다", async () => {
  renderToStaticMarkup(<V2InventoryView onBack={() => {}} />);
  expect(capturedUseCertificate).toBeTypeOf("function");
  capturedUseCertificate?.();
  expect(capturedModalOpen).toBe(true);
});
```

- [ ] **Step 9: 인벤토리 뷰 테스트 실패 확인**

Run: `npx vitest run src/adventure/v2/V2InventoryView.test.tsx`

Expected: FAIL because the callback and modal are not connected.

- [ ] **Step 10: 인벤토리 상태와 공용 모달 연결**

`V2InventoryView`가 inventory 응답의 `masteryCertificates`를 상태에 저장한다. `RareMapsTab` 사용 버튼으로 `certificateModalOpen`을 열고 다음 모달을 렌더한다.

```tsx
<MasteryCertificateUseModal
  open={certificateModalOpen}
  onClose={() => setCertificateModalOpen(false)}
  onUsed={async () => {
    await refresh();
    await refreshGameState();
  }}
/>
```

- [ ] **Step 11: Task 3 테스트 통과 확인**

Run: `npx vitest run src/app/api/v2/me/inventory/route.test.ts src/adventure/v2/inventory/RareMapsTab.test.tsx src/adventure/v2/V2InventoryView.test.tsx`

Expected: PASS.

- [ ] **Step 12: Task 3 커밋**

```bash
git add src/app/api/v2/me/inventory/route.ts src/app/api/v2/me/inventory/route.test.ts src/adventure/v2/V2InventoryView.tsx src/adventure/v2/V2InventoryView.test.tsx src/adventure/v2/inventory/RareMapsTab.tsx src/adventure/v2/inventory/RareMapsTab.test.tsx
git commit -m "feat: use mastery certificates from inventory"
```

### Task 4: 통합 검증과 문구 정합성

**Files:**
- Modify if needed: files changed in Tasks 1-3

**Interfaces:**
- Consumes: Tasks 1-3 전체
- Produces: 타입 검사와 관련 회귀 테스트를 통과하는 완성 기능

- [ ] **Step 1: 관련 테스트 전체 실행**

Run: `npx vitest run src/lib/server/masteryCertificateStatus.test.ts src/app/api/v2/me/mastery-certificates/route.test.ts src/lib/server/masteryCertificateRoute.test.ts src/app/api/v2/me/inventory/route.test.ts src/adventure/v2/MasteryCertificateUseModal.test.tsx src/adventure/v2/V2MasteryTowerView.test.tsx src/adventure/v2/inventory/RareMapsTab.test.tsx src/adventure/v2/V2InventoryView.test.tsx`

Expected: all listed tests PASS.

- [ ] **Step 2: 타입 검사 실행**

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 3: 변경 파일 정적 검사**

Run: `git diff --check`

Expected: no output and exit code 0.

- [ ] **Step 4: 요구사항 대조**

다음을 직접 확인한다.

```text
[ ] 인벤토리 소모품 탭에 보유 증서 카드가 나타난다.
[ ] 인벤토리와 숙련의 탑에서 동일한 모달을 연다.
[ ] 인벤토리 모달 조회는 숙련의 탑 GET을 호출하지 않는다.
[ ] 두 사용 모드와 기존 POST 경제 기록이 유지된다.
[ ] 성공 후 두 화면의 보유량과 숙련 상태가 갱신된다.
[ ] 기존 사용자 변경 파일은 커밋에 포함하지 않는다.
```

- [ ] **Step 5: 검증 보완 커밋**

검증 중 코드 수정이 있었을 때만 해당 파일을 명시적으로 스테이징한다.

```bash
git add src/lib/server/masteryCertificateStatus.ts src/lib/server/masteryCertificateStatus.test.ts src/app/api/v2/me/mastery-certificates/route.ts src/app/api/v2/me/mastery-certificates/route.test.ts src/app/api/v2/me/inventory/route.ts src/app/api/v2/me/inventory/route.test.ts src/adventure/v2/MasteryCertificateUseModal.tsx src/adventure/v2/MasteryCertificateUseModal.test.tsx src/adventure/v2/V2MasteryTowerView.tsx src/adventure/v2/V2MasteryTowerView.test.tsx src/adventure/v2/V2InventoryView.tsx src/adventure/v2/V2InventoryView.test.tsx src/adventure/v2/inventory/RareMapsTab.tsx src/adventure/v2/inventory/RareMapsTab.test.tsx
git commit -m "test: verify mastery certificate modal flow"
```
