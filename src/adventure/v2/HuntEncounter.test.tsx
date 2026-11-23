import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import {
  HuntEncounter,
  HuntEncounterPlaceholder,
  huntEncounterEnemy,
} from "./HuntEncounter";

const replay = {
  enemy: {
    name: "풀뱀",
    hp: 60,
    image: "/images/monster/v2/field-grass-snake.webp",
    element: "wind",
  },
  playerMaxHp: 245,
  playerMaxMp: 98,
  log: [
    { kind: "info", text: "풀뱀이(가) 나타났다!" },
    {
      kind: "hp_bar",
      text: "",
      playerHp: 200,
      playerMaxHp: 245,
      enemyHp: 22,
      enemyMaxHp: 60,
    },
  ],
} as unknown as ReplayPayload;

describe("방금 싸운 상대 정보", () => {
  it("이기면 상대 HP를 0으로, 그림과 속성은 전투 기록에서 가져온다", () => {
    expect(huntEncounterEnemy("풀뱀", true, replay)).toEqual({
      name: "풀뱀",
      image: "/images/monster/v2/field-grass-snake.webp",
      element: "wind",
      hp: 0,
      maxHp: 60,
    });
  });

  it("지면 전투 기록의 마지막 HP를 남은 HP로 쓴다", () => {
    expect(huntEncounterEnemy("풀뱀", false, replay)).toMatchObject({
      hp: 22,
      maxHp: 60,
    });
  });

  it("전투 기록이 없어도 이름만으로 그린다", () => {
    expect(huntEncounterEnemy("풀뱀", true, undefined)).toEqual({
      name: "풀뱀",
      image: undefined,
      element: undefined,
      hp: null,
      maxHp: null,
    });
  });
});

describe("방금 전투 카드", () => {
  function render(won: boolean) {
    return renderToStaticMarkup(
      <HuntEncounter
        label="방금 전투"
        won={won}
        player={{
          name: "시안모험가",
          subtitle: "Lv.2 · 모험가",
          gender: "male1",
          hp: 237,
          maxHp: 245,
          mp: 95,
          maxMp: 98,
        }}
        enemy={huntEncounterEnemy("풀뱀", won, replay)}
      />,
    );
  }

  it("나와 싸운 몬스터를 마주 보게 놓고 승패를 적는다", () => {
    const html = render(true);

    expect(html).toContain("방금 전투");
    expect(html).toContain("승리");
    expect(html.indexOf("시안모험가")).toBeLessThan(html.indexOf("풀뱀"));
    expect(html).toContain("field-grass-snake.webp");
    expect(html).toContain("바람 속성");
    expect(html).toContain("237 / 245");
    expect(html).toContain("95 / 98");
    expect(html).toContain("0 / 60");
  });

  it("졌을 때는 패배와 상대의 남은 HP를 보여 준다", () => {
    const html = render(false);

    expect(html).toContain("패배");
    expect(html).not.toContain("승리");
    expect(html).toContain("22 / 60");
  });

  it("아직 사냥하지 않았으면 무엇이 나올지 한 줄로 안내한다", () => {
    const html = renderToStaticMarkup(<HuntEncounterPlaceholder />);

    expect(html).toContain("사냥하면 여기에 싸운 몬스터와 결과가 나옵니다");
    expect(html).not.toContain("<img");
  });
});
