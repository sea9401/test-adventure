import { describe, expect, it } from "vitest";
import { previewPlayerWindCurrent, settlePlayerWindCurrent } from "./windCurrentCast";
const player = {windCurrentDamagePctPerStack:20,windCurrentMpRestorePctPerStack:1,windCurrentRebound:true,windCurrentShieldPctPerStack:5,windCurrentReleaseEvades:1};
const gather = {kind:"gather"} as const;
const release = {kind:"release",damagePctPerStack:20,hastePctPerStack:15} as const;
const cast = (current:number, ready:boolean, skill = gather as typeof gather | typeof release, landed = true) =>
  settlePlayerWindCurrent(previewPlayerWindCurrent({windCurrent:current,windCurrentReboundReady:ready},player,skill),landed,1000);
describe("바람 패시브 시전 정산", () => {
  it("실제 기류 증가량만 MP로 회수하고 상한에서는 회복하지 않는다", () => {
    expect(cast(0,false).mpRestore).toBe(10);
    expect(cast(0,false).shieldGain).toBe(50);
    expect(cast(2,true).shieldGain).toBe(50);
    expect(cast(3,false).shieldGain).toBe(0);
    expect(cast(1,false,gather,false).shieldGain).toBe(0);
    expect(cast(2,true).mpRestore).toBe(10);
    expect(cast(3,false).mpRestore).toBe(0);
    expect(cast(1,false,gather,false).mpRestore).toBe(0);
  });
  it("3개 소비 후 다음 생성 주문이 2개를 얻고 준비를 해제한다", () => {
    const spent = cast(3,false,release);
    expect(spent.stacks).toEqual({windCurrent:0,windCurrentReboundReady:true});
    expect(spent.mpRestore).toBe(0);
    expect(spent.hastePct).toBe(45);
    expect(spent.guaranteedEvades).toBe(1);
    expect(cast(2,false,release).guaranteedEvades).toBe(0);
    expect(cast(3,false,release,false).guaranteedEvades).toBe(0);
    const next = cast(0,true);
    expect(next.stacks).toEqual({windCurrent:2,windCurrentReboundReady:false});
    expect(next.mpRestore).toBe(20);
    expect(next.shieldGain).toBe(100);
    expect(cast(2,false,release).stacks.windCurrentReboundReady).toBe(false);
  });
  it("일반 주문과 빗나감은 준비를 유지하며 생성 패시브 없이는 작동하지 않는다", () => {
    const ordinary = previewPlayerWindCurrent({windCurrent:0,windCurrentReboundReady:true},player);
    expect(settlePlayerWindCurrent(ordinary,true,1000).stacks.windCurrentReboundReady).toBe(true);
    expect(cast(0,true,gather,false).stacks.windCurrentReboundReady).toBe(true);
    const noCore = previewPlayerWindCurrent({}, {...player,windCurrentDamagePctPerStack:undefined}, gather);
    expect(settlePlayerWindCurrent(noCore,true,1000).mpRestore).toBe(0);
    expect(settlePlayerWindCurrent(noCore,true,1000).stacks.windCurrent).toBeUndefined();
  });
});
