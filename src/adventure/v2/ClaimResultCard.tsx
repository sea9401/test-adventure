"use client";

// claim 결과 시각화 패널. 한 줄 텍스트 → 단계별 카드.
//
// 표시 내용:
//   - PvP 토너먼트인 경우: 매치별 row + 챔피언 흐름
//   - 본 병사 전쟁 (PvP): 양측 power bar 비교 + 사상자 + 약탈
//   - NPC 일기토: 챔피언 격파/패배 + 턴 수
//
// 결과 객체 (ClaimResponse) 받아서 분기 렌더링.

export type ClaimResult = {
  ok?: boolean;
  error?: string;
  won?: boolean;
  raceLost?: boolean;
  pvp?: boolean;
  championName?: string;
  turns?: number;
  hpBefore?: number;
  hpAfter?: number;
  maxHp?: number;
  requiredStamina?: number;
  troopBattle?: {
    duelWonByAttacker?: boolean;
    attackerPower: number;
    defenderPower: number;
    attackerCasualties: number;
    defenderCasualties: number;
    plunderStone: number;
  } | null;
  tournament?: {
    matches: {
      attackerName: string;
      defenderName: string;
      winnerSide: "attacker" | "defender";
      turns: number;
    }[];
    attackerLineupCount: number;
    defenderLineupCount: number;
  } | null;
};

export function ClaimResultCard({
  result,
  outpostName,
  onClose,
}: {
  result: ClaimResult;
  outpostName: string;
  onClose: () => void;
}) {
  // 에러 응답 (ok=false) — 한 줄 에러 카드.
  if (!result.ok) {
    const reason =
      result.error === "out_of_stamina"
        ? `스태미너 부족 (필요 ${result.requiredStamina})`
        : result.error === "not_enough_scrolls"
          ? "주문서 부족 — 마탑에서 수확 필요"
          : result.error === "scroll_not_applicable_npc"
            ? "주문서는 PvP 전용 (NPC 일기토 불가)"
            : result.error === "already_yours"
              ? "이미 자기 길드 점령"
              : (result.error ?? "알 수 없는 오류");
    return (
      <ResultShell
        title="점령 실패"
        outpostName={outpostName}
        accent="red"
        onClose={onClose}
      >
        <div className="text-sm text-red-700 dark:text-red-300">{reason}</div>
      </ResultShell>
    );
  }

  // 결과 머리말 — ✓ / △ (race) / ✗
  const winLabel = result.raceLost
    ? "△ 다른 세력이 먼저 점령 — 스태미너만 차감"
    : result.won
      ? "✓ 점령 성공"
      : "✗ 점령 실패";
  const accent: "green" | "amber" | "red" =
    result.raceLost ? "amber" : result.won ? "green" : "red";

  return (
    <ResultShell
      title={winLabel}
      outpostName={outpostName}
      accent={accent}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        {result.tournament && (
          <TournamentSection tournament={result.tournament} />
        )}
        {result.troopBattle && <TroopBattleSection battle={result.troopBattle} />}
        {!result.tournament && !result.troopBattle && (
          <DuelOnlySection
            championName={result.championName ?? "?"}
            turns={result.turns ?? 0}
            won={!!result.won}
            hpBefore={result.hpBefore}
            hpAfter={result.hpAfter}
            maxHp={result.maxHp}
          />
        )}
      </div>
    </ResultShell>
  );
}

function ResultShell({
  title,
  outpostName,
  accent,
  onClose,
  children,
}: {
  title: string;
  outpostName: string;
  accent: "green" | "amber" | "red";
  onClose: () => void;
  children: React.ReactNode;
}) {
  const accentBorder = {
    green: "border-emerald-300 dark:border-emerald-700",
    amber: "border-amber-300 dark:border-amber-700",
    red: "border-red-300 dark:border-red-700",
  }[accent];
  const accentBg = {
    green: "bg-emerald-50/50 dark:bg-emerald-950/30",
    amber: "bg-amber-50/50 dark:bg-amber-950/30",
    red: "bg-red-50/50 dark:bg-red-950/30",
  }[accent];
  return (
    <div className={`rounded-md border ${accentBorder} ${accentBg}`}>
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-zinc-500">{outpostName}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
        >
          닫기
        </button>
      </div>
      <div className="px-3 py-2">{children}</div>
    </div>
  );
}

function TournamentSection({
  tournament,
}: {
  tournament: NonNullable<ClaimResult["tournament"]>;
}) {
  const totalTurns = tournament.matches.reduce((s, m) => s + m.turns, 0);
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
        1단계 — 영웅 토너먼트 ({tournament.attackerLineupCount} vs{" "}
        {tournament.defenderLineupCount}) · 총 {totalTurns}턴
      </div>
      <div className="space-y-0.5">
        {tournament.matches.map((m, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded bg-white/50 px-2 py-1 text-xs dark:bg-zinc-900/50"
          >
            <span className="font-mono text-zinc-500">m{i + 1}</span>
            <span className={m.winnerSide === "attacker" ? "font-medium" : ""}>
              {m.attackerName}
            </span>
            <span className="text-zinc-400">vs</span>
            <span className={m.winnerSide === "defender" ? "font-medium" : ""}>
              {m.defenderName}
            </span>
            <span
              className={
                m.winnerSide === "attacker"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }
            >
              {m.winnerSide === "attacker" ? "← 공격자" : "수비자 →"}
            </span>
            <span className="font-mono text-zinc-400">{m.turns}턴</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TroopBattleSection({
  battle,
}: {
  battle: NonNullable<ClaimResult["troopBattle"]>;
}) {
  const total = battle.attackerPower + battle.defenderPower;
  const aPct =
    total > 0 ? Math.round((battle.attackerPower / total) * 100) : 50;
  const dPct = 100 - aPct;
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
        2단계 — 본 병사 전쟁
        {battle.duelWonByAttacker !== undefined && (
          <span className="ml-2 text-zinc-500">
            일기토 {battle.duelWonByAttacker ? "승" : "패"} → 보정 적용
          </span>
        )}
      </div>
      <div className="overflow-hidden rounded border border-zinc-300 dark:border-zinc-700">
        <div className="flex h-3 text-[0px]">
          <div
            className="bg-emerald-500/70"
            style={{ width: `${aPct}%` }}
          />
          <div className="bg-red-500/70" style={{ width: `${dPct}%` }} />
        </div>
        <div className="grid grid-cols-2 gap-2 px-2 py-1 text-xs">
          <div>
            <div className="font-medium">공격자 power {battle.attackerPower}</div>
            <div className="text-zinc-500">
              사상 {battle.attackerCasualties}명
            </div>
          </div>
          <div className="text-right">
            <div className="font-medium">수비자 power {battle.defenderPower}</div>
            <div className="text-zinc-500">
              사상 {battle.defenderCasualties}명
            </div>
          </div>
        </div>
      </div>
      {battle.plunderStone > 0 && (
        <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          약탈 광물 +{battle.plunderStone} (승자측)
        </div>
      )}
    </div>
  );
}

function DuelOnlySection({
  championName,
  turns,
  won,
  hpBefore,
  hpAfter,
  maxHp,
}: {
  championName: string;
  turns: number;
  won: boolean;
  hpBefore?: number;
  hpAfter?: number;
  maxHp?: number;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
        NPC 일기토 — {championName}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-zinc-500">{won ? "격파" : "패배"}</div>
          <div className="font-mono">{turns}턴</div>
        </div>
        {maxHp !== undefined && (
          <div className="text-right">
            <div className="text-zinc-500">영웅 hp</div>
            <div className="font-mono">
              {hpBefore ?? "?"} → {hpAfter ?? "?"} / {maxHp}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
