import { V2ArenaTournamentReplayView } from "@/adventure/v2/V2ArenaTournamentReplayView";

export default async function ArenaTournamentReplayPage({
  params,
}: {
  params: Promise<{ seasonId: string; matchId: string }>;
}) {
  const { seasonId, matchId } = await params;
  return (
    <V2ArenaTournamentReplayView seasonId={seasonId} matchId={matchId} />
  );
}
