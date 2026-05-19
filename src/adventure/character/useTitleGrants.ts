"use client";

import { useEffect } from "react";
import { COUNTER_TITLES } from "../data/titles";
import { STAT_KEYS, type StatKey } from "../data/stats";
import { SHOP_UNLOCK_THRESHOLD } from "../shop/constants";

// 외부 상태 관찰만 하는 passive 칭호 등록 effect 묶음.
// grantTitle 은 호출자가 보유 — handleSell/onBattleEnd/completeQuest 등 능동 경로와
// 공유돼야 하므로 페이지가 가지고 있고, 이 훅은 카운터/상태/시간 기반 자동 부여만 담당.
export function useTitleGrants(
  grantTitle: (id: string) => void,
  opts: {
    battleLosses: number;
    trainingCount: number;
    chatCount: number;
    healingCount: number;
    gold: number;
    level: number;
    /** 한 NPC 와의 최대 대화 횟수 — COUNTER_TITLES 의 npcTalkCount 키로 phisher/devoted_listener 부여. */
    maxNpcTalkCount: number;
    /** equip + training 합산된 최종 스탯. */
    totalStats: Record<StatKey, number>;
    /** 모든 지역(WORLD_MAP.regions) 방문 완료 여부 — '방방곡곡' 칭호. */
    allRegionsVisited: boolean;
    /** §11 hidden-lucky-collector 완료 flag — 'lucky_finder' 칭호. */
    luckyCollected: boolean;
    /** §11 hidden-hooded-cipher 완료 flag — 'cipher_bearer' 칭호. */
    cipherDone: boolean;
    /** 만월 '부러진 영웅검' 복원 완료 flag(hero_sword_restored) — 'hero_sword_heir' 칭호. */
    heroSwordRestored: boolean;
    /** 상점에 가장 많이 판 재료 한 종류의 누적 판매량 — 임계치 이상이면 '상인'. */
    maxMaterialSold: number;
  },
) {
  // 카운터형 칭호 — COUNTER_TITLES 표를 한 번에 돌며 임계값 도달분 등록.
  useEffect(() => {
    const counters: Record<string, number> = {
      battleLosses: opts.battleLosses,
      trainingCount: opts.trainingCount,
      chatCount: opts.chatCount,
      healingCount: opts.healingCount,
      npcTalkCount: opts.maxNpcTalkCount,
    };
    for (const t of COUNTER_TITLES) {
      if ((counters[t.key] ?? 0) >= t.target) grantTitle(t.id);
    }
    // grantTitle 안정 참조 — deps 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    opts.battleLosses,
    opts.trainingCount,
    opts.chatCount,
    opts.healingCount,
    opts.maxNpcTalkCount,
  ]);

  // '상인' — 한 종류의 재료를 상점에 누적 임계치 이상 판매. 본래는 판매 핸들러가
  // 임계치를 넘기는 순간 직접 부여하지만, 그 순간 부여가 누락된 세이브(과거 판매분·
  // 토스트 직전 종료 등)도 다음 로드 때 확실히 받게 하는 안전망.
  useEffect(() => {
    if (opts.maxMaterialSold >= SHOP_UNLOCK_THRESHOLD) grantTitle("merchant");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.maxMaterialSold]);

  // 시간대 칭호 — 마운트 시 1회 평가. 새벽반(3~5시) / 야행성(자정~3시).
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 3 && hour < 5) grantTitle("early_bird");
    if (hour >= 0 && hour < 3) grantTitle("night_owl");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 상태 관찰형 — gold 0 도달, 외골수 빌드, 레벨/골드 마일스톤.
  // 외골수: 한 스탯 30↑, 나머지 모두 10↓ (11~29 구간이 있으면 미부여).
  const goldZero = opts.gold === 0;
  const goldOneCoin = opts.gold === 1;
  const goldRich = opts.gold >= 10000;
  const goldLandlord = opts.gold >= 100_000;
  const goldFortune = opts.gold >= 1_000_000;
  const youngRich = goldLandlord && opts.level < 10;
  const levelVeteran = opts.level >= 30;
  const levelLegend = opts.level >= 50;
  const levelMythic = opts.level >= 70;
  const levelTranscendent = opts.level >= 100;
  useEffect(() => {
    if (goldZero) grantTitle("beggar");
    if (goldOneCoin) grantTitle("one_coin");
    if (goldRich) grantTitle("wealthy");
    if (goldLandlord) grantTitle("landlord");
    if (goldFortune) grantTitle("nouveau_riche");
    if (youngRich) grantTitle("young_rich");
    if (levelVeteran) grantTitle("level_30");
    if (levelLegend) grantTitle("level_50");
    if (levelMythic) grantTitle("level_70");
    if (levelTranscendent) grantTitle("level_100");
    if (opts.allRegionsVisited) grantTitle("globetrotter");
    if (opts.luckyCollected) grantTitle("lucky_finder");
    if (opts.cipherDone) grantTitle("cipher_bearer");
    if (opts.heroSwordRestored) grantTitle("hero_sword_heir");
    const high = STAT_KEYS.filter((k) => opts.totalStats[k] >= 30).length;
    const low = STAT_KEYS.filter((k) => opts.totalStats[k] <= 10).length;
    if (high === 1 && low === STAT_KEYS.length - 1) grantTitle("one_track");
    // 골고루: 모든 스탯 15↑ + 최댓값과 최솟값 차이 4↓ (초반엔 전부 낮아 미부여).
    const vals = STAT_KEYS.map((k) => opts.totalStats[k]);
    if (Math.min(...vals) >= 15 && Math.max(...vals) - Math.min(...vals) <= 4) {
      grantTitle("well_rounded");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    goldZero,
    goldOneCoin,
    goldRich,
    goldLandlord,
    goldFortune,
    youngRich,
    levelVeteran,
    levelLegend,
    levelMythic,
    levelTranscendent,
    opts.allRegionsVisited,
    opts.luckyCollected,
    opts.cipherDone,
    opts.heroSwordRestored,
    opts.totalStats.str,
    opts.totalStats.dex,
    opts.totalStats.vit,
    opts.totalStats.spd,
    opts.totalStats.luk,
  ]);
}
