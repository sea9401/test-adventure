import { V2_LEVEL_CAP } from "@/adventure/data/v2/coreLoopConfig";
import { StatusBanner } from "@/components/ui/StatusBanner";

// 모험가(현재 직업 none)는 사냥 승리로 직업 숙련도가 쌓이지 않는다. 결과 칸의 "—"만으로는
// 이유를 알 수 없어, 사냥 결과 아래에서 첫 직업을 고르는 시점을 함께 알린다.
export function AdventurerMasteryNotice({ jobId }: { jobId: string | null }) {
  if (jobId !== "none") return null;
  return (
    <StatusBanner tone="info" role="note" className="text-sm">
      모험가는 사냥해도 직업 숙련도가 쌓이지 않습니다. 레벨 {V2_LEVEL_CAP}이 되면
      캐릭터 &gt; 성장의 신전에서 첫 직업을 고를 수 있습니다.
    </StatusBanner>
  );
}
