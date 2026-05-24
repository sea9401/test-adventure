// 영지 시뮬레이션 tick — 클라/서버 공용 pure 함수.
// 서버가 state 를 읽거나 쓸 때마다 먼저 applyTick(state, now) 으로 시간 진행 → 권위 결과.
// 클라도 부드러운 표시용으로 동일 함수를 250ms 인터벌로 호출 (서버 응답이 도착하면 결국 truth).
//
// 처리 항목:
//   - 생산 건물(금광/제재소/농장) lastProduce → now 까지의 누적 자원 산입
//   - 훈련 큐 — finishAt 이 now 이하인 항목을 units 로 이전
//   - 영웅 회복 완료(recoveringUntil) / regen tick(lastRegen → currentHp 증가)
//
// 오프라인 누적 캡 — 마지막 활동이 1시간 이상 전이면 lastProduce 를 now-1h 로 압축.

import {
  BUILDINGS,
  HERO_REGEN_INTERVAL,
  HERO_REGEN_PER_TICK,
  MAX_OFFLINE_MS,
  heroAvailable,
  heroMaxHp,
} from "./builderData";
import type { Building, FiefdomState, ResourceBag } from "./types";

export type TickEvent =
  | { kind: "unit_trained"; type: "warrior" | "archer" }
  | { kind: "hero_recovered"; name: string };

export type TickResult = {
  state: FiefdomState;
  events: TickEvent[];
};

export function applyTick(state: FiefdomState, now: number): TickResult {
  // 오프라인 누적 캡 — lastProduce 가 너무 오래되면 압축.
  const buildings: Building[] = state.buildings.map((b) => {
    const def = BUILDINGS[b.type];
    if (!def.produces) return b;
    const last = b.lastProduce ?? now;
    if (now - last > MAX_OFFLINE_MS) return { ...b, lastProduce: now - MAX_OFFLINE_MS };
    return b;
  });

  const resources: ResourceBag = { ...state.resources };
  let changed = false;
  const events: TickEvent[] = [];

  const buildings2 = buildings.map((b) => {
    const def = BUILDINGS[b.type];
    if (!def.produces || !def.interval || !b.lastProduce) return b;
    let lastProduce = b.lastProduce;
    while (now - lastProduce >= def.interval) {
      for (const k of Object.keys(def.produces) as Array<keyof ResourceBag>) {
        resources[k] = (resources[k] ?? 0) + (def.produces[k] ?? 0);
        changed = true;
      }
      lastProduce += def.interval;
    }
    return lastProduce === b.lastProduce ? b : { ...b, lastProduce };
  });

  const units = { ...state.units };
  const remainingQueue: typeof state.trainQueue = [];
  for (const item of state.trainQueue) {
    if (now >= item.finishAt) {
      units[item.type] = (units[item.type] ?? 0) + 1;
      events.push({ kind: "unit_trained", type: item.type });
      changed = true;
    } else {
      remainingQueue.push(item);
    }
  }

  let hero = state.hero;
  if (hero.recoveringUntil > 0 && now >= hero.recoveringUntil) {
    hero = { ...hero, recoveringUntil: 0, currentHp: heroMaxHp(hero), lastRegen: now };
    events.push({ kind: "hero_recovered", name: hero.name });
    changed = true;
  }
  if (heroAvailable(hero, now)) {
    const max = heroMaxHp(hero);
    if (hero.currentHp < max) {
      const elapsed = now - (hero.lastRegen || now);
      const ticks = Math.floor(elapsed / HERO_REGEN_INTERVAL);
      if (ticks > 0) {
        hero = {
          ...hero,
          currentHp: Math.min(max, hero.currentHp + ticks * HERO_REGEN_PER_TICK),
          lastRegen: (hero.lastRegen || now) + ticks * HERO_REGEN_INTERVAL,
        };
        changed = true;
      }
    } else if (hero.lastRegen !== now && hero.currentHp >= max) {
      hero = { ...hero, lastRegen: now };
    }
  }

  if (!changed && remainingQueue.length === state.trainQueue.length && buildings2 === buildings) {
    return { state, events };
  }
  return {
    state: { ...state, resources, buildings: buildings2, units, trainQueue: remainingQueue, hero },
    events,
  };
}
