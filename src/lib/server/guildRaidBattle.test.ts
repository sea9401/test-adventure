import { beforeEach, describe, expect, it, vi } from "vitest";

const { lockSaveForUpdate, prepareV2BattleActor, readSave, resolveBattle, toReplayPayload } =
  vi.hoisted(() => ({
    lockSaveForUpdate: vi.fn(),
    prepareV2BattleActor: vi.fn(),
    readSave: vi.fn(),
    resolveBattle: vi.fn(),
    toReplayPayload: vi.fn(),
  }));

vi.mock("@/lib/server/savesKv", () => ({ lockSaveForUpdate, readSave }));
vi.mock("@/lib/server/v2BattlePrep", () => ({ prepareV2BattleActor }));
vi.mock("@/adventure/v2/combat/engine", () => ({ resolveBattle }));
vi.mock("@/adventure/data/v2/replayPayload", () => ({ toReplayPayload }));

import { COOP_BOSSES } from "@/adventure/data/v2/coopBosses";
import { simulateGuildRaidBattle } from "./guildRaidBattle";

describe("길드 토벌전 전투 어댑터", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lockSaveForUpdate.mockResolvedValue({ level: 80 });
    readSave.mockResolvedValue({ name: "레이더" });
    prepareV2BattleActor.mockResolvedValue({
      player: {
        maxHp: 500,
        player: { hp: 17, maxHp: 500, mp: 2, maxMp: 90 },
      },
      skills: { equipped: [] },
    });
    resolveBattle.mockReturnValue({
      turns: 8,
      damageDealtTotal: 1_500_000,
      finalState: {
        enemyHp: COOP_BOSSES.mountain_chief_hard.sharedMaxHp - 12_345,
        playerHp: 380,
      },
    });
    toReplayPayload.mockReturnValue({ enemy: {}, playerMaxHp: 500, playerMaxMp: 90, log: [{}] });
  });

  it("공유 진행 HP와 무관한 보스 원형 체력으로 피해 잠재량을 계산한다", async () => {
    const result = await simulateGuildRaidBattle({
      tx: {} as never,
      userId: "u1",
      bossKind: "mountain_chief_hard",
    });

    expect(result).toMatchObject({
      playerName: "레이더",
      damageDealt: 1_500_000,
      damageTaken: 120,
      diedEarly: false,
      turns: 8,
    });
    const [player, enemy, playerName, context] = resolveBattle.mock.calls[0];
    expect(player).toMatchObject({ hp: 500, mp: 90 });
    expect(enemy.hp).toBe(COOP_BOSSES.mountain_chief_hard.sharedMaxHp);
    expect(playerName).toBe("레이더");
    expect(context).toMatchObject({ isBoss: true, initialEnemyHp: enemy.hp });
    expect(context).toMatchObject({
      damageMeter: { continueAfterDefeat: true, refillHp: enemy.hp },
    });
    expect(context.maxTurns).toBeUndefined();
  });

  it("캐릭터가 없으면 전투를 생성하지 않는다", async () => {
    prepareV2BattleActor.mockResolvedValue(null);

    await expect(
      simulateGuildRaidBattle({ tx: {} as never, userId: "u1", bossKind: "mountain_chief_hard" }),
    ).resolves.toBeNull();
    expect(resolveBattle).not.toHaveBeenCalled();
  });

  it("연습 전투는 캐릭터 저장값을 잠금 없이 읽고 전투 준비에도 읽기 전용을 전달한다", async () => {
    const tx = {} as never;

    await simulateGuildRaidBattle({
      tx,
      userId: "u1",
      bossKind: "mountain_chief_hard",
      lockForUpdate: false,
    });

    expect(lockSaveForUpdate).not.toHaveBeenCalled();
    expect(readSave).toHaveBeenCalledWith(
      tx,
      "u1",
      "character.v2",
      {},
    );
    expect(prepareV2BattleActor).toHaveBeenCalledWith({
      tx,
      userId: "u1",
      charSave: { name: "레이더" },
      lockForUpdate: false,
    });
  });
});
