"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Brain,
  Clover,
  Drop,
  FlowerLotus,
  HandFist,
  Heart,
  Lightning,
  Plus,
  Shield,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import {
  EMBLEM_FUSION_CHANCE,
  EMBLEM_LABELS,
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

// 문장 종류는 아이콘 모양과 이름으로 구분한다. 색은 문장 의미색(바이올렛) 하나만 쓴다.
const KIND_ICONS: Record<EmblemKind, PhosphorIcon> = {
  hp: Heart,
  mp: Drop,
  str: HandFist,
  dex: Lightning,
  vit: Shield,
  int: Brain,
  spi: FlowerLotus,
  luk: Clover,
};

const label = (kind: EmblemKind, grade: EmblemGrade) => `${EMBLEM_LABELS[kind]} ${grade}등급`;
const groupKey = (kind: EmblemKind, grade: EmblemGrade) => `${kind}:${grade}`;

/** 등급 1~5를 별로 표시한다. 읽기 프로그램에는 "n등급"만 읽힌다. */
function GradeStars({ grade }: { grade: EmblemGrade }) {
  return (
    <span className="tabular-nums text-violet-600 dark:text-violet-300">
      <span aria-hidden>{"★".repeat(grade)}</span>
      <span className="sr-only">{grade}등급</span>
    </span>
  );
}

function KindIcon({ kind, size = 20 }: { kind: EmblemKind; size?: number }) {
  const Icon = KIND_ICONS[kind];
  return (
    <span
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-zinc-950 dark:text-violet-300"
    >
      <Icon size={size} weight="duotone" />
    </span>
  );
}

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
  const rows = state ? groupEmblems(state) : [];
  const summary = state ? emblemGrowthSummary(state) : [];
  const equippedCount = state ? state.slots.filter(Boolean).length : 0;
  const noticeFor = (area: Notice["area"]) => notice && notice.area === area
    ? <p role={notice.alert ? "alert" : "status"} className={`text-sm ${notice.alert ? "text-red-600 dark:text-red-400" : "text-zinc-700 dark:text-zinc-200"}`}>{notice.text}</p>
    : null;

  return <PageShell spacing="tight">
    <SubViewHeader title="문장" onBack={() => router.push("/character")} />
    {error && <Card role="alert" className="space-y-2"><p>{error}</p><Button disabled={busy} onClick={() => void load()}>다시 불러오기</Button></Card>}
    {!state && !error && <p role="status">문장 정보를 불러오는 중...</p>}
    {state && <>
      <Card as="section" aria-label="레벨업 성장 요약" padding="md" className="space-y-3">
        <SectionHeading title="레벨업마다 추가로 얻는 능력치" />
        {summary.length > 0 ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {summary.map(({ kind, max }) => (
              <li key={kind} className="flex items-center gap-2">
                <KindIcon kind={kind} size={18} />
                <span className="font-semibold tabular-nums">{EMBLEM_LABELS[kind]} +0~{max}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-zinc-600 dark:text-zinc-300">장착한 문장이 없습니다. 아래 칸을 눌러 문장을 장착해 보세요.</p>}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">장착한 문장마다 레벨업할 때 0부터 최대치 사이에서 정해집니다.</p>
        <details className="text-sm">
          <summary className="min-h-10 cursor-pointer py-2 font-medium text-zinc-700 dark:text-zinc-200">규칙 자세히</summary>
          <div className="space-y-1.5 text-zinc-600 dark:text-zinc-300">
            <p>이미 얻은 능력치는 해제해도 유지되며, 이전 레벨에는 소급하지 않습니다.</p>
            <p>스탯 성장에는 수행 한계치가 적용됩니다. 재전직 시 이번 생애의 추가 성장은 초기화되며, 문장과 등급은 유지됩니다.</p>
            <p>장착 칸 {EMBLEM_SLOT_COUNT}개 · 같은 종류 여러 개 장착 가능 · 모든 문장 거래 불가</p>
            <p>태초의 성소에서 획득합니다. 드롭 등급: 1등급 89% · 2등급 10% · 3등급 1%. 4·5등급은 합성으로만 얻습니다.</p>
          </div>
        </details>
      </Card>

      <Card as="section" aria-label="장착 칸" padding="md" className="space-y-3">
        <SectionHeading title="장착 칸" right={<span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">{equippedCount}/{EMBLEM_SLOT_COUNT}</span>} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg border p-2 text-center transition-colors disabled:opacity-60 ${
                  selected
                    ? "border-violet-500 bg-violet-50 dark:border-violet-400 dark:bg-zinc-950"
                    : item
                      ? "border-zinc-200 bg-zinc-50 hover:border-violet-300 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-violet-700"
                      : "border-dashed border-zinc-300 bg-white hover:border-violet-300 dark:border-zinc-600 dark:bg-zinc-900 dark:hover:border-violet-700"
                }`}
              >
                {item ? <>
                  <KindIcon kind={item.kind} />
                  <span className="text-sm font-semibold">{EMBLEM_LABELS[item.kind]} <GradeStars grade={item.grade} /></span>
                  <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">레벨업당 +0~{emblemGrowthMax(item)}</span>
                </> : <>
                  <Plus size={20} aria-hidden className="text-zinc-400" />
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">빈 칸</span>
                </>}
              </button>
            );
          })}
        </div>
        {pickingSlot != null && (() => {
          const current = slotItem(pickingSlot);
          const candidates = rows.flatMap((row) => row.groups).filter((group) => group.count - group.equipped > 0);
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
                        <KindIcon kind={group.kind} size={18} />
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
      </Card>

      <Card as="section" aria-label="보유 문장" padding="md" className="space-y-3">
        <SectionHeading title="보유 문장" right={<span className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">{state.owned.length}개</span>} />
        {rows.length === 0 && <p className="text-sm text-zinc-600 dark:text-zinc-300">보유 문장이 없습니다. 태초의 성소에서 문장을 얻을 수 있습니다.</p>}
        <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
          {rows.map((row) => {
            const open = row.groups.find((group) => groupKey(group.kind, group.grade) === openGroup);
            return (
              <div key={row.kind} role="group" aria-label={`${EMBLEM_LABELS[row.kind]} 문장`} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <KindIcon kind={row.kind} />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="font-semibold">{EMBLEM_LABELS[row.kind]}</p>
                    <div className="flex flex-wrap gap-2">
                      {row.groups.map((group) => {
                        const key = groupKey(group.kind, group.grade);
                        const selected = openGroup === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            aria-expanded={selected}
                            aria-label={`${label(group.kind, group.grade)}, ${group.count}개 보유${group.equipped ? `, 장착 ${group.equipped}` : ""}${group.fusible ? ", 합성 가능" : ""}`}
                            onClick={() => { setOpenGroup(selected ? null : key); setPickingSlot(null); setNotice(null); }}
                            className={`flex min-h-10 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm transition-colors ${
                              selected
                                ? "border-violet-500 bg-violet-50 dark:border-violet-400 dark:bg-zinc-950"
                                : "border-zinc-200 bg-white hover:border-violet-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-violet-700"
                            }`}
                          >
                            <GradeStars grade={group.grade} />
                            <span className="tabular-nums text-zinc-700 dark:text-zinc-200">×{group.count}</span>
                            {group.equipped > 0 && <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">장착 {group.equipped}</span>}
                            {group.fusible && <span className="text-xs font-medium text-violet-700 dark:text-violet-300">합성 가능</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                {open && <GroupDetail
                  group={open}
                  state={state}
                  busy={busy}
                  slotItem={slotItem}
                  onEquip={(slot) => {
                    const iid = pickEquipInstance(state, open.kind, open.grade);
                    if (iid) void mutate({ action: "equip", iid, slot }, row.kind);
                  }}
                  onFuse={() => {
                    const pair = pickFusionPair(state, open.kind, open.grade);
                    if (pair) void mutate({ action: "fuse", iid: pair.targetIid, materialIid: pair.materialIid }, row.kind);
                  }}
                />}
                {noticeFor(row.kind)}
              </div>
            );
          })}
        </div>
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
