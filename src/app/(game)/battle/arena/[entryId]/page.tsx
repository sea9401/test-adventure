import { V2ArenaReplayView } from "@/adventure/v2/V2ArenaReplayView";

// /battle/arena/[entryId] — 아레나 전투 상세/리플레이.
export default async function ArenaReplayPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  return <V2ArenaReplayView entryId={entryId} />;
}
