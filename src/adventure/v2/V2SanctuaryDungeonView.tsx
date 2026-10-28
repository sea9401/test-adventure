"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import type { Gender } from "@/adventure/profile/avatars";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import { EMBLEM_BOSS_DROP_COUNT, EMBLEM_DROP_CHANCE, EMBLEM_GRADE_PCT, EMBLEM_LABELS, type Emblem } from "@/adventure/data/v2/emblems";
import {
  SANCTUARY_DAILY_ATTEMPTS, SANCTUARY_DIFFICULTIES, SANCTUARY_DIFFICULTY_LABELS, SANCTUARY_NAME, SANCTUARY_NODES,
  sanctuaryNode, sanctuaryChoices, sanctuaryChoiceCatalog, sanctuaryEnemy,
  type SanctuaryAutoChoiceKind, type SanctuaryDifficulty, type SanctuaryAutoPreferences, type SanctuaryAutoRun, type SanctuaryState,
} from "@/adventure/data/v2/sanctuaryDungeon";
import { confirmGameAction } from "@/components/ui/gameDialog";
import type { StormExpeditionMapNodeId } from "@/adventure/data/v2/stormExpeditionMap";
import { StormExpeditionRouteMap } from "./StormExpeditionRouteMap";
import { StormExpeditionNodeDialog, type StormExpeditionNodeDialogModel } from "./StormExpeditionNodeDialog";
import { ReplayBattleScene } from "./ReplayBattleScene";
import { useRefreshGameState } from "./GameStateRefreshContext";

type Status = { ok: boolean; unlocked: boolean; attemptsLeft: number; state: SanctuaryState; error?: string };
type Result = Partial<Status> & { auto?: { runs: SanctuaryAutoRun[] }; success?: boolean; finalClear?: boolean; failed?: boolean; withdrawn?: boolean; droppedEmblems?: Emblem[]; gainedEmblems?: Emblem[]; replay?: ReplayPayload; playerName?: string; gender?: string; startPlayerHp?: number; enemyName?: string };
const ERRORS: Record<string, string> = {
  locked: "미개척지 해금 이후 입장할 수 있습니다.", no_attempts: "오늘의 입장 횟수를 모두 사용했습니다.",
  already_active: "진행 중인 던전이 있습니다.", no_active: "진행 중인 던전이 없습니다.",
  stale_state: "진행 상태가 변경되었습니다. 갱신된 경로를 확인해 주세요.",
  choice_required: "먼저 현재 지점의 효과를 선택해 주세요.", invalid_choice: "선택할 수 없는 효과입니다.",
  battle_required: "현재 지점의 전투를 완료해 주세요.", unauthorized: "로그인 상태를 확인해 주세요.",
  invalid_difficulty: "선택할 수 없는 난이도입니다.",
};
const DIFFICULTY_OPTIONS = SANCTUARY_DIFFICULTIES.map((key) => ({ key, label: SANCTUARY_DIFFICULTY_LABELS[key] }));
const pct = (value: number) => `${Math.round(value * 100)}%`;
const DIFFICULTY_REQUIRED = "난이도를 먼저 선택해 주세요.";
function RewardRates({ difficulty }: { difficulty: SanctuaryDifficulty | null }) {
  if (!difficulty) return <div data-testid="sanctuary-rates"><p className="font-semibold">입장할 난이도를 선택하면 보상 확률이 표시됩니다.</p></div>;
  const drop = EMBLEM_DROP_CHANCE[difficulty];
  const grade = EMBLEM_GRADE_PCT[difficulty];
  return <div data-testid="sanctuary-rates" className="space-y-1">
    {difficulty === "hard" && <p className="font-semibold">몬스터가 크게 강해집니다. 전투력 최상위권을 위한 난이도입니다.</p>}
    <p>일반 전투 문장 드롭 {pct(drop.early_trash)} · 정예·수호자 {pct(drop.elite)} · 최종 보스 {EMBLEM_BOSS_DROP_COUNT[difficulty]}개 확정</p>
    <p>문장 등급 확률: 1등급 {grade[1]}% · 2등급 {grade[2]}% · 3등급 {grade[3]}%. 종류별 확률은 동일합니다.</p>
  </div>;
}
// 일괄 진행 선호 설정 줄. 제단은 5개 중 3개만 제시되므로 3순위까지 정해야 항상 고를 수 있다.
const AUTO_PREFERENCE_ROWS: { kind: SanctuaryAutoChoiceKind; label: string; ranks: number }[] = [
  { kind: "supply", label: "탐험대 보급품", ranks: 1 },
  { kind: "camp", label: "고요한 샘", ranks: 1 },
  { kind: "altar", label: "태초의 제단", ranks: 3 },
  { kind: "final_prep", label: "최종 정비", ranks: 1 },
];
/** rank 자리에 id를 두고, id가 있던 자리에는 원래 rank 자리 값을 옮긴다. */
function placeAtRank(order: readonly string[], rank: number, id: string): string[] {
  const next = [...order];
  const from = next.indexOf(id);
  if (from < 0 || from === rank) return next;
  [next[rank], next[from]] = [next[from], next[rank]];
  return next;
}
function AutoRunCard({ status, busy, difficulty, onRun }: { status: Status; busy: boolean; difficulty: SanctuaryDifficulty | null; onRun: (preferences: SanctuaryAutoPreferences) => void }) {
  const [preferences, setPreferences] = useState<SanctuaryAutoPreferences>(status.state.autoPreferences);
  const active = status.state.active;
  const runnable = status.unlocked && (active !== null || status.attemptsLeft > 0);
  // 새로 시작하는 탐험이 있으면 난이도를 골라야 한다. 진행 중인 탐험만 남았으면 그 탐험의 난이도를 따른다.
  const needsDifficulty = status.attemptsLeft > 0 && difficulty === null;
  const label = !runnable ? "일괄 진행" : active ? `진행 중인 탐험과 남은 입장 ${status.attemptsLeft}회 일괄 진행` : `남은 입장 ${status.attemptsLeft}회 일괄 진행`;
  return <Card padding="md" className="space-y-3">
    <h2 className="font-bold">일괄 진행</h2>
    <p className="text-sm">{active ? "진행 중인 탐험부터 이어서, " : ""}남은 입장을 {difficulty ? `${SANCTUARY_DIFFICULTY_LABELS[difficulty]} 난이도로` : "선택한 난이도로"} 끝까지 자동으로 진행합니다. 선택 지점에서는 아래 효과를 고르고, 중간에 귀환하지 않습니다.</p>
    <div className="grid gap-2 sm:grid-cols-2">
      {AUTO_PREFERENCE_ROWS.map((row) => {
        const choices = sanctuaryChoiceCatalog(row.kind);
        return Array.from({ length: row.ranks }, (_, rank) => {
          const name = row.ranks > 1 ? `${row.label} ${rank + 1}순위` : row.label;
          return <label key={name} className="flex flex-col gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            {name}
            <select value={preferences[row.kind][rank]} disabled={busy}
              onChange={(event) => setPreferences((current) => ({ ...current, [row.kind]: placeAtRank(current[row.kind], rank, event.target.value) }))}
              className="min-h-10 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
              {choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name} · {choice.description}</option>)}
            </select>
          </label>;
        });
      })}
    </div>
    {runnable && needsDifficulty && <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">{DIFFICULTY_REQUIRED}</p>}
    <Button variant="primary" disabled={!runnable || needsDifficulty || busy} onClick={() => onRun(preferences)}>{label}</Button>
  </Card>;
}
function AutoRunResult({ runs, onOpenEmblems }: { runs: SanctuaryAutoRun[]; onOpenEmblems: () => void }) {
  const gained = runs.flatMap((run) => run.gainedEmblems);
  return <Card role="status" className="space-y-2">
    <h2 className="font-bold">일괄 진행 결과</h2>
    <ul className="space-y-1 text-sm">
      {runs.map((run, index) => <li key={index}>
        {run.cleared ? `${index + 1}회차 ${SANCTUARY_DIFFICULTY_LABELS[run.difficulty]} · 클리어 · 문장 ${run.gainedEmblems.length}개`
          : `${index + 1}회차 ${SANCTUARY_DIFFICULTY_LABELS[run.difficulty]} · ${run.endedAt}에서 패배${run.lostEmblems > 0 ? ` · 임시 문장 ${run.lostEmblems}개 잃음` : ""}`}
      </li>)}
    </ul>
    {gained.length > 0 && <><p>문장 {gained.length}개를 획득했습니다.</p><EmblemList items={gained} /><Button onClick={onOpenEmblems}>문장 확인</Button></>}
  </Card>;
}
function EmblemList({ items }: { items: Emblem[] }) {
  return <div className="flex flex-wrap gap-2">{items.map((item) => <span key={item.iid} className={`${SURFACE_INSET} px-2 py-1 text-sm`}>{EMBLEM_LABELS[item.kind]} 문장 · {item.grade}등급</span>)}</div>;
}

export function V2SanctuaryDungeonView() {
  const router = useRouter();
  const refreshGameState = useRefreshGameState();
  const [status, setStatus] = useState<Status | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [withdraw, setWithdraw] = useState(false);
  const [reload, setReload] = useState(0);
  const [openNodeId, setOpenNodeId] = useState<StormExpeditionMapNodeId | null>(null);
  const [skipReplay, setSkipReplay] = useState(false);
  const [difficulty, setDifficulty] = useState<SanctuaryDifficulty | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v2/sanctuary-dungeon", { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(ERRORS[data.error] ?? "던전 정보를 불러오지 못했습니다.");
      if (!controller.signal.aborted) { setStatus(data); setError(""); }
    }).catch((err) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "던전 정보를 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [reload]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (!status || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/v2/sanctuary-dungeon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra, expectedRevision: status.state.revision }) });
      const data = await response.json();
      if (data.state) setStatus(data);
      if (!response.ok || !data.ok) throw new Error(ERRORS[data.error] ?? "요청을 처리하지 못했습니다. 다시 시도해 주세요.");
      setResult(data); setWithdraw(false); setOpenNodeId(null);
      if (data.gainedEmblems?.length || data.auto?.runs.some((run: SanctuaryAutoRun) => run.gainedEmblems.length > 0)) await refreshGameState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청을 처리하지 못했습니다.");
    } finally { inFlight.current = false; setBusy(false); }
  }
  async function runAuto(preferences: SanctuaryAutoPreferences) {
    if (!status || (status.attemptsLeft > 0 && !difficulty)) return;
    const runs = (status.state.active ? 1 : 0) + status.attemptsLeft;
    const confirmed = await confirmGameAction({
      title: "일괄 진행",
      message: `탐험 ${runs}회를 끝까지 자동으로 진행합니다. ${difficulty && status.attemptsLeft > 0 ? `새로 시작하는 탐험은 ${SANCTUARY_DIFFICULTY_LABELS[difficulty]} 난이도입니다. ` : ""}패배한 탐험은 그 탐험의 임시 문장을 잃습니다.`,
      confirmLabel: "진행",
    });
    if (confirmed) await act("auto", { ...(difficulty ? { difficulty } : {}), preferences });
  }
  const active = status?.state.active;
  const selectedNode = SANCTUARY_NODES.find((entry) => entry.id === openNodeId);
  let dialog: StormExpeditionNodeDialogModel | null = null;
  if (status && selectedNode) {
    if (active?.completedNodeIds.includes(selectedNode.id)) {
      dialog = { kind: "completed", node: selectedNode, summary: ["이미 완료한 지점입니다."] };
    } else if (active?.currentNodeId === selectedNode.id) {
      const node = sanctuaryNode(active);
      dialog = node.kind === "battle"
        ? { kind: "battle", node, encounterIndex: active.encounterIndex, encounterCount: node.encounterCount ?? 1,
            enemyName: sanctuaryEnemy(active).name, rewardLines: [node.encounterKind === "final_boss" ? `문장 ${EMBLEM_BOSS_DROP_COUNT[status.state.difficulty]}개 확정` : "획득 문장은 귀환할 때 정산됩니다."], skipReplay }
        : { kind: "choice", node, choiceKind: node.kind, hp: active.hp, maxHp: active.maxHp, mp: active.mp, maxMp: active.maxMp, choices: sanctuaryChoices(active) };
    } else if (!active && selectedNode.id === SANCTUARY_NODES[0].id) {
      dialog = { kind: "move", node: selectedNode, actionLabel: "성소 입장", routeName: `${difficulty ? SANCTUARY_DIFFICULTY_LABELS[difficulty] : "난이도 미선택"} · 하루 3회 · 입장 후 지점을 차례로 선택하세요.`,
        disabledReason: !status.unlocked ? ERRORS.locked : status.attemptsLeft <= 0 ? ERRORS.no_attempts : !difficulty ? DIFFICULTY_REQUIRED : null };
    } else {
      dialog = { kind: "locked", node: selectedNode, reason: "앞선 지점을 완료한 뒤 진행할 수 있습니다." };
    }
  }
  return <PageShell className={SURFACE_CARD}>
    <SubViewHeader title={SANCTUARY_NAME} onBack={() => router.push("/battle/dungeons")} />
    <Card className="space-y-2 text-sm">
      <p>미개척지 해금 이후 입장 · 하루 3회(노말·하드 공유) · 폭풍 원정과 입장 횟수 별도</p>
      <SegmentedControl ariaLabel="난이도" options={DIFFICULTY_OPTIONS} value={difficulty} onChange={setDifficulty} />
      <RewardRates difficulty={difficulty} />
      <p>문장은 임시 전리품으로 보관됩니다. 귀환하거나 최종 보스를 처치하면 획득하며, 패배하면 이번 탐험의 임시 문장을 잃습니다.</p>
    </Card>
    {error && <Card role="alert" className="space-y-2"><p>{error}</p><Button disabled={busy} onClick={() => setReload((value) => value + 1)}>다시 불러오기</Button></Card>}
    {!status && !error && <p role="status">던전 정보를 불러오는 중...</p>}
    {status && <>
      <p className="text-sm font-semibold">남은 입장 {status.attemptsLeft} / {SANCTUARY_DAILY_ATTEMPTS}회 · 누적 클리어 {status.state.clears}회</p>
      {!status.unlocked && <Card>미개척지를 해금하면 태초의 성소에 입장할 수 있습니다.</Card>}
      {status.unlocked && <AutoRunCard status={status} busy={busy} difficulty={difficulty} onRun={(preferences) => void runAuto(preferences)} />}
      {result?.auto && <AutoRunResult runs={result.auto.runs} onOpenEmblems={() => router.push("/character/emblems")} />}
      <Card padding="md" className="min-w-0 space-y-3">
        <h2 className="font-bold">성소 지도</h2>
        <p className="text-sm">{active ? "현재 원형 아이콘을 선택해 전투나 정비를 진행하세요." : "성소 외곽 아이콘을 선택해 입장하세요."}</p>
        {active && <p className="text-sm">{SANCTUARY_DIFFICULTY_LABELS[status.state.difficulty]} 진행 중 · HP {active.hp.toLocaleString()} / {active.maxHp.toLocaleString()} · MP {active.mp.toLocaleString()} / {active.maxMp.toLocaleString()} · 완료 {active.completedNodeIds.length} / {SANCTUARY_NODES.length}</p>}
        <StormExpeditionRouteMap layout="linear" label="성소 진행 경로" nodes={SANCTUARY_NODES}
          currentNodeId={active?.currentNodeId ?? null} visitedNodeIds={active?.visitedNodeIds ?? []}
          completedNodeIds={active?.completedNodeIds ?? []}
          availableNodeIds={!active && status.unlocked && status.attemptsLeft > 0 ? [SANCTUARY_NODES[0].id] : []}
          plan={null} onNodeOpen={(id) => { if (!busy) setOpenNodeId(id); }} />
      </Card>
      {active && <Card padding="md" className="space-y-3">
        <p className="text-sm font-semibold">임시 문장 {status.state.pendingEmblems.length}개</p>
        <EmblemList items={status.state.pendingEmblems} />
        {withdraw ? <div className={`${SURFACE_INSET} space-y-2 p-3`}><p className="text-sm">임시 문장을 받고 이번 탐험을 종료할까요? 사용한 입장 횟수는 돌아오지 않습니다.</p><div className="flex gap-2"><Button disabled={busy} variant="primary" onClick={() => void act("withdraw")}>보상 받고 귀환</Button><Button disabled={busy} onClick={() => setWithdraw(false)}>취소</Button></div></div>
          : <Button disabled={busy} onClick={() => setWithdraw(true)}>귀환</Button>}
      </Card>}
    </>}
    {result && (result.success !== undefined || result.withdrawn) && <Card role="status" className="space-y-2">
      <h2 className="font-bold">{result.finalClear ? "성소 클리어!" : result.failed ? "전투 패배" : result.withdrawn ? "귀환 완료" : `${result.enemyName} 처치`}</h2>
      {result.failed && <p>이번 탐험의 임시 문장을 잃었습니다.</p>}
      {result.gainedEmblems && result.gainedEmblems.length > 0 ? <><p>문장 {result.gainedEmblems.length}개를 획득했습니다.</p><EmblemList items={result.gainedEmblems} /><Button onClick={() => router.push("/character/emblems")}>문장 확인</Button></> : result.droppedEmblems && result.droppedEmblems.length > 0 ? <><p>임시 문장 획득</p><EmblemList items={result.droppedEmblems} /></> : null}
    </Card>}
    {dialog && <StormExpeditionNodeDialog open model={dialog} busy={busy}
      onClose={() => setOpenNodeId(null)}
      onAction={(action) => {
        if (action.kind === "move" && difficulty) void act("start", { difficulty });
        if (action.kind === "fight") void act("fight");
        if (action.kind === "choose") void act("choose", { choiceId: action.choiceId });
        if (action.kind === "skip_replay") setSkipReplay(action.value);
      }} />}
    {result?.replay && !skipReplay && <ReplayBattleScene payload={result.replay} startPlayerHp={result.startPlayerHp} playerName={result.playerName ?? "모험가"} gender={(result.gender ?? "male1") as Gender} exp={0} maxExp={1} playerSubtitle={SANCTUARY_NAME} outcome={result.success ? "win" : "lose"} />}
  </PageShell>;
}
