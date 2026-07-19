import { GameIcon } from "@/adventure/v2/GameIcon";

export function BattleOutcomeBadge({
  outcome,
  size = "md",
}: {
  outcome: "win" | "lose";
  size?: "md" | "lg";
}) {
  const won = outcome === "win";

  return (
    <span
      className={`inline-flex items-center justify-center gap-1.5 font-bold tracking-wide ${
        size === "lg" ? "text-xl" : "text-base"
      } ${
        won
          ? "text-emerald-700 dark:text-emerald-300"
          : "text-rose-700 dark:text-rose-300"
      }`}
    >
      <GameIcon
        name={won ? "Trophy" : "Skull"}
        size={size === "lg" ? 24 : 19}
        weight="duotone"
      />
      {won ? "승리" : "패배"}
    </span>
  );
}
