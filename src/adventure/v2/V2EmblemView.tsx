"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { EMBLEM_FUSION_CHANCE, EMBLEM_LABELS, emblemGrowthMax, parseEmblemState, type Emblem, type EmblemMutation, type EmblemState } from "@/adventure/data/v2/emblems";
import { sortEmblemInventory, type EmblemSort } from "./emblemInventory";

const ERRORS: Record<string, string> = {
  stale_state: "문장 상태가 변경되었습니다. 갱신된 목록에서 다시 선택해 주세요.",
  not_owned: "보유하지 않은 문장입니다.",
  material_equipped: "재료 문장은 장착 해제한 뒤 사용할 수 있습니다.",
  invalid_material: "같은 종류와 등급의 다른 문장을 재료로 선택해 주세요.",
  max_grade: "5등급은 더 이상 합성할 수 없습니다.",
  unauthorized: "로그인 상태를 확인해 주세요.",
  no_character: "먼저 캐릭터를 생성해 주세요.",
  rate_limited: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
};
function name(item: Emblem): string { return `${EMBLEM_LABELS[item.kind]} 문장 · ${item.grade}등급`; }

export function V2EmblemView() {
  const router = useRouter();
  const [state, setState] = useState<EmblemState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [slot, setSlot] = useState(0);
  const [targetIid, setTargetIid] = useState<string | null>(null);
  const [materialIid, setMaterialIid] = useState("");
  const [sort, setSort] = useState<EmblemSort>("kind");
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

  async function mutate(input: EmblemMutation) {
    if (!state || inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/v2/emblems", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, expectedRevision: state.revision }),
      });
      const data = await response.json();
      if (data.emblems) setState(parseEmblemState(data.emblems));
      if (!response.ok || !data.ok) throw new Error(ERRORS[data.error] ?? "변경하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setTargetIid(null);
      setNotice(input.action === "fuse"
        ? data.success ? "합성에 성공했습니다. 문장 등급이 올랐습니다." : "합성에 실패했습니다. 재료만 소모되고 대상 문장은 유지됩니다."
        : input.action === "equip" ? "문장을 장착했습니다. 다음 레벨업부터 성장 효과가 적용됩니다." : "문장을 해제했습니다. 이미 얻은 능력치는 유지됩니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청을 처리하지 못했습니다.");
    } finally {
      inFlight.current = false; setBusy(false);
    }
  }

  const target = state?.owned.find((item) => item.iid === targetIid);
  const materials = target ? state!.owned.filter((item) => item.iid !== target.iid && item.kind === target.kind && item.grade === target.grade && !state!.slots.includes(item.iid)) : [];
  const material = materials.find((item) => item.iid === materialIid) ?? materials[0];
  const inventory = sortEmblemInventory(state?.owned ?? [], sort);

  return <PageShell className={SURFACE_CARD}>
    <SubViewHeader title="문장" onBack={() => router.push("/character")} />
    <Card className="space-y-2 text-sm">
      <p>장착 중 레벨업할 때 문장마다 0~최대치의 능력치를 추가로 얻습니다. 이미 얻은 능력치는 해제해도 유지되며, 이전 레벨에는 소급하지 않습니다.</p>
      <p>스탯 성장에는 수행 한계치가 적용됩니다. 재전직 시 이번 생애의 추가 성장은 초기화되며, 문장과 등급은 유지됩니다.</p>
      <p>전용 슬롯 4개 · 동일 종류 중복 장착 가능 · 모든 문장 거래 불가</p>
      <p className="text-zinc-600 dark:text-zinc-300">태초의 성소에서 획득합니다. 드롭 등급: 1등급 89% · 2등급 10% · 3등급 1%. 4·5등급은 합성으로만 획득합니다.</p>
    </Card>
    {error && <Card role="alert" className="space-y-2"><p>{error}</p><Button disabled={busy} onClick={() => void load()}>다시 불러오기</Button></Card>}
    {notice && <Card role="status">{notice}</Card>}
    {!state && !error && <p role="status">문장 정보를 불러오는 중...</p>}
    {state && <>
      <section aria-label="문장 장착 슬롯" className="space-y-2">
        <h2 className="font-bold">장착 슬롯</h2>
        <p className="text-sm">장착할 슬롯을 선택한 다음 보유 문장의 장착 버튼을 눌러 주세요.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {state.slots.map((iid, index) => {
            const item = state.owned.find((entry) => entry.iid === iid);
            return <Card key={index} className="space-y-2">
              <Button fullWidth aria-label={`슬롯 ${index + 1} 선택`} aria-pressed={slot === index} variant={slot === index ? "primary" : "secondary"} disabled={busy} onClick={() => setSlot(index)}>슬롯 {index + 1}</Button>
              <p className="text-sm">{item ? name(item) : "비어 있음"}</p>
              {item && <><p className="text-xs">레벨업당 +0~{emblemGrowthMax(item)}</p><Button size="xs" disabled={busy} aria-label={`슬롯 ${index + 1} 해제`} onClick={() => void mutate({ action: "unequip", slot: index })}>해제</Button></>}
            </Card>;
          })}
        </div>
      </section>
      {target && <Card className="space-y-3" aria-label="문장 합성 확인">
        <h2 className="font-bold">{name(target)} 합성</h2>
        <p className="text-sm">성공률 {Math.round(EMBLEM_FUSION_CHANCE[target.grade] * 100)}%. 성공 시 {target.grade + 1}등급으로 성장합니다. 실패해도 재료 문장은 소모되며, 대상 문장은 유지됩니다.</p>
        {material ? <>
          <label className="block text-sm">소모할 재료 문장
            <select className={`${SURFACE_INSET} mt-1 block min-h-11 w-full p-2`} value={material.iid} disabled={busy} onChange={(event) => setMaterialIid(event.target.value)}>
              {materials.map((item) => <option key={item.iid} value={item.iid}>{name(item)} · 문장 {state.owned.indexOf(item) + 1}</option>)}
            </select>
          </label>
          <Button variant="warning" disabled={busy} onClick={() => void mutate({ action: "fuse", iid: target.iid, materialIid: material.iid })}>합성 실행</Button>
        </> : <p className="text-sm">장착하지 않은 동일 종류·동일 등급 문장이 1개 필요합니다.</p>}
        <Button className="ml-2" disabled={busy} onClick={() => setTargetIid(null)}>취소</Button>
      </Card>}
      <section className="space-y-2" aria-label="보유 문장">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">보유 문장 · {state.owned.length}개</h2>
          <label className="flex items-center gap-2 text-sm">
            문장 정렬
            <select className={`${SURFACE_INSET} min-h-11 p-2`} value={sort} onChange={(event) => setSort(event.target.value as EmblemSort)}>
              <option value="kind">종류순</option>
              <option value="grade">등급순</option>
              <option value="acquired">획득순</option>
            </select>
          </label>
        </div>
        {sort !== "acquired" && <p className="text-xs text-zinc-600 dark:text-zinc-300">
          {sort === "kind" ? "같은 종류에서는 높은 등급부터 표시합니다." : "높은 등급부터, 같은 등급에서는 종류별로 표시합니다."}
        </p>}
        {state.owned.length === 0 && <Card>보유 문장이 없습니다. 태초의 성소에서 문장을 획득해 보세요.</Card>}
        {inventory.map(({ item, number }) => {
          const equippedSlot = state.slots.indexOf(item.iid);
          return <Card key={item.iid} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{name(item)}</h3>
                {equippedSlot >= 0 && <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                  장착 중 · 슬롯 {equippedSlot + 1}
                </span>}
              </div>
              <p className="text-sm">레벨업당 {EMBLEM_LABELS[item.kind]} +0~{emblemGrowthMax(item)} · 거래 불가</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-300">문장 {number}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button disabled={busy || state.slots[slot] === item.iid} aria-label={`문장 ${number} 장착`} onClick={() => void mutate({ action: "equip", iid: item.iid, slot })}>장착</Button>
              <Button disabled={busy || item.grade === 5} aria-label={`문장 ${number} 합성 대상 선택`} onClick={() => { setTargetIid(item.iid); setMaterialIid(""); }}>{item.grade === 5 ? "최대 등급" : "합성"}</Button>
            </div>
          </Card>;
        })}
      </section>
    </>}
  </PageShell>;
}
