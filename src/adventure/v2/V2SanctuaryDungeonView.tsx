"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import type { Gender } from "@/adventure/profile/avatars";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import { EMBLEM_LABELS, type Emblem } from "@/adventure/data/v2/emblems";
import { SANCTUARY_NAME, SANCTUARY_NODES, sanctuaryNode, sanctuaryChoices, type SanctuaryState } from "@/adventure/data/v2/sanctuaryDungeon";
import { ReplayBattleScene } from "./ReplayBattleScene";
import { useRefreshGameState } from "./GameStateRefreshContext";

type Status = { ok: boolean; unlocked: boolean; attemptsLeft: number; state: SanctuaryState; error?: string };
type Result = Partial<Status> & { success?: boolean; finalClear?: boolean; failed?: boolean; withdrawn?: boolean; droppedEmblem?: Emblem | null; gainedEmblems?: Emblem[]; replay?: ReplayPayload; playerName?: string; gender?: string; startPlayerHp?: number; enemyName?: string };
const ERRORS: Record<string, string> = {
  locked: "미개척지 해금 이후 입장할 수 있습니다.", no_attempts: "오늘의 입장 횟수를 모두 사용했습니다.",
  already_active: "진행 중인 던전이 있습니다.", no_active: "진행 중인 던전이 없습니다.",
  stale_state: "진행 상태가 변경되었습니다. 갱신된 경로를 확인해 주세요.",
  choice_required: "먼저 현재 지점의 효과를 선택해 주세요.", invalid_choice: "선택할 수 없는 효과입니다.",
  battle_required: "현재 지점의 전투를 완료해 주세요.", unauthorized: "로그인 상태를 확인해 주세요.",
};
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

  async function act(action: string, choiceId?: string) {
    if (!status || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/v2/sanctuary-dungeon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(choiceId ? { choiceId } : {}), expectedRevision: status.state.revision }) });
      const data = await response.json();
      if (data.state) setStatus(data);
      if (!response.ok || !data.ok) throw new Error(ERRORS[data.error] ?? "요청을 처리하지 못했습니다. 다시 시도해 주세요.");
      setResult(data); setWithdraw(false);
      if (data.gainedEmblems?.length) await refreshGameState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청을 처리하지 못했습니다.");
    } finally { inFlight.current = false; setBusy(false); }
  }
  const active = status?.state.active;
  const node = active ? sanctuaryNode(active) : null;
  return <PageShell className={SURFACE_CARD}>
    <SubViewHeader title={SANCTUARY_NAME} onBack={() => router.push("/battle/dungeons")} />
    <Card className="space-y-2 text-sm">
      <p>미개척지 해금 이후 입장 · 하루 3회 · 폭풍 원정과 입장 횟수 별도</p>
      <p>일반 전투 문장 드롭 5% · 정예·수호자 15% · 최종 보스 1개 확정</p>
      <p>문장 등급 확률: 1등급 89% · 2등급 10% · 3등급 1%. 종류별 확률은 동일합니다.</p>
      <p>문장은 임시 전리품으로 보관됩니다. 귀환하거나 최종 보스를 처치하면 획득하며, 패배하면 이번 탐험의 임시 문장을 잃습니다.</p>
    </Card>
    {error && <Card role="alert" className="space-y-2"><p>{error}</p><Button disabled={busy} onClick={() => setReload((value) => value + 1)}>다시 불러오기</Button></Card>}
    {!status && !error && <p role="status">던전 정보를 불러오는 중...</p>}
    {status && <>
      <p className="text-sm font-semibold">남은 입장 {status.attemptsLeft} / 3회 · 누적 클리어 {status.state.clears}회</p>
      {!status.unlocked ? <Card>미개척지를 해금하면 태초의 성소에 입장할 수 있습니다.</Card>
        : !active ? <Button variant="primary" fullWidth disabled={busy || status.attemptsLeft <= 0} onClick={() => void act("start")}>성소 입장</Button> : null}
      <ol aria-label="성소 진행 경로" className="space-y-1">
        {SANCTUARY_NODES.map((step, index) => <li key={step.id} aria-current={active?.currentNodeId === step.id ? "step" : undefined} className={`${SURFACE_INSET} flex items-center gap-2 px-3 py-2 text-sm`}>
          <span>{index + 1}.</span><span>{step.name}</span>
          {active?.currentNodeId === step.id ? <strong className="ml-auto text-violet-700 dark:text-violet-300">현재</strong> : active?.completedNodeIds.includes(step.id) ? <span className="ml-auto">완료</span> : null}
        </li>)}
      </ol>
      {active && node && <Card padding="md" className="space-y-3">
        <h2 className="font-bold">{node.name}{(node.encounterCount ?? 1) > 1 ? ` · ${active.encounterIndex + 1}/${node.encounterCount}전` : ""}</h2>
        <p className="text-sm">HP {active.hp.toLocaleString()} / {active.maxHp.toLocaleString()} · MP {active.mp.toLocaleString()} / {active.maxMp.toLocaleString()}</p>
        {node.kind === "battle" ? <Button variant="primary" fullWidth disabled={busy} onClick={() => void act("fight")}>전투 시작</Button>
          : <div className="grid gap-2">{sanctuaryChoices(active).map((choice) => <Button className="flex-col items-start text-left" key={choice.id} disabled={busy} onClick={() => void act("choose", choice.id)}><span>{choice.name}</span><span className="text-xs font-normal">{choice.description}</span></Button>)}</div>}
        <p className="text-sm font-semibold">임시 문장 {status.state.pendingEmblems.length}개</p>
        <EmblemList items={status.state.pendingEmblems} />
        {withdraw ? <div className={`${SURFACE_INSET} space-y-2 p-3`}><p className="text-sm">임시 문장을 받고 이번 탐험을 종료할까요? 사용한 입장 횟수는 돌아오지 않습니다.</p><div className="flex gap-2"><Button disabled={busy} variant="primary" onClick={() => void act("withdraw")}>보상 받고 귀환</Button><Button disabled={busy} onClick={() => setWithdraw(false)}>취소</Button></div></div>
          : <Button disabled={busy} onClick={() => setWithdraw(true)}>귀환</Button>}
      </Card>}
    </>}
    {result && (result.success !== undefined || result.withdrawn) && <Card role="status" className="space-y-2">
      <h2 className="font-bold">{result.finalClear ? "성소 클리어!" : result.failed ? "전투 패배" : result.withdrawn ? "귀환 완료" : `${result.enemyName} 처치`}</h2>
      {result.failed && <p>이번 탐험의 임시 문장을 잃었습니다.</p>}
      {result.gainedEmblems && result.gainedEmblems.length > 0 ? <><p>문장 {result.gainedEmblems.length}개를 획득했습니다.</p><EmblemList items={result.gainedEmblems} /><Button onClick={() => router.push("/character/emblems")}>문장 확인</Button></> : result.droppedEmblem ? <><p>임시 문장 획득</p><EmblemList items={[result.droppedEmblem]} /></> : null}
    </Card>}
    {result?.replay && <ReplayBattleScene payload={result.replay} startPlayerHp={result.startPlayerHp} playerName={result.playerName ?? "모험가"} gender={(result.gender ?? "male1") as Gender} exp={0} maxExp={1} playerSubtitle={SANCTUARY_NAME} outcome={result.success ? "win" : "lose"} />}
  </PageShell>;
}
