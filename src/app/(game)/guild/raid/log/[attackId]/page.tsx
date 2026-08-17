import { GuildRaidAttackLogView } from "@/adventure/v2/guild/GuildRaidAttackLogView";

export default async function GuildRaidAttackLogPage({
  params,
}: {
  params: Promise<{ attackId: string }>;
}) {
  const { attackId } = await params;

  return <GuildRaidAttackLogView attackId={attackId} />;
}
