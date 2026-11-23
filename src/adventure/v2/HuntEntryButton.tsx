import Link from "next/link";
import { Sword } from "@phosphor-icons/react/dist/ssr";
import { buttonClassName } from "@/components/ui/Button";

/** 모험 홈의 주 행동. 홈에서 가장 자주 하는 일인 사냥으로 바로 보낸다. */
export function HuntEntryButton() {
  return (
    <Link
      href="/battle/dungeon"
      className={buttonClassName({
        variant: "primary",
        size: "lg",
        fullWidth: true,
        className: "min-h-14 gap-2 rounded-xl text-lg font-bold",
      })}
    >
      <Sword size={22} weight="bold" aria-hidden />
      사냥터로 가기
    </Link>
  );
}
