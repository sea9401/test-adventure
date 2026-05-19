import { describe, expect, it } from "vitest";
import { QUESTS } from "../data/quests";
import { npcHasAcceptableQuest, npcQuestBadge } from "./npcAvailability";
import {
  defaultQuestEntry,
  type QuestProgressEntry,
  type QuestProgressMap,
} from "./storage";

const NOW = 1_700_000_000_000;

function mkGetEntry(map: QuestProgressMap) {
  return (id: string): QuestProgressEntry => map[id] ?? defaultQuestEntry();
}

describe("npcHasAcceptableQuest", () => {
  // 스미스는 마을 초반 의뢰 여럿(레벨 1 요구)을 주는 NPC — 안정적인 픽스처.
  const NPC = "village_trainer_smith" as const;

  it("fresh 캐릭터 + 레벨 충족 → true", () => {
    expect(npcHasAcceptableQuest(NPC, 5, mkGetEntry({}), NOW)).toBe(true);
  });

  it("레벨 0(요구 1 미충족) → false", () => {
    expect(npcHasAcceptableQuest(NPC, 0, mkGetEntry({}), NOW)).toBe(false);
  });

  it("해당 NPC 의 모든 의뢰가 active/completed 면 false", () => {
    const map: QuestProgressMap = {};
    for (const q of QUESTS.filter((qq) => qq.giverNpcId === NPC)) {
      map[q.id] = { ...defaultQuestEntry(), state: "active" };
    }
    expect(npcHasAcceptableQuest(NPC, 5, mkGetEntry(map), NOW)).toBe(false);
  });

  it("giverNpcId 없는 의뢰는 누구의 뱃지도 켜지 않는다", () => {
    // village_woodcutter_jimmy 는 의뢰가 있지만, giverNpcId 가 없는 의뢰는 무관해야 함.
    const noGiverIds = QUESTS.filter((q) => !q.giverNpcId).map((q) => q.id);
    expect(noGiverIds.length).toBeGreaterThan(0);
    // 가짜 NPC id — 어떤 의뢰도 매칭되지 않음.
    expect(
      npcHasAcceptableQuest(
        "nonexistent_npc" as never,
        99,
        mkGetEntry({}),
        NOW,
      ),
    ).toBe(false);
  });

  it("hidden:true 의뢰는 뱃지에 안 잡힌다 (인벤/플래그 게이트는 다이얼로그가 직접 판정)", () => {
    const hiddenQuests = QUESTS.filter((q) => q.hidden && q.giverNpcId);
    expect(hiddenQuests.length).toBeGreaterThan(0);
    // 해당 NPC 의 비-히든 의뢰는 모두 막아서 "히든만 남은" 상태를 만든다.
    for (const hq of hiddenQuests) {
      const map: QuestProgressMap = {};
      for (const q of QUESTS.filter(
        (qq) => qq.giverNpcId === hq.giverNpcId && !qq.hidden,
      )) {
        map[q.id] = { ...defaultQuestEntry(), state: "completed", completedCount: 1 };
      }
      // 선행이 있으면 그것도 만족시켜 — 진짜 hidden 플래그만이 차단 사유여야 함.
      if (hq.requiresQuestCompleted) {
        map[hq.requiresQuestCompleted] = {
          ...defaultQuestEntry(),
          state: "completed",
          completedCount: 1,
        };
      }
      expect(
        npcHasAcceptableQuest(hq.giverNpcId!, 99, mkGetEntry(map), NOW),
      ).toBe(false);
    }
  });

  it("unfilial 칭호 보유 시 첫 모험가의 의장은 뱃지에 안 잡힌다", () => {
    // 선행(영혼 결정)을 끝낸 상태 — equip_set 만 available 로 남음.
    const map: QuestProgressMap = {
      "diola-marin-soul-crystals": {
        ...defaultQuestEntry(),
        state: "completed",
        completedCount: 1,
      },
    };
    // 베이스라인: unfilial 없으면 뱃지 켜짐.
    expect(
      npcHasAcceptableQuest("diola_elder", 99, mkGetEntry(map), NOW),
    ).toBe(true);
    // unfilial 보유 시 영구 차단 → 뱃지 꺼짐.
    expect(
      npcHasAcceptableQuest("diola_elder", 99, mkGetEntry(map), NOW, {
        titles: { unfilial: { obtainedAt: 0 } },
      }),
    ).toBe(false);
  });

  it("선행 의뢰 미완료면 후속 의뢰는 뱃지에 안 잡힌다", () => {
    const linked = QUESTS.find(
      (q) => q.giverNpcId && q.requiresQuestCompleted,
    );
    if (!linked || !linked.giverNpcId) {
      // 데이터에 prereq 가 있는 NPC 의뢰가 없으면 케이스 스킵.
      return;
    }
    // 같은 NPC 의 다른 의뢰들도 모두 active 로 막아, "prereq 잠긴 후속만 남은" 상태를 만든다.
    const map: QuestProgressMap = {};
    for (const q of QUESTS.filter(
      (qq) => qq.giverNpcId === linked.giverNpcId && qq.id !== linked.id,
    )) {
      map[q.id] = { ...defaultQuestEntry(), state: "active" };
    }
    expect(
      npcHasAcceptableQuest(linked.giverNpcId, 99, mkGetEntry(map), NOW),
    ).toBe(false);
  });
});

describe("npcQuestBadge", () => {
  // 두루(scavenger) — 송곳니/깃털 두 의뢰가 처음부터 동시에 available 인 NPC.
  const NPC = "dustford_scavenger" as const;

  it("아무 진행 없음 + 수락 가능 → 'available'", () => {
    expect(npcQuestBadge(NPC, 99, mkGetEntry({}), NOW)).toBe("available");
  });

  it("같은 NPC 의뢰 하나라도 active 면 'available' 억제 → null (병렬 의뢰가 더 있어도)", () => {
    const parallelQuests = QUESTS.filter(
      (q) => q.giverNpcId === NPC && !q.hidden && !q.requiresQuestCompleted,
    );
    // 픽스처 가드 — 병렬 의뢰가 2 개 이상이어야 의미 있는 케이스.
    expect(parallelQuests.length).toBeGreaterThanOrEqual(2);
    const [first] = parallelQuests;
    const map: QuestProgressMap = {
      [first.id]: { ...defaultQuestEntry(), state: "active" },
    };
    expect(npcQuestBadge(NPC, 99, mkGetEntry(map), NOW)).toBe(null);
  });

  it("ready 상태 의뢰가 있으면 active/available 보다 우선해서 'ready' 반환", () => {
    const quests = QUESTS.filter((q) => q.giverNpcId === NPC && !q.hidden);
    const [ready, ...rest] = quests;
    const map: QuestProgressMap = {
      [ready.id]: { ...defaultQuestEntry(), state: "ready", progress: 1 },
    };
    // 다른 의뢰는 active 든 available 든 상관없이 ready 가 이긴다.
    if (rest[0]) {
      map[rest[0].id] = { ...defaultQuestEntry(), state: "active" };
    }
    expect(npcQuestBadge(NPC, 99, mkGetEntry(map), NOW)).toBe("ready");
  });

  it("hidden 의뢰는 ready 여도 뱃지에 안 잡힌다 — 스포일 방지", () => {
    const hidden = QUESTS.find((q) => q.hidden && q.giverNpcId);
    if (!hidden || !hidden.giverNpcId) return;
    // 같은 NPC 의 비-히든 의뢰는 전부 completed 로 막아둠.
    const map: QuestProgressMap = {
      [hidden.id]: { ...defaultQuestEntry(), state: "ready", progress: 1 },
    };
    for (const q of QUESTS.filter(
      (qq) => qq.giverNpcId === hidden.giverNpcId && qq.id !== hidden.id,
    )) {
      map[q.id] = { ...defaultQuestEntry(), state: "completed", completedCount: 1 };
    }
    expect(npcQuestBadge(hidden.giverNpcId, 99, mkGetEntry(map), NOW)).toBe(
      null,
    );
  });

  it("모든 의뢰가 completed 면 null", () => {
    const map: QuestProgressMap = {};
    for (const q of QUESTS.filter((qq) => qq.giverNpcId === NPC)) {
      map[q.id] = { ...defaultQuestEntry(), state: "completed", completedCount: 1 };
    }
    expect(npcQuestBadge(NPC, 99, mkGetEntry(map), NOW)).toBe(null);
  });
});
