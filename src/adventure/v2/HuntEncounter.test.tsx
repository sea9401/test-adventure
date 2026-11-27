import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HuntEncounter, HuntEncounterPlaceholder } from "./HuntEncounter";

describe("방금 전투 한 줄", () => {
  it("승패와 싸운 상대의 이름을 글자로만 알려 준다", () => {
    const html = renderToStaticMarkup(
      <HuntEncounter label="방금 전투" won enemyName="풀뱀" />,
    );

    expect(html).toContain("방금 전투");
    expect(html).toContain("승리");
    expect(html).toContain("풀뱀");
    // 몬스터 그림과 HP는 전투 기록 화면에서만 본다.
    expect(html).not.toContain("<img");
    expect(html).not.toContain("HP");
  });

  it("졌을 때는 패배라고 적는다", () => {
    const html = renderToStaticMarkup(
      <HuntEncounter label="방금 전투" won={false} enemyName="풀뱀" />,
    );

    expect(html).toContain("패배");
    expect(html).not.toContain("승리");
  });

  it("아직 사냥하지 않았으면 무엇이 나올지 한 줄로 안내한다", () => {
    const html = renderToStaticMarkup(<HuntEncounterPlaceholder />);

    expect(html).toContain("사냥하면 여기에 전투 결과가 나옵니다");
    expect(html).not.toContain("<img");
  });
});
