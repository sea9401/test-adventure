"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BUILDINGS,
  GRID_H,
  GRID_W,
  UNITS,
  defaultFiefdomState,
} from "./builderData";
import { applyTick } from "./tick";
import type {
  Building,
  BuildingType,
  FiefdomState,
  ResourceBag,
  UnitType,
} from "./types";

// 길드 영지 라이브 모드 — 서버 권위 sync.
// 서버가 state 의 truth: 클라 액션은 intent 로 전송(/api/fiefdom/{place-building,train-unit,
// rename-hero,attack}), 서버가 tick + validate + 적용 후 새 state 반환 → 클라가 교체.
// 로컬 tick(250ms) 은 부드러운 자원 표시·훈련 카운트다운 표시 전용이며, 다음 서버 응답이
// 도착하면 truth 로 갱신된다.

const LOCAL_TICK_MS = 250;

export type BrowseTarget = {
  guildId: number;
  guildName: string;
  lodgeRank: number;
  armySize: number;
  heroLevel: number;
  shieldUntil: string | null;
};

export type LiveLoadState =
  | { kind: "loading" }
  | { kind: "no_guild" }
  | { kind: "unauthorized" }
  | { kind: "network_error"; message: string }
  | { kind: "ready"; guildId: number; guildName: string };

export type LiveApi = {
  load: LiveLoadState;
  state: FiefdomState;
  shieldUntil: Date | null;

  // Build/train ops (BuilderApi compatible 부분).
  selectedBuild: BuildingType | null;
  setSelectedBuild: (t: BuildingType | null) => void;
  canAffordBuild: (t: BuildingType) => boolean;
  canPlaceAt: (t: BuildingType, x: number, y: number) => boolean;
  placeBuilding: (t: BuildingType, x: number, y: number) => void;
  trainUnit: (t: UnitType) => void;
  canAffordUnit: (t: UnitType) => boolean;
  hasBarracks: boolean;
  renameHero: (name: string) => void;
  /** 로컬 모드 호환 stub — 라이브에서는 attackGuild 사용. */
  attackTerritory: (id: string) => void;
  /** 로컬 모드 호환 stub — 라이브에서는 disable. */
  reset: () => void;

  // Live-only.
  targets: BrowseTarget[];
  refreshTargets: () => Promise<void>;
  attackGuild: (defenderGuildId: number) => Promise<void>;

  lastLog: string[];
};

function canAfford(resources: ResourceBag, cost: Partial<ResourceBag>): boolean {
  for (const k of Object.keys(cost) as Array<keyof ResourceBag>) {
    if ((resources[k] ?? 0) < (cost[k] ?? 0)) return false;
  }
  return true;
}
function buildingAt(buildings: Building[], x: number, y: number) {
  return buildings.find((b) => {
    const s = BUILDINGS[b.type].size;
    return x >= b.x && x < b.x + s && y >= b.y && y < b.y + s;
  });
}
function canPlace(buildings: Building[], type: BuildingType, x: number, y: number) {
  const s = BUILDINGS[type].size;
  if (x < 0 || y < 0 || x + s > GRID_W || y + s > GRID_H) return false;
  for (let dx = 0; dx < s; dx++) {
    for (let dy = 0; dy < s; dy++) {
      if (buildingAt(buildings, x + dx, y + dy)) return false;
    }
  }
  return true;
}

export function useFiefdomServer(): LiveApi {
  const [load, setLoad] = useState<LiveLoadState>({ kind: "loading" });
  const [state, setState] = useState<FiefdomState>(() => defaultFiefdomState());
  const [shieldUntil, setShieldUntil] = useState<Date | null>(null);
  const [selectedBuild, setSelectedBuild] = useState<BuildingType | null>(null);
  const [lastLog, setLastLog] = useState<string[]>([]);
  const [targets, setTargets] = useState<BrowseTarget[]>([]);

  const inFlight = useRef(false);

  const pushLog = useCallback((msg: string) => {
    setLastLog((prev) => {
      const time = new Date().toLocaleTimeString();
      return [`[${time}] ${msg}`, ...prev].slice(0, 30);
    });
  }, []);

  // 초기 GET.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/fiefdom/me", { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401) {
          setLoad({ kind: "unauthorized" });
          return;
        }
        if (res.status === 403) {
          setLoad({ kind: "no_guild" });
          return;
        }
        if (!res.ok) {
          setLoad({ kind: "network_error", message: `HTTP ${res.status}` });
          return;
        }
        const body = (await res.json()) as {
          guildId: number;
          guildName: string;
          state: FiefdomState;
          shieldUntil: string | null;
        };
        setState(body.state);
        setShieldUntil(body.shieldUntil ? new Date(body.shieldUntil) : null);
        setLoad({ kind: "ready", guildId: body.guildId, guildName: body.guildName });
      } catch (e) {
        if (cancelled) return;
        setLoad({ kind: "network_error", message: (e as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 수동/사후 refresh (버튼·공격 후).
  const refreshTargets = useCallback(async () => {
    try {
      const res = await fetch("/api/fiefdom/browse", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { targets: BrowseTarget[] };
      setTargets(body.targets);
    } catch {
      // silent
    }
  }, []);

  // 초기 browse 로드.
  useEffect(() => {
    if (load.kind !== "ready") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/fiefdom/browse", { cache: "no-store" });
        if (cancelled || !res.ok) return;
        const body = (await res.json()) as { targets: BrowseTarget[] };
        setTargets(body.targets);
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load.kind]);

  // 로컬 tick — 부드러운 표시 전용. 서버 응답 도착 시 truth 로 덮어씀.
  useEffect(() => {
    if (load.kind !== "ready") return;
    const id = window.setInterval(() => {
      setState((prev) => {
        const { state: ticked, events } = applyTick(prev, Date.now());
        for (const ev of events) {
          if (ev.kind === "unit_trained") pushLog(`${UNITS[ev.type].name} 훈련 완료`);
          else if (ev.kind === "hero_recovered") pushLog(`✨ ${ev.name}이(가) 회복하여 돌아왔습니다!`);
        }
        return ticked;
      });
    }, LOCAL_TICK_MS);
    return () => window.clearInterval(id);
  }, [load.kind, pushLog]);

  const canAffordBuild = useCallback(
    (t: BuildingType) => canAfford(state.resources, BUILDINGS[t].cost),
    [state.resources],
  );
  const canPlaceAt = useCallback(
    (t: BuildingType, x: number, y: number) => canPlace(state.buildings, t, x, y),
    [state.buildings],
  );

  // 공통 intent helper — 서버 응답 받아 state 교체.
  const sendIntent = useCallback(
    async (path: string, body: unknown, errorLabel: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await fetch(`/api/fiefdom/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as { state?: FiefdomState; error?: string };
        if (!res.ok || !json.state) {
          pushLog(`❌ ${errorLabel}: ${json.error ?? `HTTP ${res.status}`}`);
          return;
        }
        setState(json.state);
      } catch (e) {
        pushLog(`❌ ${errorLabel}: ${(e as Error).message}`);
      } finally {
        inFlight.current = false;
      }
    },
    [pushLog],
  );

  const placeBuilding = useCallback(
    (t: BuildingType, x: number, y: number) => {
      // 클라단 사전 검증 — 서버도 검증하지만 round-trip 절약.
      const def = BUILDINGS[t];
      if (def.max && state.buildings.filter((b) => b.type === t).length >= def.max) {
        pushLog(`${def.name}은 더 이상 지을 수 없습니다.`);
        return;
      }
      if (!canPlace(state.buildings, t, x, y)) {
        pushLog("이 위치에는 지을 수 없습니다.");
        return;
      }
      if (!canAfford(state.resources, def.cost)) {
        pushLog("자원이 부족합니다.");
        return;
      }
      pushLog(`${def.name} 건설 요청`);
      sendIntent("place-building", { type: t, x, y }, "건설 실패");
      setSelectedBuild(null);
    },
    [pushLog, sendIntent, state.buildings, state.resources],
  );

  const canAffordUnit = useCallback(
    (t: UnitType) => canAfford(state.resources, UNITS[t].cost),
    [state.resources],
  );
  const hasBarracks = state.buildings.some((b) => b.type === "barracks");

  const trainUnit = useCallback(
    (t: UnitType) => {
      const def = UNITS[t];
      if (!hasBarracks) {
        pushLog("병영을 먼저 지으세요.");
        return;
      }
      if (!canAfford(state.resources, def.cost)) {
        pushLog("자원이 부족합니다.");
        return;
      }
      pushLog(`${def.name} 훈련 요청`);
      sendIntent("train-unit", { type: t }, "훈련 실패");
    },
    [pushLog, sendIntent, hasBarracks, state.resources],
  );

  const renameHero = useCallback(
    (name: string) => {
      const trimmed = name.trim().slice(0, 20);
      if (!trimmed) return;
      sendIntent("rename-hero", { name: trimmed }, "이름 변경 실패");
    },
    [sendIntent],
  );

  const attackGuild = useCallback(
    async (defenderGuildId: number) => {
      try {
        const res = await fetch("/api/fiefdom/attack", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ defenderGuildId }),
        });
        const body = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          if (body.error === "defender_shielded") {
            pushLog(`🛡️ 상대 보호막 활성화 (${body.shieldUntil ?? "?"} 까지)`);
          } else {
            pushLog(`❌ 공격 실패: ${body.error ?? "unknown"}`);
          }
          refreshTargets();
          return;
        }
        const result = body as {
          won: boolean;
          loot: { gold: number; wood: number; food: number };
          myStateAfter: FiefdomState;
          defenderShieldUntil: string;
        };
        setState(result.myStateAfter);
        const lootText = result.won
          ? ` | 약탈 🪙${result.loot.gold} 🪵${result.loot.wood} 🌾${result.loot.food}`
          : "";
        pushLog(`${result.won ? "🎉 승리!" : "💀 패배..."}${lootText}`);
        refreshTargets();
      } catch (e) {
        pushLog(`❌ 네트워크 오류: ${(e as Error).message}`);
      }
    },
    [pushLog, refreshTargets],
  );

  const attackTerritory = useCallback((id: string) => {
    console.warn("[useFiefdomServer] attackTerritory stub invoked with id:", id);
  }, []);
  const reset = useCallback(() => {
    pushLog("라이브 모드에서는 영지 초기화가 불가합니다.");
  }, [pushLog]);

  return {
    load,
    state,
    shieldUntil,
    selectedBuild,
    setSelectedBuild,
    canAffordBuild,
    canPlaceAt,
    placeBuilding,
    trainUnit,
    canAffordUnit,
    hasBarracks,
    renameHero,
    attackTerritory,
    reset,
    targets,
    refreshTargets,
    attackGuild,
    lastLog,
  };
}
