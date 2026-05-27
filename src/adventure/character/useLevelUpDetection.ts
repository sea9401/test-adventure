"use client";

import { useEffect, useRef, useState } from "react";
import type { Skill } from "./types";

// 레벨업 + 신규 스킬/특기 획득 + 스킬 슬롯 해금을 감지하는 effect 묶음.
//
// SaveProvider 가 마운트 전에 character.v2 를 hydrate 하므로 첫 effect 의 값은 이미 저장된 값.
// ref 로 baseline 을 잡고, 이후 변경분만 알림으로 처리 — 새로고침해도 재발화 안 함.
//
// levelUpTrigger 는 LevelUpOverlay 의 triggerKey 로 그대로 전달 — 매 레벨업마다 +1.
export function useLevelUpDetection(opts: {
  level: number;
  characterSkills: Skill[];
  characterFeats: Skill[];
  /** 현재 일반 스킬 슬롯 수 (skillLayout().normalSlots). */
  normalSlots: number;
  /** 현재 특기 전용 슬롯 수 (skillLayout().featSlots). 0/1/2. */
  featSlots: number;
  addPoints: (n: number) => void;
  addNotification: (kind: "milestone", text: string) => void;
}) {
  const lastSeenLevelRef = useRef<number | null>(null);
  const lastSeenSkillsRef = useRef<string[] | null>(null);
  const lastSeenFeatsRef = useRef<string[] | null>(null);
  const lastSeenNormalSlotsRef = useRef<number | null>(null);
  const lastSeenFeatSlotsRef = useRef<number | null>(null);
  const [levelUpTrigger, setLevelUpTrigger] = useState(0);

  // 레벨업 감지 — level 증가 시 스탯 포인트 지급 + 알림 + 오버레이.
  useEffect(() => {
    if (lastSeenLevelRef.current === null) {
      lastSeenLevelRef.current = opts.level;
      return;
    }
    const prev = lastSeenLevelRef.current;
    const next = opts.level;
    if (next > prev) {
      const gained = next - prev;
      // PR-S2 검토: ×5 안 함 — useLevelUpDetection 은 라이브 page.tsx 의 live derive 와
      // 결합. v2 derive 마이그까지 ×1 유지 (v2 dungeon hunt 의 server-side grant 만 ×5).
      opts.addPoints(gained);
      opts.addNotification(
        "milestone",
        `레벨업! Lv.${next} (스탯 포인트 +${gained})`,
      );
      setLevelUpTrigger((v) => v + 1);
    }
    lastSeenLevelRef.current = next;
    // addNotification / addPoints 는 setter — deps 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.level]);

  // 스킬 획득 감지 — 스탯 변화로 새 (스탯) 스킬이 추가되면 알림.
  const skillNamesKey = opts.characterSkills.map((s) => s.name).join(",");
  useEffect(() => {
    const currentNames = opts.characterSkills.map((s) => s.name);
    if (lastSeenSkillsRef.current === null) {
      lastSeenSkillsRef.current = currentNames;
      return;
    }
    const prev = new Set(lastSeenSkillsRef.current);
    for (const name of currentNames) {
      if (!prev.has(name)) {
        opts.addNotification("milestone", `스킬 획득! ${name}`);
      }
    }
    lastSeenSkillsRef.current = currentNames;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillNamesKey]);

  // 특기 획득 감지 — 두 요구 스탯이 임계에 도달해 새 특기를 보유하게 되면 알림.
  const featNamesKey = opts.characterFeats.map((s) => s.name).join(",");
  useEffect(() => {
    const currentNames = opts.characterFeats.map((s) => s.name);
    if (lastSeenFeatsRef.current === null) {
      lastSeenFeatsRef.current = currentNames;
      return;
    }
    const prev = new Set(lastSeenFeatsRef.current);
    for (const name of currentNames) {
      if (!prev.has(name)) {
        opts.addNotification("milestone", `특기 획득! ${name}`);
      }
    }
    lastSeenFeatsRef.current = currentNames;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featNamesKey]);

  // 슬롯 해금 감지 — 일반/특기 슬롯 증가 시 알림.
  useEffect(() => {
    if (lastSeenNormalSlotsRef.current === null) {
      lastSeenNormalSlotsRef.current = opts.normalSlots;
      lastSeenFeatSlotsRef.current = opts.featSlots;
      return;
    }
    if (opts.normalSlots > lastSeenNormalSlotsRef.current) {
      opts.addNotification(
        "milestone",
        `스킬 슬롯 해금! 일반 슬롯 ${opts.normalSlots}칸`,
      );
    }
    if (
      lastSeenFeatSlotsRef.current !== null &&
      opts.featSlots > lastSeenFeatSlotsRef.current
    ) {
      opts.addNotification(
        "milestone",
        `특기 슬롯 해금! 특기 ${opts.featSlots}개까지 장착 가능`,
      );
    }
    lastSeenNormalSlotsRef.current = opts.normalSlots;
    lastSeenFeatSlotsRef.current = opts.featSlots;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.normalSlots, opts.featSlots]);

  return { levelUpTrigger };
}
