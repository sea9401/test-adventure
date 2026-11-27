"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  EMBLEM_FUSION_CHANCE,
  EMBLEM_LABELS,
  EMBLEM_GRADE_PCT,
  EMBLEM_SLOT_COUNT,
  emblemGrowthMax,
  parseEmblemState,
  type Emblem,
  type EmblemGrade,
  type EmblemKind,
  type EmblemMutation,
  type EmblemState,
} from "@/adventure/data/v2/emblems";
import {
  EMBLEM_GRADES,
  EmblemBadge,
  EmblemEmptyBadge,
  EmblemGradeStars as GradeStars,
  EmblemGradeSwatch,
} from "./EmblemBadge";
import {
  emblemGrowthSummary,
  groupEmblems,
  pickEquipInstance,
  pickFusionPair,
  type EmblemGroup,
} from "./emblemInventory";

const ERRORS: Record<string, string> = {
  stale_state: "문장 상태가 변경되었습니다. 갱신된 목록에서 다시 선택해 주세요.",
  not_owned: "보유하지 않은 문장입니다.",
  material_equipped: "재료 문장은 장착 해제한 뒤 사용할 수 있습니다.",
  invalid_material: "같은 종류와 등급의 다른 문장이 필요합니다.",
  max_grade: "5등급은 더 이상 합성할 수 없습니다.",
  unauthorized: "로그인 상태를 확인해 주세요.",
  no_character: "먼저 캐릭터를 생성해 주세요.",
  rate_limited: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
};

const label = (kind: EmblemKind, grade: EmblemGrade) => `${EMBLEM_LABELS[kind]} ${grade}등급`;
const groupKey = (kind: EmblemKind, grade: EmblemGrade) => `${kind}:${grade}`;

/** 보유 문장 격자의 한 줄 칸 수. 상세는 누른 문장이 있는 줄 바로 아래에 펼친다. */
const OWNED_COLUMNS = 4;

/** 결과 안내 — 어느 영역에서 일어난 일인지에 붙여 보여 준다. */
type Notice = { text: string; alert?: boolean; area: "slots" | EmblemKind };

export function V2EmblemView() {
  const router = useRouter();
  const [state, setState] = useState<EmblemState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pickingSlot, setPickingSlot] = useState<number | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/v2/emblems", { signal, cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(ERRORS[data.error] ?? "문장 정보를 불러오지 못했습니다.");
      if (!signal?.aborted) { setState(parseEmblemState(data.emblems)); setError(""); }
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : "문장 정보를 불러오지 못했습니다.");
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);

  async function mutate(input: EmblemMutation, area: Notice["area"]) {
    if (!state || inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(""); setNotice(null);
    try {
      const response = await fetch("/api/v2/emblems", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, expectedRevision: state.revision }),
      });
      const data = await response.json();
      if (data.emblems) setState(parseEmblemState(data.emblems));
      if (!response.ok || !data.ok) throw new Error(ERRORS[data.error] ?? "변경하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      if (area === "slots") setPickingSlot(null);
      setNotice({ area, text: input.action === "fuse"
        ? data.success ? "합성에 성공했습니다. 문장 등급이 올랐습니다." : "합성에 실패했습니다. 재료만 소모되고 대상 문장은 유지됩니다."
        : input.action === "equip" ? "문장을 장착했습니다. 다음 레벨업부터 성장 효과가 적용됩니다." : "문장을 해제했습니다. 이미 얻은 능력치는 유지됩니다." });
    } catch (err) {
      setNotice({ area, alert: true, text: err instanceof Error ? err.message : "요청을 처리하지 못했습니다." });
    } finally {
      inFlight.current = false; setBusy(false);
    }
  }

  const slotItem = (index: number): Emblem | undefined =>
    state?.owned.find((entry) => entry.iid === state.slots[index]);
  const groups = state ? groupEmblems(state).flatMap((row) => row.groups) : [];
  const summary = state ? emblemGrowthSummary(state) : [];
  const equippedCount = state ? state.slots.filter(Boolean).length : 0;
  const noticeFor = (area: Notice["area"]) => notice && notice.area === area
    ? <p role={notice.alert ? "alert" : "status"} className={`text-sm ${notice.alert ? "text-red-600 dark:text-red-400" : "text-zinc-700 dark:text-zinc-200"}`}>{notice.text}</p>
    : null;
  // 보유 문장에서 연 묶음의 상세와 결과 안내는 그 문장이 놓인 줄 바로 아래에 펼친다.
  //   합성으로 묶음이 사라졌으면 같은 종류의 첫 문장 줄에, 그 종류가 하나도 없으면 격자 아래에 안내만 남긴다.
  const openIndex = groups.findIndex((group) => groupKey(group.kind, group.grade) === openGroup);
  const open = openIndex >= 0 ? groups[openIndex] : undefined;
  const ownedNoticeKind = notice && notice.area !== "slots" ? notice.area : null;
  const ownedNotice = ownedNoticeKind ? noticeFor(ownedNoticeKind) : null;
  const anchor = openIndex >= 0 ? openIndex : ownedNoticeKind ? groups.findIndex((group) => group.kind === ownedNoticeKind) : -1;
  const expandAfter = anchor < 0 ? -1 : Math.min(groups.length - 1, Math.floor(anchor / OWNED_COLUMNS) * OWNED_COLUMNS + OWNED_COLUMNS - 1);

  return <PageShell spacing="tight">
    <SubViewHeader title="문장" onBack={() => router.push("/character")} />
    {error && <Card role="alert" className="space-y-2"><p>{error}</p><Button disabled={busy} onClick={() => void load()}>다시 불러오기</Button></Card>}
    {!state && !error && <p role="status">문장 정보를 불러오는 중...</p>}
    {state && <>
      <Card as="section" aria-label="장착 칸" padding="md" className="space-y-3">
        <SectionHeading title="장착 칸" right={<span className="text-sm tabular-nums text-zinc-600 dark:text-zinc-300">{equippedCount} / {EMBLEM_SLOT_COUNT}</span>} />
        <div className="grid grid-cols-4 gap-1.5">
          {state.slots.map((_, index) => {
            const item = slotItem(index);
            const selected = pickingSlot === index;
            return (
              <button
                key={index}
                type="button"
                disabled={busy}
                aria-pressed={selected}
                aria-label={`칸 ${index + 1}: ${item ? label(item.kind, item.grade) : "비어 있음"}`}
                onClick={() => { setPickingSlot(selected ? null : index); setOpenGroup(null); setNotice(null); }}
                className={`flex min-w-0 flex-col items-center gap-0.5 rounded-xl border py-1 text-center transition-colors disabled:opacity-60 ${
                  selected ? "border-selected-line bg-primary/10" : "border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {item ? <>
                  <EmblemBadge kind={item.kind} grade={item.grade} size={68} fluid />
                  <span className="text-sm font-bold leading-tight">{EMBLEM_LABELS[item.kind]}</span>
                  <GradeStars grade={item.grade} className="text-xs" />
                  <span className="text-xs tabular-nums text-zinc-600 dark:text-zinc-300">+0~{emblemGrowthMax(item)}</span>
                </> : <>
                  <EmblemEmptyBadge size={68} fluid />
                  <span className="pt-0.5 text-[13px] text-zinc-600 dark:text-zinc-300">빈 칸</span>
                </>}
              </button>
            );
          })}
        </div>
        {pickingSlot != null && (() => {
          const current = slotItem(pickingSlot);
          const candidates = groups.filter((group) => group.count - group.equipped > 0);
          return (
            <div role="group" aria-label={`칸 ${pickingSlot + 1}에 넣을 문장`} className={`${SURFACE_INSET} space-y-2 p-3`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">칸 {pickingSlot + 1}에 넣을 문장</p>
                {current && <Button size="xs" variant="ghost" disabled={busy} aria-label={`칸 ${pickingSlot + 1} 해제`} onClick={() => void mutate({ action: "unequip", slot: pickingSlot }, "slots")}>해제</Button>}
              </div>
              {candidates.length > 0 ? (
                <ul className="divide-y divide-zinc-200 dark:divide-zinc-700">
                  {candidates.map((group) => (
                    <li key={groupKey(group.kind, group.grade)}>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`${label(group.kind, group.grade)} 장착`}
                        onClick={() => {
                          const iid = pickEquipInstance(state, group.kind, group.grade);
                          if (iid) void mutate({ action: "equip", iid, slot: pickingSlot }, "slots");
                        }}
                        className="flex min-h-12 w-full items-center gap-3 py-1.5 text-left hover:bg-white disabled:opacity-60 dark:hover:bg-zinc-900"
                      >
                        <EmblemBadge kind={group.kind} grade={group.grade} size={40} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{EMBLEM_LABELS[group.kind]} <GradeStars grade={group.grade} /></span>
                          <span className="block text-xs tabular-nums text-zinc-500 dark:text-zinc-400">레벨업당 +0~{emblemGrowthMax(group)} · 장착 가능 {group.count - group.equipped}개</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-zinc-600 dark:text-zinc-300">넣을 수 있는 문장이 없습니다. 보유한 문장이 모두 장착 중입니다.</p>}
            </div>
          );
        })()}
        {noticeFor("slots")}
        <section aria-label="레벨업 성장 요약" className="space-y-1 border-t border-zinc-200 pt-2.5 dark:border-zinc-700">
          <h3 className="text-[13px] font-bold">레벨업마다 추가로 얻는 능력치</h3>
          {summary.length > 0
            ? <p className="text-sm tabular-nums">{summary.map(({ kind, max }) => `${EMBLEM_LABELS[kind]} +0~${max}`).join(" · ")}</p>
            : <p className="text-sm text-zinc-600 dark:text-zinc-300">장착한 문장이 없습니다. 위 칸을 눌러 문장을 장착해 보세요.</p>}
          <p className="text-xs text-zinc-600 dark:text-zinc-300">장착한 문장마다 레벨업할 때 0부터 최대치 사이에서 정해집니다.</p>
          <details className="text-sm">
            <summary className="min-h-10 cursor-pointer py-2 font-medium text-zinc-700 dark:text-zinc-200">규칙 자세히</summary>
            <div className="space-y-1.5 text-zinc-600 dark:text-zinc-300">
              <p>이미 얻은 능력치는 해제해도 유지되며, 이전 레벨에는 소급하지 않습니다.</p>
              <p>스탯 성장에는 수행 한계치가 적용됩니다. 재전직 시 이번 생애의 추가 성장은 초기화되며, 문장과 등급은 유지됩니다.</p>
              <p>장착 칸 {EMBLEM_SLOT_COUNT}개 · 같은 종류 여러 개 장착 가능 · 모든 문장 거래 불가</p>
              <p>태초의 성소에서 획득합니다. 드롭 등급: 노말 1등급 {EMBLEM_GRADE_PCT.normal[1]}% · 2등급 {EMBLEM_GRADE_PCT.normal[2]}% · 3등급 {EMBLEM_GRADE_PCT.normal[3]}%, 하드 1등급 {EMBLEM_GRADE_PCT.hard[1]}% · 2등급 {EMBLEM_GRADE_PCT.hard[2]}% · 3등급 {EMBLEM_GRADE_PCT.hard[3]}%. 4·5등급은 합성으로만 얻습니다.</p>
            </div>
          </details>
        </section>
      </Card>

      <Card as="section" aria-label="보유 문장" padding="md" className="space-y-3">
        <SectionHeading title="보유 문장" right={<span className="text-sm tabular-nums text-zinc-600 dark:text-zinc-300">{state.owned.length}개</span>} />
        {groups.length === 0 && <p className="text-sm text-zinc-600 dark:text-zinc-300">보유 문장이 없습니다. 태초의 성소에서 문장을 얻을 수 있습니다.</p>}
        {groups.length > 0 && <>
          <ul aria-label="등급 색" className="flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-zinc-600 dark:text-zinc-300">
            {EMBLEM_GRADES.map((grade) => (
              <li key={grade} className="flex items-center gap-1"><EmblemGradeSwatch grade={grade} />{grade}등급</li>
            ))}
          </ul>
          <div className="grid grid-cols-4 gap-x-1.5 gap-y-3.5">
            {groups.flatMap((group, index) => {
              const key = groupKey(group.kind, group.grade);
              const selected = openGroup === key;
              const cell = (
                <button
                  key={key}
                  type="button"
                  aria-expanded={selected}
                  aria-label={`${label(group.kind, group.grade)}, ${group.count}개 보유${group.equipped ? `, 장착 ${group.equipped}` : ""}${group.fusible ? ", 합성 가능" : ""}`}
                  onClick={() => { setOpenGroup(selected ? null : key); setPickingSlot(null); setNotice(null); }}
                  className={`flex min-w-0 flex-col items-center gap-0.5 rounded-xl border py-1 text-center transition-colors ${
                    selected ? "border-selected-line bg-primary/10" : "border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span className="relative block w-full max-w-[62px]">
                    <EmblemBadge kind={group.kind} grade={group.grade} size={62} fluid />
                    {group.count > 1 && (
                      <span className="absolute -right-1.5 -top-1 flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-zinc-900 px-1 text-xs font-bold tabular-nums text-white dark:bg-zinc-100 dark:text-zinc-900">×{group.count}</span>
                    )}
                  </span>
                  <span className="text-[13px] font-bold leading-tight">{EMBLEM_LABELS[group.kind]}</span>
                  <GradeStars grade={group.grade} className="text-[11px]" />
                  {group.equipped > 0 && <span className="whitespace-nowrap rounded-lg bg-primary px-1 text-[11px] font-bold text-on-primary min-[360px]:px-1.5">{group.count > 1 ? `장착 ${group.equipped}` : "장착 중"}</span>}
                  {group.fusible && <span className="whitespace-nowrap rounded-lg bg-violet-100 px-1 text-[11px] font-bold text-violet-800 min-[360px]:px-1.5 dark:bg-violet-950 dark:text-violet-200">합성 가능</span>}
                </button>
              );
              if (index !== expandAfter) return [cell];
              return [cell, (
                <div key="expanded" className="col-span-full space-y-2">
                  {open && <GroupDetail
                    group={open}
                    state={state}
                    busy={busy}
                    slotItem={slotItem}
                    onEquip={(slot) => {
                      const iid = pickEquipInstance(state, open.kind, open.grade);
                      if (iid) void mutate({ action: "equip", iid, slot }, open.kind);
                    }}
                    onFuse={() => {
                      const pair = pickFusionPair(state, open.kind, open.grade);
                      if (pair) void mutate({ action: "fuse", iid: pair.targetIid, materialIid: pair.materialIid }, open.kind);
                    }}
                  />}
                  {ownedNotice}
                </div>
              )];
            })}
          </div>
        </>}
        {expandAfter < 0 && ownedNotice}
      </Card>
    </>}
  </PageShell>;
}

function GroupDetail({ group, state, busy, slotItem, onEquip, onFuse }: {
  group: EmblemGroup;
  state: EmblemState;
  busy: boolean;
  slotItem: (index: number) => Emblem | undefined;
  onEquip: (slot: number) => void;
  onFuse: () => void;
}) {
  const canEquip = pickEquipInstance(state, group.kind, group.grade) != null;
  const chance = Math.round(EMBLEM_FUSION_CHANCE[group.grade] * 100);
  return (
    <div role="group" aria-label={`${EMBLEM_LABELS[group.kind]} 문장 ${group.grade}등급`} className={`${SURFACE_INSET} space-y-3 p-3 text-sm`}>
      <p className="tabular-nums">
        레벨업당 {EMBLEM_LABELS[group.kind]} +0~{emblemGrowthMax(group)} · 보유 {group.count}개 · 장착 {group.equipped}개
      </p>
      <div className="space-y-1.5">
        <p className="font-semibold">장착할 칸</p>
        {canEquip ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {state.slots.map((_, index) => {
              const current = slotItem(index);
              const now = current ? label(current.kind, current.grade) : "비어 있음";
              return (
                <Button key={index} size="sm" disabled={busy} aria-label={`칸 ${index + 1}에 장착 (지금: ${now})`} onClick={() => onEquip(index)}>
                  칸 {index + 1} · {current ? `${EMBLEM_LABELS[current.kind]} ${current.grade}등급` : "빈 칸"}
                </Button>
              );
            })}
          </div>
        ) : <p className="text-zinc-600 dark:text-zinc-300">이 문장은 모두 장착 중입니다.</p>}
      </div>
      <div className="space-y-1.5 border-t border-zinc-200 pt-3 dark:border-zinc-700">
        <p className="font-semibold">합성</p>
        {group.grade >= 5 ? <p className="text-zinc-600 dark:text-zinc-300">최대 등급입니다.</p> : <>
          <p className="text-zinc-600 dark:text-zinc-300">
            같은 문장 2개로 {group.grade + 1}등급에 도전합니다. 성공률 {chance}%. 실패해도 재료 문장 1개는 소모되고, 대상 문장은 유지됩니다.
          </p>
          {group.fusible
            ? <Button variant="primary" size="sm" disabled={busy} onClick={onFuse}>합성하기</Button>
            : <p className="text-zinc-600 dark:text-zinc-300">장착하지 않은 같은 문장이 1개 더 필요합니다.</p>}
        </>}
      </div>
    </div>
  );
}
