import { useState } from "react";
import { Coins, Sparkle } from "@phosphor-icons/react";
import type { DonationKind } from "@/adventure/data/guildLodge";

function DonateRow({
  kind,
  label,
  icon,
  balance,
  busy,
  onDonate,
}: {
  kind: DonationKind;
  label: string;
  icon: React.ReactNode;
  balance: number;
  busy: boolean;
  onDonate: (kind: DonationKind, amount: number) => void;
}) {
  const [raw, setRaw] = useState("");
  const parsed = (() => {
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
    return n;
  })();
  const tooMuch = parsed !== null && parsed > balance;
  const canDonate = !busy && parsed !== null && !tooMuch;

  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex w-20 items-center gap-1 text-sm">
        {icon}
        <span>{label}</span>
      </span>
      <input
        type="number"
        min={1}
        step={1}
        inputMode="numeric"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="수량"
        disabled={busy}
        className="w-24 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      <span className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
        잔고 {balance.toLocaleString()}
      </span>
      <button
        type="button"
        onClick={() => {
          if (canDonate && parsed !== null) {
            onDonate(kind, parsed);
            setRaw("");
          }
        }}
        disabled={!canDonate}
        className="ml-auto rounded-md border border-violet-700 bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        봉납
      </button>
    </div>
  );
}

export function DonateForm({
  myStardust,
  myGold,
  busy,
  onDonate,
}: {
  myStardust: number;
  myGold: number;
  busy: boolean;
  onDonate: (kind: DonationKind, amount: number) => void;
}) {
  return (
    <section className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        봉납하기
      </h4>
      <div className="space-y-1.5">
        <DonateRow
          kind="stardust"
          label="별빛"
          icon={
            <Sparkle
              size={14}
              weight="fill"
              className="text-violet-500 dark:text-violet-400"
            />
          }
          balance={myStardust}
          busy={busy}
          onDonate={onDonate}
        />
        <DonateRow
          kind="gold"
          label="골드"
          icon={
            <Coins size={14} weight="fill" className="text-yellow-500" />
          }
          balance={myGold}
          busy={busy}
          onDonate={onDonate}
        />
      </div>
      <p className="text-[11px] italic text-zinc-500 dark:text-zinc-400">
        봉납은 회수할 수 없습니다.
      </p>
    </section>
  );
}
