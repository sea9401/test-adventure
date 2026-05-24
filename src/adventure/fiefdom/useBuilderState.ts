"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BUILDINGS,
  GRID_H,
  GRID_W,
  HERO_RECOVERY_MS,
  HERO_REGEN_INTERVAL,
  HERO_REGEN_PER_TICK,
  MAX_OFFLINE_MS,
  SAVE_INTERVAL_MS,
  SAVE_KEY,
  UNITS,
  computeArmyPower,
  defaultFiefdomState,
  defaultHero,
  heroAtk,
  heroAvailable,
  heroMaxHp,
  makeEnemy,
  xpForNext,
} from "./builderData";
import { getTerritory, isAdjacent, type TerritoryId } from "./territoryMap";
import type {
  Building,
  BuildingType,
  FiefdomState,
  ResourceBag,
  UnitBag,
  UnitType,
} from "./types";

// 프로토타입(game.js) 의 전역 state / tick / 전투 로직을 React 훅으로 이식.
// localStorage 자체 저장(SAVE_KEY="fiefdom_preview_v1") — 본토 sync 와 격리.

const TICK_MS = 250;

function defaultState(): FiefdomState {
  return defaultFiefdomState();
}

function loadState(): FiefdomState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<FiefdomState>;
    const merged: FiefdomState = { ...defaultState(), ...parsed };
    // 오프라인 누적 캡 — 생산 건물의 lastProduce 가 너무 오래 됐으면 1시간 전으로 압축.
    const now = Date.now();
    merged.buildings = (merged.buildings ?? []).map((b) => {
      const def = BUILDINGS[b.type];
      if (!def.produces) return b;
      const last = b.lastProduce ?? now;
      return {
        ...b,
        lastProduce: now - last > MAX_OFFLINE_MS ? now - MAX_OFFLINE_MS : last,
      };
    });
    if (!merged.hero) merged.hero = defaultHero();
    return merged;
  } catch {
    return defaultState();
  }
}

function canAfford(resources: ResourceBag, cost: Partial<ResourceBag>): boolean {
  for (const k of Object.keys(cost) as Array<keyof ResourceBag>) {
    if ((resources[k] ?? 0) < (cost[k] ?? 0)) return false;
  }
  return true;
}

function pay(resources: ResourceBag, cost: Partial<ResourceBag>): ResourceBag {
  const out = { ...resources };
  for (const k of Object.keys(cost) as Array<keyof ResourceBag>) {
    out[k] = (out[k] ?? 0) - (cost[k] ?? 0);
  }
  return out;
}

function buildingAt(buildings: Building[], x: number, y: number): Building | undefined {
  return buildings.find((b) => {
    const s = BUILDINGS[b.type].size;
    return x >= b.x && x < b.x + s && y >= b.y && y < b.y + s;
  });
}

function canPlace(buildings: Building[], type: BuildingType, x: number, y: number): boolean {
  const s = BUILDINGS[type].size;
  if (x < 0 || y < 0 || x + s > GRID_W || y + s > GRID_H) return false;
  for (let dx = 0; dx < s; dx++) {
    for (let dy = 0; dy < s; dy++) {
      if (buildingAt(buildings, x + dx, y + dy)) return false;
    }
  }
  return true;
}

export type AttackResult = {
  won: boolean;
  lost: UnitBag;
  loot?: ResourceBag;
  heroFell: boolean;
  heroHpAfter: number;
  xpAwarded: number;
  leveledUp: boolean;
  enemyLevel: number;
};

export type BuilderApi = {
  state: FiefdomState;
  /** 마지막 전투 결과 — 로그 라인으로 표시. UI 가 직접 읽고 표시. */
  lastLog: string[];
  // 빌딩
  selectedBuild: BuildingType | null;
  setSelectedBuild: (t: BuildingType | null) => void;
  canAffordBuild: (t: BuildingType) => boolean;
  canPlaceAt: (t: BuildingType, x: number, y: number) => boolean;
  placeBuilding: (t: BuildingType, x: number, y: number) => void;
  // 훈련
  trainUnit: (t: UnitType) => void;
  canAffordUnit: (t: UnitType) => boolean;
  hasBarracks: boolean;
  // 전투
  attackTerritory: (targetId: TerritoryId) => void;
  // 영웅
  renameHero: (name: string) => void;
  // 초기화
  reset: () => void;
};

export function useBuilderState(): BuilderApi {
  const [state, setState] = useState<FiefdomState>(() => defaultState());
  const [selectedBuild, setSelectedBuild] = useState<BuildingType | null>(null);
  const [lastLog, setLastLog] = useState<string[]>([]);
  const initialized = useRef(false);

  const pushLog = useCallback((msg: string) => {
    setLastLog((prev) => {
      const time = new Date().toLocaleTimeString();
      return [`[${time}] ${msg}`, ...prev].slice(0, 30);
    });
  }, []);

  // 초기 로드 — useEffect 안에서 localStorage 접근(SSR 안전).
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    setState(loadState());
  }, []);

  // 자동 저장.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    }, SAVE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [state]);

  // Tick — 자원 생산 / 훈련 / 영웅 regen / 회복 완료 처리.
  useEffect(() => {
    const id = window.setInterval(() => {
      setState((prev) => {
        const now = Date.now();
        let changed = false;
        const resources = { ...prev.resources };
        const buildings = prev.buildings.map((b) => {
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

        const units = { ...prev.units };
        const remainingQueue: typeof prev.trainQueue = [];
        for (const item of prev.trainQueue) {
          if (now >= item.finishAt) {
            units[item.type] = (units[item.type] ?? 0) + 1;
            changed = true;
            pushLog(`${UNITS[item.type].name} 훈련 완료`);
          } else {
            remainingQueue.push(item);
          }
        }

        let hero = prev.hero;
        if (hero.recoveringUntil > 0 && now >= hero.recoveringUntil) {
          hero = {
            ...hero,
            recoveringUntil: 0,
            currentHp: heroMaxHp(hero),
            lastRegen: now,
          };
          changed = true;
          pushLog(`✨ ${hero.name}이(가) 회복하여 돌아왔습니다!`);
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

        if (!changed && remainingQueue.length === prev.trainQueue.length) return prev;
        return { ...prev, resources, buildings, units, trainQueue: remainingQueue, hero };
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [pushLog]);

  const canAffordBuild = useCallback(
    (t: BuildingType) => canAfford(state.resources, BUILDINGS[t].cost),
    [state.resources],
  );
  const canPlaceAt = useCallback(
    (t: BuildingType, x: number, y: number) => canPlace(state.buildings, t, x, y),
    [state.buildings],
  );

  const placeBuilding = useCallback(
    (t: BuildingType, x: number, y: number) => {
      setState((prev) => {
        const def = BUILDINGS[t];
        if (def.max && prev.buildings.filter((b) => b.type === t).length >= def.max) {
          pushLog(`${def.name}은 더 이상 지을 수 없습니다.`);
          return prev;
        }
        if (!canPlace(prev.buildings, t, x, y)) {
          pushLog("이 위치에는 지을 수 없습니다.");
          return prev;
        }
        if (!canAfford(prev.resources, def.cost)) {
          pushLog("자원이 부족합니다.");
          return prev;
        }
        const b: Building = { type: t, x, y };
        if (def.produces) b.lastProduce = Date.now();
        pushLog(`${def.name} 건설 완료`);
        return {
          ...prev,
          resources: pay(prev.resources, def.cost),
          buildings: [...prev.buildings, b],
        };
      });
      setSelectedBuild(null);
    },
    [pushLog],
  );

  const canAffordUnit = useCallback(
    (t: UnitType) => canAfford(state.resources, UNITS[t].cost),
    [state.resources],
  );
  const hasBarracks = state.buildings.some((b) => b.type === "barracks");

  const trainUnit = useCallback(
    (t: UnitType) => {
      setState((prev) => {
        const def = UNITS[t];
        if (!prev.buildings.some((b) => b.type === "barracks")) {
          pushLog("병영을 먼저 지으세요.");
          return prev;
        }
        if (!canAfford(prev.resources, def.cost)) {
          pushLog("자원이 부족합니다.");
          return prev;
        }
        const now = Date.now();
        const lastFinish =
          prev.trainQueue.length > 0
            ? prev.trainQueue[prev.trainQueue.length - 1].finishAt
            : now;
        pushLog(`${def.name} 훈련 예약`);
        return {
          ...prev,
          resources: pay(prev.resources, def.cost),
          trainQueue: [...prev.trainQueue, { type: t, finishAt: lastFinish + def.trainTime }],
        };
      });
    },
    [pushLog],
  );

  const attackTerritory = useCallback(
    (targetId: TerritoryId) => {
      setState((prev) => {
        if (targetId === "player") {
          pushLog("자기 영지는 공격할 수 없습니다.");
          return prev;
        }
        if (prev.defeatedTerritories.includes(targetId)) {
          pushLog("이미 정복한 영지입니다.");
          return prev;
        }
        if (!isAdjacent("player", targetId)) {
          pushLog("인접하지 않은 영지는 공격할 수 없습니다.");
          return prev;
        }
        const target = getTerritory(targetId);
        const totalUnits = prev.units.warrior + prev.units.archer;
        const now = Date.now();
        const heroIn = heroAvailable(prev.hero, now);
        if (totalUnits === 0 && !heroIn) {
          pushLog("공격할 부대도 영웅도 없습니다.");
          return prev;
        }
        const enemy = makeEnemy(target.level);
        const army = computeArmyPower(prev.units);
        const heroPower = heroIn
          ? { atk: heroAtk(prev.hero), hp: prev.hero.currentHp }
          : { atk: 0, hp: 0 };
        const my = { atk: army.atk + heroPower.atk, hp: army.hp + heroPower.hp };
        const en = computeArmyPower(enemy.army);

        const timeToKillEnemy = my.atk > 0 ? en.hp / my.atk : Infinity;
        const timeToKillMe = en.atk > 0 ? my.hp / en.atk : Infinity;
        const battleTime = Math.min(timeToKillEnemy, timeToKillMe);
        const won = timeToKillEnemy <= timeToKillMe;
        const dmgTaken = en.atk * battleTime;
        const lossRatio = my.hp > 0 ? Math.min(1, dmgTaken / my.hp) : 1;

        const survivors: UnitBag = {
          warrior: Math.max(0, Math.floor(prev.units.warrior * (1 - lossRatio))),
          archer: Math.max(0, Math.floor(prev.units.archer * (1 - lossRatio))),
        };
        const lost: UnitBag = {
          warrior: prev.units.warrior - survivors.warrior,
          archer: prev.units.archer - survivors.archer,
        };

        let hero = prev.hero;
        let heroFell = false;
        if (heroIn) {
          const heroDmg = Math.floor(lossRatio * hero.currentHp);
          const hpAfter = Math.max(0, hero.currentHp - heroDmg);
          if (hpAfter <= 0) {
            hero = { ...hero, currentHp: 0, recoveringUntil: now + HERO_RECOVERY_MS };
            heroFell = true;
          } else {
            hero = { ...hero, currentHp: hpAfter };
          }
        }

        let resources = prev.resources;
        let defeatedTerritories = prev.defeatedTerritories;
        const xpAmount = won ? target.level * 50 : target.level * 15;

        let leveled = false;
        hero = { ...hero, xp: hero.xp + xpAmount };
        while (hero.xp >= xpForNext(hero.level)) {
          hero = { ...hero, xp: hero.xp - xpForNext(hero.level), level: hero.level + 1 };
          leveled = true;
        }
        if (leveled) hero = { ...hero, currentHp: heroMaxHp(hero) };

        if (won) {
          const loot = enemy.loot;
          resources = { ...resources };
          for (const k of Object.keys(loot) as Array<keyof ResourceBag>) {
            resources[k] = (resources[k] ?? 0) + loot[k];
          }
          defeatedTerritories = [...defeatedTerritories, targetId];
          pushLog(
            `🎉 ${target.name} 정복! 약탈 🪙${loot.gold} 🪵${loot.wood} 🌾${loot.food} | 손실 ⚔️${lost.warrior} 🏹${lost.archer}${
              heroFell ? ` | 💀 ${hero.name} 쓰러짐` : ""
            }${leveled ? ` | 🌟 Lv.${hero.level} 달성!` : ""}`,
          );
        } else {
          pushLog(
            `💀 ${target.name} 공격 실패. 손실 ⚔️${lost.warrior} 🏹${lost.archer}${heroFell ? ` | ${hero.name} 쓰러짐` : ""}`,
          );
        }

        return { ...prev, resources, units: survivors, hero, defeatedTerritories };
      });
    },
    [pushLog],
  );

  const renameHero = useCallback((name: string) => {
    const trimmed = name.trim().slice(0, 20);
    if (!trimmed) return;
    setState((prev) => ({ ...prev, hero: { ...prev.hero, name: trimmed } }));
  }, []);

  const reset = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SAVE_KEY);
    }
    setState(defaultState());
    setSelectedBuild(null);
    pushLog("새 게임을 시작합니다.");
  }, [pushLog]);

  return {
    state,
    lastLog,
    selectedBuild,
    setSelectedBuild,
    canAffordBuild,
    canPlaceAt,
    placeBuilding,
    trainUnit,
    canAffordUnit,
    hasBarracks,
    attackTerritory,
    renameHero,
    reset,
  };
}
