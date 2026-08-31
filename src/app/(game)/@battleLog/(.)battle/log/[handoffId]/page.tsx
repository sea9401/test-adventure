import { V2BattleLogHandoffView } from "@/adventure/v2/V2BattleLogHandoffView";

export default async function InterceptedBattleLogHandoffPage({
  params,
}: {
  params: Promise<{ handoffId: string }>;
}) {
  const { handoffId } = await params;
  return (
    <V2BattleLogHandoffView handoffId={handoffId} presentation="overlay" />
  );
}
