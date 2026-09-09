"use client";

import { useState } from "react";
import { ArrowRight, Check, Link as LinkIcon, ListChecks, Moon, Plus, Sparkle, SquaresFour, Sword } from "@phosphor-icons/react";
import { SURFACE_CARD, SURFACE_INSET, SURFACE_ACCENT } from "@/components/ui/surfaces";

type Kind = "equipment" | "skills" | "pattern";
type Entry = { id: string; name: string; items: string[]; revision: number };
type Libraries = Record<Kind, Entry[]>;
type Snapshot = Record<Kind, string[]>;
type Combination = { id: string; name: string; equipment: string; skills: string; pattern: string; legacy?: Snapshot };
const kinds: Kind[] = ["equipment", "skills", "pattern"];
const labels: Record<Kind, string> = { equipment: "장비", skills: "스킬", pattern: "전투 패턴" };
const missingLabels: Record<Kind, string> = { equipment: "장비 프리셋 다시 선택", skills: "스킬 프리셋 다시 선택", pattern: "패턴 프리셋 다시 선택" };
const librarySeed: Libraries = {
  equipment: [
    { id: "eq-poison", name: "독왕 세트", items: ["독왕의 양면침", "독왕의 장삼", "점액독수", "독성 걸음", "독왕의 침환", "침식독낭 목걸이"], revision: 1 },
    { id: "eq-mixed", name: "양면침 혼합", items: ["독왕의 양면침", "재앙독 완갑", "부식의 저울", "독성 걸음"], revision: 1 },
  ],
  skills: [
    { id: "skill-poison", name: "독 공격형", items: ["만독개화", "맹독 IV", "만독지배", "민첩 강화", "행운 강화"], revision: 1 },
    { id: "skill-survival", name: "독 생존형", items: ["만독개화", "만독지배", "회복", "MP 회복", "체력 강화"], revision: 1 },
  ],
  pattern: [
    { id: "pattern-raid", name: "토벌 집중", items: ["MP 30% 이하 → MP 회복", "독 유지 → 만독개화", "그 외 → 기본 공격"], revision: 1 },
    { id: "pattern-survival", name: "회복 우선", items: ["HP 40% 이하 → 회복", "MP 30% 이하 → MP 회복", "그 외 → 만독개화"], revision: 1 },
    { id: "pattern-hunt", name: "빠른 사냥", items: ["만독개화 우선", "그 외 → 기본 공격"], revision: 1 },
  ],
};
const comboSeed: Combination[] = [
  { id: "raid", name: "독 토벌", equipment: "eq-poison", skills: "skill-poison", pattern: "pattern-raid" },
  { id: "survival", name: "독 생존", equipment: "eq-mixed", skills: "skill-survival", pattern: "pattern-survival" },
  { id: "hunt", name: "일반 사냥", equipment: "eq-poison", skills: "skill-poison", pattern: "pattern-hunt" },
  { id: "legacy", name: "예전 토벌 세팅", equipment: "", skills: "", pattern: "", legacy: {
    equipment: ["독왕의 장삼", "독왕의 침환"], skills: ["독왕진", "맹독 IV"], pattern: ["독왕진 우선", "그 외 → 기본 공격"],
  } },
];
const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800";
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500 dark:disabled:bg-zinc-800";
const input = "mt-2 block w-full rounded-lg border border-zinc-300 bg-white p-3 text-sm text-zinc-900 outline-offset-2 focus:outline-emerald-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
const muted = "text-sm text-zinc-500 dark:text-zinc-400";

function KindIcon({ kind }: { kind: Kind }) {
  const Icon = kind === "equipment" ? Sword : kind === "skills" ? Sparkle : ListChecks;
  return <Icon size={20} weight="duotone" aria-hidden />;
}

function resolve(combo: Combination, libraries: Libraries): Snapshot | null {
  if (combo.legacy) return structuredClone(combo.legacy);
  const entries = kinds.map(kind => libraries[kind].find(entry => entry.id === combo[kind]));
  if (entries.some(entry => !entry)) return null;
  return { equipment: [...entries[0]!.items], skills: [...entries[1]!.items], pattern: [...entries[2]!.items] };
}

export function LinkedPresetsPreview() {
  const [libraries, setLibraries] = useState<Libraries>(() => structuredClone(librarySeed));
  const [combos, setCombos] = useState<Combination[]>(() => structuredClone(comboSeed));
  const [tab, setTab] = useState<"combinations" | Kind>("combinations");
  const [selected, setSelected] = useState("raid");
  const [entryId, setEntryId] = useState("skill-poison");
  const [applied, setApplied] = useState({ id: "raid", name: "독 토벌", snapshot: resolve(comboSeed[0], librarySeed)! });
  const [notice, setNotice] = useState("스킬 프리셋을 수정한 뒤 연결된 전투 조합을 적용해 보세요.");
  const combo = combos.find(item => item.id === selected)!;
  const entries = tab === "combinations" ? [] : libraries[tab];
  const entry = entries.find(item => item.id === entryId) ?? entries[0];
  const currentCombo = combos.find(item => item.id === applied.id);
  const pendingChange = currentCombo && JSON.stringify(resolve(currentCombo, libraries)) !== JSON.stringify(applied.snapshot);

  function saveCombo(next: Combination, apply: boolean) {
    const snapshot = resolve(next, libraries);
    if (!snapshot) return;
    setCombos(items => items.map(item => item.id === next.id ? next : item));
    if (apply) setApplied({ id: next.id, name: next.name, snapshot });
    setNotice(apply ? `${next.name}의 최신 구성을 적용했습니다.` : `${next.name} 조합을 저장했습니다. 현재 적용 상태는 유지됩니다.`);
  }

  function convertLegacy() {
    if (!combo.legacy) return;
    const next = { ...combo, legacy: undefined };
    const updated = { ...libraries };
    for (const kind of kinds) {
      const id = `${combo.id}-${kind}`;
      updated[kind] = [...libraries[kind], { id, name: `${combo.name} · ${labels[kind]}`, items: [...combo.legacy[kind]], revision: 1 }];
      next[kind] = id;
    }
    setLibraries(updated);
    setCombos(items => items.map(item => item.id === next.id ? next : item));
    setNotice("기존 구성을 보존한 장비·스킬·패턴 프리셋을 만들고 연결했습니다.");
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-bold tracking-widest text-emerald-700 dark:text-emerald-400"><SquaresFour weight="fill" size={16} /> CHARACTER PRESETS</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">나의 전투 조합</h1>
            <p className={`mt-2 ${muted}`}>장비, 스킬, 패턴을 연결해 원하는 세팅으로 전환하세요.</p>
          </div>
          <button className={button} aria-label="밝은 화면과 어두운 화면 전환" onClick={() => document.documentElement.classList.toggle("dark")}><Moon size={18} /></button>
        </div>

        <div className={`${SURFACE_CARD} mb-6 flex flex-wrap items-center justify-between gap-3 p-4`}>
          <div className="flex items-center gap-3"><span className="rounded-lg bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"><Check size={22} weight="bold" /></span><div><p className="text-xs text-zinc-500 dark:text-zinc-400">현재 적용된 조합</p><p className="mt-0.5 font-bold">{applied.name}</p></div></div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">장비 {applied.snapshot.equipment.length}개 · 스킬 {applied.snapshot.skills.length}개 · 패턴 {applied.snapshot.pattern.length}단계{pendingChange && <span className="ml-3 font-semibold text-amber-700 dark:text-amber-400">저장된 구성 변경됨 · 재적용 필요</span>}</div>
        </div>

        <div role="tablist" aria-label="프리셋 종류" className="mb-6 grid grid-cols-4 gap-1 rounded-xl bg-zinc-200 p-1 dark:bg-zinc-900">
          {(["combinations", ...kinds] as const).map(kind => <button key={kind} role="tab" aria-selected={tab === kind} className={`min-h-11 rounded-lg px-2 py-2 text-sm font-semibold transition ${tab === kind ? "bg-white text-emerald-800 shadow-sm dark:bg-zinc-800 dark:text-emerald-300" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"}`} onClick={() => { setTab(kind); if (kind !== "combinations") setEntryId(libraries[kind][0]?.id ?? ""); }}>{kind === "combinations" ? "전투 조합" : labels[kind]}</button>)}
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
          <section className="min-w-0 space-y-3" aria-label={tab === "combinations" ? "저장한 전투 조합" : "저장한 프리셋"}>
            <div className="flex min-h-9 items-center justify-between"><h2 className="text-sm font-bold">{tab === "combinations" ? "저장한 조합" : `${labels[tab]} 프리셋`} <span className="ml-1 text-zinc-400">{tab === "combinations" ? combos.length : entries.length}</span></h2>
              {tab === "combinations" && <button className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400" onClick={() => { const id = `combo-${crypto.randomUUID()}`; const next = { id, name: "새 전투 조합", equipment: libraries.equipment[0]?.id ?? "", skills: libraries.skills[0]?.id ?? "", pattern: libraries.pattern[0]?.id ?? "" }; setCombos([...combos, next]); setSelected(id); }}><Plus size={14} /> 새 조합</button>}
            </div>
            <div className="flex gap-3 overflow-x-auto p-1 pb-2 lg:flex-col lg:overflow-visible">
            {tab === "combinations" ? combos.map(item => <button key={item.id} aria-label={`${item.name} 선택`} className={`${SURFACE_CARD} block w-64 shrink-0 p-4 text-left lg:w-full transition hover:shadow-md ${selected === item.id ? "ring-2 ring-emerald-600 dark:ring-emerald-400" : ""}`} onClick={() => setSelected(item.id)}>
              <div className="mb-3 flex items-center justify-between gap-2"><span className="font-bold">{item.name}</span><span className={`rounded px-2 py-1 text-[11px] font-medium ${item.legacy ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}`}>{item.legacy ? "기존 저장 방식" : applied.id === item.id ? "적용 중" : "연결형"}</span></div>
              {item.legacy ? <p className={muted}>저장 당시의 구성을 그대로 보관하고 있습니다.</p> : <div className="space-y-2">{kinds.map(kind => { const linked = libraries[kind].find(value => value.id === item[kind]); return <div key={kind} className="flex items-center gap-2 text-xs"><span className="text-zinc-400"><KindIcon kind={kind} /></span><span className="w-14 shrink-0 text-zinc-500 dark:text-zinc-400">{labels[kind]}</span><span className={linked ? "truncate text-zinc-700 dark:text-zinc-200" : "font-medium text-amber-700 dark:text-amber-400"}>{linked?.name ?? missingLabels[kind]}</span></div>; })}</div>}
            </button>) : entries.map(item => <button key={item.id} className={`${SURFACE_CARD} block w-64 shrink-0 p-4 text-left lg:w-full ${entry?.id === item.id ? "ring-2 ring-emerald-600 dark:ring-emerald-400" : ""}`} onClick={() => setEntryId(item.id)}><div className="mb-2 flex items-center gap-2"><KindIcon kind={tab} /><strong>{item.name}</strong></div><p className={muted}>{item.items.length}개 구성 · {combos.filter(combo => !combo.legacy && combo[tab] === item.id).length}개 조합에서 사용</p></button>)}
            {tab !== "combinations" && entries.length === 0 && <p className={`${SURFACE_INSET} p-4 text-sm`}>저장된 프리셋이 없습니다. 새로고침하면 샘플이 복원됩니다.</p>}
            </div>
          </section>

          {tab === "combinations" ? <CombinationEditor key={`${combo.id}-${Boolean(combo.legacy)}`} combo={combo} libraries={libraries} onSave={saveCombo} onConvert={convertLegacy} onEdit={(kind, id) => { setTab(kind); setEntryId(id); }} /> : entry ? <LibraryEditor key={`${entry.id}-${entry.revision}`} entry={entry} kind={tab} usedBy={combos.filter(combo => !combo.legacy && combo[tab] === entry.id).map(combo => combo.name)} onSave={next => { setLibraries({ ...libraries, [tab]: libraries[tab].map(item => item.id === next.id ? next : item) }); setNotice(`${next.name} 저장 완료. 연결된 조합은 다음 적용 때 최신 구성을 불러옵니다.`); }} onDelete={() => { setLibraries({ ...libraries, [tab]: libraries[tab].filter(item => item.id !== entry.id) }); setNotice("프리셋을 삭제했습니다. 연결된 조합에서 다른 프리셋을 선택해 주세요."); }} /> : null}
        </div>

        <div role="status" className={`${SURFACE_INSET} mt-6 flex gap-2 p-3 text-sm text-zinc-600 dark:text-zinc-300`}><LinkIcon className="mt-0.5 shrink-0 text-emerald-600" size={18} />{notice}</div>
        <details data-testid="applied-loadout" className={`${SURFACE_CARD} mt-4 p-4`}><summary className="cursor-pointer text-sm font-semibold">현재 적용된 구성 자세히 보기</summary><div className="mt-4 grid gap-4 sm:grid-cols-3">{kinds.map(kind => <div key={kind}><p className="mb-2 text-xs font-bold text-zinc-500">{labels[kind]}</p><p className="text-sm leading-7">{applied.snapshot[kind].join(" · ") || "없음"}</p></div>)}</div></details>
        <p className="mt-6 text-center text-xs leading-5 text-zinc-500 dark:text-zinc-400">검토용 미리보기 · 샘플 구성입니다. 실제 캐릭터에는 반영되지 않으며 새로고침하면 초기화됩니다.</p>
      </div>
    </main>
  );
}

function CombinationEditor({ combo, libraries, onSave, onConvert, onEdit }: {
  combo: Combination; libraries: Libraries; onSave: (combo: Combination, apply: boolean) => void;
  onConvert: () => void; onEdit: (kind: Kind, id: string) => void;
}) {
  const [draft, setDraft] = useState(combo);
  const valid = Boolean(draft.name.trim() && resolve(draft, libraries));
  return <section className={`${SURFACE_CARD} min-w-0 p-5 sm:p-6`} aria-label="전투 조합 편집">
    <div className="mb-5 flex items-center gap-3"><span className="rounded-lg bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><LinkIcon size={22} /></span><div><h2 className="font-bold">{combo.legacy ? "기존 전투 프리셋" : "조합 편집"}</h2><p className={`mt-1 ${muted}`}>{combo.legacy ? "저장된 내용을 보존하며 연결형으로 전환합니다." : "각 프리셋의 최신 저장 내용을 불러옵니다."}</p></div></div>
    <label className="block text-xs font-semibold">조합 이름<input className={input} maxLength={24} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
    <div className="my-5 space-y-4">{kinds.map(kind => {
      const linked = libraries[kind].find(item => item.id === draft[kind]);
      return <div key={kind} className={`${SURFACE_INSET} p-4`}>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold"><KindIcon kind={kind} />{labels[kind]} 프리셋</div>
        {combo.legacy ? <p className="text-sm leading-6">{combo.legacy[kind].join(" · ")}</p> : <>
          <label className="sr-only" htmlFor={`choose-${kind}`}>{labels[kind]} 프리셋 선택</label>
          <select id={`choose-${kind}`} className={`${input} mt-0`} value={linked ? draft[kind] : ""} onChange={event => setDraft({ ...draft, [kind]: event.target.value })}>
            {!linked && <option value="">{missingLabels[kind]}</option>}
            {libraries[kind].map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          {linked && <><p className="mt-3 text-xs leading-6 text-zinc-500 dark:text-zinc-400">{linked.items.join(" · ") || "저장된 항목 없음"}</p><button className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400" onClick={() => onEdit(kind, linked.id)}>이 프리셋 편집 <ArrowRight size={13} /></button></>}
        </>}
      </div>;
    })}</div>
    {combo.legacy ? <button className={`${primary} w-full`} onClick={onConvert}>연결형으로 전환</button> : <><p className="mb-4 text-xs leading-5 text-zinc-500 dark:text-zinc-400">개별 프리셋의 변경은 다음 적용에 반영됩니다. 지금 적용 중인 구성은 자동으로 바뀌지 않습니다.</p><div className="grid grid-cols-2 gap-2"><button className={button} disabled={!valid} onClick={() => onSave({ ...draft, name: draft.name.trim() }, false)}>조합 저장</button><button className={primary} disabled={!valid} onClick={() => onSave({ ...draft, name: draft.name.trim() }, true)}><Check size={17} />저장 후 적용</button></div></>}
  </section>;
}

function LibraryEditor({ entry, kind, usedBy, onSave, onDelete }: {
  entry: Entry; kind: Kind; usedBy: string[]; onSave: (entry: Entry) => void; onDelete: () => void;
}) {
  const [name, setName] = useState(entry.name);
  const [items, setItems] = useState(entry.items);
  const [deleting, setDeleting] = useState(false);
  const choices = [...new Set([...librarySeed[kind].flatMap(item => item.items), ...entry.items])];
  return <section className={`${SURFACE_CARD} p-5 sm:p-6`} aria-label={`${labels[kind]} 프리셋 편집`}>
    <h2 className="mb-2 text-lg font-bold">{labels[kind]} 프리셋 편집</h2><p className={`mb-5 ${muted}`}>항목을 선택하고 저장해 연결된 조합을 업데이트하세요.</p>
    <label className="block text-xs font-semibold">프리셋 이름<input className={input} maxLength={24} value={name} onChange={event => setName(event.target.value)} /></label>
    <div className={`${SURFACE_INSET} my-4 p-3 text-xs leading-6`}><span className="font-bold">사용 중인 전투 조합</span><p className="text-emerald-700 dark:text-emerald-400">{usedBy.join(" · ") || "아직 연결된 조합이 없습니다."}</p></div>
    <fieldset className="mb-5 space-y-2"><legend className="mb-3 text-xs font-semibold">저장할 구성 · {items.length}개 선택</legend>{choices.map(item => <label key={item} className={`${SURFACE_INSET} flex cursor-pointer items-center gap-3 p-3 text-sm`}><input type="checkbox" className="h-4 w-4 shrink-0 accent-emerald-700" checked={items.includes(item)} onChange={() => setItems(items.includes(item) ? items.filter(value => value !== item) : [...items, item])} />{item}</label>)}</fieldset>
    <div className="flex justify-between gap-2"><button className={button} onClick={() => setDeleting(true)}>프리셋 삭제</button><button className={primary} disabled={!name.trim()} onClick={() => onSave({ ...entry, name: name.trim(), items: [...items], revision: entry.revision + 1 })}>프리셋 저장</button></div>
    {deleting && <div role="alert" className={`${SURFACE_ACCENT} mt-4 p-4 text-sm text-amber-950 dark:text-amber-100`}><p className="font-bold">‘{entry.name}’ 프리셋을 삭제할까요?</p><p className="mt-2 leading-6">{usedBy.length ? `${usedBy.join(", ")}에서 사용 중입니다. 삭제하면 연결된 조합에서 프리셋을 다시 선택해야 합니다.` : "저장된 프리셋 구성이 삭제됩니다."}</p><div className="mt-3 flex gap-2"><button className={button} onClick={() => setDeleting(false)}>취소</button><button className={primary} onClick={onDelete}>삭제</button></div></div>}
  </section>;
}
