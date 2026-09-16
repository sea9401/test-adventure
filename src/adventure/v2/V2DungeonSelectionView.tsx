"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudLightning, Sparkle } from "@phosphor-icons/react";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SURFACE_CARD } from "@/components/ui/surfaces";

type DungeonStatus = { unlocked: boolean; attemptsLeft: number; active?: unknown; state?: { active?: unknown } };
const DUNGEONS = [
  { name: "폭풍 원정", api: "/api/v2/storm-expedition", href: "/battle/storm-expedition", description: "항로를 선택하며 폭풍 장비와 재료를 수집합니다.", unlock: "심해 폐허 최심부 돌파 후 입장 가능", Icon: CloudLightning },
  { name: "태초의 성소", api: "/api/v2/sanctuary-dungeon", href: "/battle/sanctuary", description: "일자 경로를 돌파하며 레벨업 성장을 돕는 문장을 수집합니다.", unlock: "미개척지 해금 이후 입장 가능", Icon: Sparkle },
] as const;

export function V2DungeonSelectionView() {
  const router = useRouter();
  const [statuses, setStatuses] = useState<Record<string, DungeonStatus>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    for (const dungeon of DUNGEONS) {
      void fetch(dungeon.api, { cache: "no-store", signal: controller.signal }).then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error("load_failed");
        if (!controller.signal.aborted) {
          setStatuses((previous) => ({ ...previous, [dungeon.api]: data }));
          setErrors((previous) => ({ ...previous, [dungeon.api]: false }));
        }
      }).catch(() => { if (!controller.signal.aborted) setErrors((previous) => ({ ...previous, [dungeon.api]: true })); });
    }
    return () => controller.abort();
  }, [reload]);
  return <PageShell className={SURFACE_CARD}>
    <SubViewHeader title="던전" onBack={() => router.push("/battle")} />
    <p className="text-sm">던전마다 하루 3회 입장할 수 있습니다. 입장 횟수는 매일 00:00에 초기화되며 서로 공유하지 않습니다.</p>
    {DUNGEONS.map(({ Icon, ...dungeon }) => {
      const status = statuses[dungeon.api];
      const active = status?.active ?? status?.state?.active;
      return <Card key={dungeon.api} padding="md" className="space-y-3">
        <h2 className="flex items-center gap-2 font-bold"><Icon size={23} weight="duotone" aria-hidden />{dungeon.name}</h2>
        <p className="text-sm">{dungeon.description}</p>
        {errors[dungeon.api] ? <div role="alert"><p>던전 정보를 불러오지 못했습니다.</p><Button onClick={() => setReload((value) => value + 1)}>다시 불러오기</Button></div>
          : !status ? <p role="status">입장 정보를 불러오는 중...</p>
          : <>
            <p className="text-sm">{status.unlocked ? `남은 입장 ${status.attemptsLeft} / 3회` : dungeon.unlock}</p>
            <Button aria-label={`${dungeon.name} 입장`} variant="primary" disabled={!status.unlocked || (!active && status.attemptsLeft === 0 && dungeon.href !== "/battle/storm-expedition")} onClick={() => router.push(dungeon.href)}>{active ? "진행 중인 던전 계속하기" : status.attemptsLeft === 0 && dungeon.href === "/battle/storm-expedition" ? "연습 모드 이용" : "던전 입장"}</Button>
          </>}
      </Card>;
    })}
  </PageShell>;
}
