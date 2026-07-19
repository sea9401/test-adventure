import { GameIcon } from "@/adventure/v2/GameIcon";

export function CoinAmount({
  amount,
  label,
  className = "",
  iconSize = 14,
}: {
  amount: number;
  label?: string;
  className?: string;
  iconSize?: number;
}) {
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${className}`}>
      <GameIcon name="Coins" size={iconSize} />
      {amount.toLocaleString()}
      {label ? ` ${label}` : null}
    </span>
  );
}
