import { buildJobManualIndex } from "../jobManualModel";
import { H2, P } from "./primitives";
import { JobWikiIndex } from "./JobWikiIndex";

export function JobCodexContent() {
  return (
    <>
      <H2>전체 직업 도감</H2>
      <P>
        전투·생활 직업의 계보와 성장 수치, 배울 수 있는 모든 스킬을 현재 해금
        여부와 관계없이 공개합니다. 아래 정보는 실제 직업·스킬 데이터에서 바로
        가져오므로 게임 내 수치와 함께 갱신됩니다.
      </P>
      <JobWikiIndex entries={buildJobManualIndex()} />
    </>
  );
}
