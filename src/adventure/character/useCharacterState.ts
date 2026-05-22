import { useEffect, useState } from "react";
import { applyExpGain, MAX_LEVEL } from "@/lib/leveling";
import { useSavedValue } from "@/lib/storage/SaveProvider";
import { useRemotePatch } from "@/lib/storage/useRemotePatch";
import { baseCharacter, maxHpForLevel, maxMpForLevel } from "./defaults";
import { normalizeStance, type StanceId } from "./stance";
import { rehydrateEquippedItem } from "./rehydrateEquip";
import type { EquippedItem, EquippedSlots } from "./types";
import {
  isWellFormedRuneSlot,
  RUNE_SLOT_COUNT,
  type EquippedRune,
} from "@/adventure/data/runes";
import {
  isAPSkillCondition,
  type APSkillCondition,
} from "@/adventure/character/apSkills";

// PR #140 (baseCharacter.maxHp 47 → 97) 이전 캐릭터의 hp 저장값에 +50 을 일률 보정하는
// 일회성 마이그레이션 키. derivePlayerCombat 가 maxHp 로 클램프하므로 maxHp 초과해도 안전.
const HP_LIFT_V1 = "hpLift_v1";

export type CharacterDynamicState = {
  hp: number;
  mp: number;
  level: number;
  exp: number;
  gold: number;
  fame: number;
  /** 길드 시스템에서 자동 갱신. 미가입 시 "무소속". */
  affiliation?: string;
  equipped?: EquippedSlots;
  /** 장착 중인 칭호 ID. null/미지정 = 미장착. */
  equippedTitleId?: string | null;
  /** 장착 중인 일반 스킬 이름 목록 (최대 skillLayout().normalSlots). undefined = 자동 (보유 첫 N개). */
  equippedSkills?: string[];
  /** 장착 중인 특기 이름들 — 슬롯 인덱스 0..featSlots-1. null = 그 슬롯 미장착. undefined/[] = 모두 미장착. */
  equippedFeats?: (string | null)[];
  /**
   * 장착 중인 룬 — 슬롯 인덱스 0..RUNE_SLOT_COUNT-1. null = 슬롯 비움.
   * undefined/[] = 모두 미장착. 효과는 derivePlayerCombat / onBattleEnd / engine 에서 합산 적용.
   */
  equippedRunes?: (EquippedRune | null)[];
  /**
   * region 단위 일일 보스 도전 카운터.
   * date 는 클라이언트 로컬 'YYYY-MM-DD'. 다른 날짜로 보면 0 부터 새로 카운트.
   * lastAttemptAtMs: 직전 도전의 epoch ms — 누진 쿨다운 계산용. 자정 넘어 date
   * 가 바뀌면 무시 (자정 = 쿨다운/횟수 동시 리셋).
   */
  bossAttempts?: Partial<
    Record<string, { date: string; count: number; lastAttemptAtMs?: number }>
  >;
  /**
   * 학습한 AP 스킬 이름 목록. 스킬북 사용 시 추가됨. 슬롯 장착(equippedSkills)해야 발동.
   * 스탯 스킬과 같은 슬롯 풀 공유 — equippedSkills 의 이름이 STAT_SKILL 에 없으면 여기에서 lookup.
   */
  learnedAPSkills?: string[];
  /**
   * AP 스킬 슬롯의 발동 조건 — skillName 키. 미지정 = always (기본).
   * STAT_SKILL 은 슬롯 풀을 공유하지만 패시브라 조건 무의미 — 키 자체를 두지 않는다.
   */
  apSkillConditions?: Partial<Record<string, APSkillCondition>>;
  /**
   * 선택한 전술(스탠스). null/미지정 = 전술 없음(보정 0).
   * 보스/특수 전투(지역 보스·협동·고탑·PvP)에만 적용 — 일반 사냥엔 무영향.
   */
  selectedStance?: StanceId | null;
  /** 일회성 마이그레이션 플래그 — 키별 1회만 실행. */
  migrations?: Partial<Record<string, boolean>>;
};

// 클라이언트 로컬 자정 기준 'YYYY-MM-DD' (sv-SE 가 ISO-like 안전한 포맷).
function todayLocalDateKey(): string {
  return new Date().toLocaleDateString("sv-SE");
}

export const initialCharacterState: CharacterDynamicState = {
  hp: 97,
  mp: 30,
  level: 1,
  exp: 0,
  gold: 50,
  fame: 0,
  equippedTitleId: null,
  // 신규 유저는 이미 +50 후 베이스로 시작하므로 마이그레이션 적용된 것으로 시드.
  migrations: { [HP_LIFT_V1]: true },
};

// 저장된 EquipItem 슬롯 매핑을 "지금" 데이터 정의로 다시 만들어 옛 인스턴스가 남지 않게.
// 실제 변환은 rehydrateEquippedItem 공용 헬퍼 — 서버측 autoHunt/derivePlayerCombatFromSaves
// 도 동일 헬퍼를 써야 craftTier/dropQuality 가 일관되게 반영된다.
function rehydrateEquipped(
  saved: CharacterDynamicState["equipped"],
): CharacterDynamicState["equipped"] {
  if (!saved) return undefined;
  return {
    weapon: rehydrateEquippedItem(saved.weapon),
    armor: rehydrateEquippedItem(saved.armor),
    accessory: rehydrateEquippedItem(saved.accessory),
  };
}

function readInitial(raw: unknown): CharacterDynamicState {
  if (!raw || typeof raw !== "object") return initialCharacterState;
  const parsed = raw as Partial<CharacterDynamicState> & {
    /** 레거시 — 단일 특기 슬롯 시절 저장 필드. 읽기 호환만 유지하고 즉시 배열로 정규화. */
    equippedFeat?: string;
  };
  // 레거시 equippedFeat (단일 string) → equippedFeats 배열 마이그레이션.
  let feats: (string | null)[] | undefined = parsed.equippedFeats;
  if (!feats && parsed.equippedFeat) {
    feats = [parsed.equippedFeat];
  }
  return {
    hp: parsed.hp ?? initialCharacterState.hp,
    mp: parsed.mp ?? initialCharacterState.mp,
    level: Math.min(
      MAX_LEVEL,
      Math.max(1, parsed.level ?? initialCharacterState.level),
    ),
    exp: parsed.exp ?? initialCharacterState.exp,
    gold: parsed.gold ?? initialCharacterState.gold,
    fame: parsed.fame ?? initialCharacterState.fame,
    affiliation: parsed.affiliation,
    equipped: rehydrateEquipped(parsed.equipped),
    equippedTitleId: parsed.equippedTitleId ?? null,
    equippedSkills: parsed.equippedSkills,
    equippedFeats: feats,
    equippedRunes: rehydrateEquippedRunes(parsed.equippedRunes),
    bossAttempts: parsed.bossAttempts,
    learnedAPSkills: Array.isArray(parsed.learnedAPSkills)
      ? parsed.learnedAPSkills.filter((x): x is string => typeof x === "string")
      : undefined,
    apSkillConditions: parseAPSkillConditions(parsed.apSkillConditions),
    selectedStance: normalizeStance(parsed.selectedStance),
    migrations: parsed.migrations,
  };
}

function parseAPSkillConditions(
  raw: unknown,
): Partial<Record<string, APSkillCondition>> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Partial<Record<string, APSkillCondition>> = {};
  for (const [name, cond] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof name === "string" && isAPSkillCondition(cond)) {
      out[name] = cond;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function rehydrateEquippedRunes(
  saved: unknown,
): (EquippedRune | null)[] | undefined {
  if (!Array.isArray(saved)) return undefined;
  const out: (EquippedRune | null)[] = [];
  for (let i = 0; i < Math.min(saved.length, RUNE_SLOT_COUNT); i += 1) {
    // 모양이 멀쩡하면 미인식 id/grade 라도 보존(carry-through) — 진짜 손상만 null.
    const v = saved[i];
    out.push(isWellFormedRuneSlot(v) ? { id: v.id, grade: v.grade } : null);
  }
  return out;
}

export type UseCharacterStateOpts = {
  /**
   * 100레벨 도달 후 캡된 잉여 EXP 를 라우팅할 콜백. 미지정 시 잉여는 폐기 (기존 동작).
   * page.tsx 에서 useParagonState 와 짝지어 주입.
   */
  onParagonOverflow?: (overflow: number) => void;
};

export function useCharacterState(opts?: UseCharacterStateOpts) {
  const initial = useSavedValue("character.v2");
  const [state, setState] = useState<CharacterDynamicState>(() =>
    readInitial(initial),
  );
  useRemotePatch("character.v2", state);

  // 일회성 hp +50 마이그레이션 (PR #140 — Lv1 베이스 maxHp 47 → 97 일률 보정).
  // 보정 전 캐릭터는 maxHp 가 +50 되었지만 저장된 hp 는 그대로라 새 maxHp 보다 영구히
  // 50 부족한 상태가 됨. 첫 마운트 후 한 번만 hp+=50 + 플래그 set → useRemotePatch 가
  // 변경을 감지해 서버로 patch. derivePlayerCombat 가 maxHp 로 클램프하므로 초과 무해.
  useEffect(() => {
    setState((prev) => {
      if (prev.migrations?.[HP_LIFT_V1]) return prev;
      return {
        ...prev,
        hp: prev.hp + 50,
        migrations: { ...(prev.migrations ?? {}), [HP_LIFT_V1]: true },
      };
    });
  }, []);

  const equippedSlots = state.equipped ?? baseCharacter.equipped;

  // maxHp/maxMp는 호출 측이 스탯(VIT 등) 보정을 합쳐 넘겨주면 그 값으로 회복.
  // 미지정이면 레벨 기준만 사용 (스탯 보정 없는 레거시 동작).
  const heal = (cost = 0, maxHp?: number, maxMp?: number) =>
    setState((prev) => ({
      ...prev,
      gold: Math.max(0, prev.gold - cost),
      hp: maxHp ?? maxHpForLevel(prev.level),
      mp: maxMp ?? maxMpForLevel(prev.level),
    }));

  const restoreHpFull = (maxHp?: number) =>
    setState((prev) => ({ ...prev, hp: maxHp ?? maxHpForLevel(prev.level) }));

  const setHp = (hp: number) => setState((prev) => ({ ...prev, hp }));

  // 전술(스탠스) 선택. null = 전술 없음. 보스/특수 전투에만 적용된다.
  const setStance = (stance: StanceId | null) =>
    setState((prev) => ({ ...prev, selectedStance: stance }));

  const addGoldFame = (gold: number, fame: number) =>
    setState((prev) => ({
      ...prev,
      gold: prev.gold + gold,
      fame: prev.fame + fame,
    }));

  const addGold = (delta: number) =>
    setState((prev) => ({ ...prev, gold: prev.gold + delta }));

  // vitHpBonus: 레벨업 풀회복 시 VIT(스탯+장비) 보너스만큼 maxHp에 더해 회복.
  // 기본 0 — 호출 측에서 안 넘기면 레벨 기준 max 까지만 회복 (퀘스트 보상 등).
  const addExp = (n: number, vitHpBonus = 0) => {
    // 만렙 잉여 EXP 라우팅용 사전 계산 — setState 콜백 안에서 부수효과를 부르면
    // Strict Mode 가 콜백을 두 번 돌릴 때 잉여가 두 번 적립되니, 콜은 setState 밖에서.
    const peek = applyExpGain(state.level, state.exp, n);
    setState((prev) => {
      const next = applyExpGain(prev.level, prev.exp, n);
      // 레벨업 시 HP/MP 를 새 max 로 풀회복 — 보상감 + max 증가만 했을 때 발생하는
      // "현재값이 max 보다 낮은 채 정체" 문제 회피.
      if (next.levelsGained > 0) {
        return {
          ...prev,
          level: next.level,
          exp: next.exp,
          hp: maxHpForLevel(next.level) + vitHpBonus,
          mp: maxMpForLevel(next.level),
        };
      }
      return { ...prev, level: next.level, exp: next.exp };
    });
    if (peek.overflowExp > 0) {
      opts?.onParagonOverflow?.(peek.overflowExp);
    }
  };

  const setSlot = (slot: keyof EquippedSlots, item: EquippedItem | null) =>
    setState((prev) => {
      const current = prev.equipped ?? baseCharacter.equipped;
      return { ...prev, equipped: { ...current, [slot]: item } };
    });

  const setEquippedTitle = (titleId: string | null) =>
    setState((prev) => ({ ...prev, equippedTitleId: titleId }));

  const setEquippedSkills = (names: string[]) =>
    setState((prev) => {
      // 해제된 AP 스킬의 조건은 정리. 같은 이름을 다시 끼우면 always 로 시작.
      const prevConds = prev.apSkillConditions ?? {};
      const kept: Partial<Record<string, APSkillCondition>> = {};
      const set = new Set(names);
      for (const [name, c] of Object.entries(prevConds)) {
        if (set.has(name) && c) kept[name] = c;
      }
      return {
        ...prev,
        equippedSkills: names,
        apSkillConditions: Object.keys(kept).length > 0 ? kept : undefined,
      };
    });

  // AP 스킬 슬롯의 발동 조건 설정. always = 키 삭제 (저장 용량 절약 + 의미적으로 "기본").
  const setAPSkillCondition = (
    skillName: string,
    condition: APSkillCondition,
  ) =>
    setState((prev) => {
      const next = { ...(prev.apSkillConditions ?? {}) };
      if (condition.kind === "always") {
        delete next[skillName];
      } else {
        next[skillName] = condition;
      }
      return {
        ...prev,
        apSkillConditions: Object.keys(next).length > 0 ? next : undefined,
      };
    });

  // 슬롯 인덱스 별로 특기 장착/해제. UI 가 슬롯 번호와 함께 호출.
  // 결과 배열 길이는 항상 max(prev.length, index+1) — null 패딩으로 슬롯 자리 유지.
  const setEquippedFeatAt = (slotIndex: number, name: string | null) =>
    setState((prev) => {
      const next = (prev.equippedFeats ?? []).slice();
      while (next.length <= slotIndex) next.push(null);
      next[slotIndex] = name ?? null;
      return { ...prev, equippedFeats: next };
    });

  // 룬 슬롯 장착/해제. RUNE_SLOT_COUNT 자리만큼 null 로 패딩 유지.
  // 장착/해제 자체는 인벤에서 소비/반환하지 않고 "참조" 만 한다.
  // 인벤 가방의 보유량은 그대로 — 다른 슬롯에도 끼울 수 있고, 합성·소비 시점에 한꺼번에 빼는 식.
  // (UX 가 단순; 동일 룬을 두 슬롯에 끼우는 건 RuneView 에서 막는다.)
  const setEquippedRuneAt = (slotIndex: number, rune: EquippedRune | null) =>
    setState((prev) => {
      if (slotIndex < 0 || slotIndex >= RUNE_SLOT_COUNT) return prev;
      const next = (prev.equippedRunes ?? []).slice();
      while (next.length < RUNE_SLOT_COUNT) next.push(null);
      next[slotIndex] = rune;
      return { ...prev, equippedRunes: next };
    });

  // 길드 가입/탈퇴/해체/위임 시 호출. 서버는 이미 character.v2 에 affiliation 을
  // 반영했지만 클라이언트의 in-memory state 도 같이 끌어줘야 AdventurerCard 등이
  // 즉시 새 값을 표시.
  const setAffiliation = (affiliation: string) =>
    setState((prev) => ({ ...prev, affiliation }));

  // 서버 권위 액션(상점 등)의 응답으로 받은 character.v2 값으로 통째 교체.
  // readInitial 로 정규화 (level 클램프 / equipped rehydrate). 이후 useRemotePatch 가
  // 동일 값을 다시 PATCH 하지만 서버 version 과 409 재시도로 자가 수렴.
  const replaceFromSaved = (raw: unknown) => setState(readInitial(raw));

  // 오늘 기준 region 의 보스 도전 카운터. 다른 날짜 데이터는 0 으로 처리.
  const getBossAttemptsToday = (regionId: string): number => {
    const entry = state.bossAttempts?.[regionId];
    if (!entry || entry.date !== todayLocalDateKey()) return 0;
    return entry.count;
  };

  // 오늘 기준 region 의 마지막 도전 epoch ms. 다른 날짜 / 미기록은 null.
  // 호출 측 (BattleView) 이 cooldownAfterAttempt() 와 조합해 다음 도전 가능 시점 계산.
  const getBossLastAttemptAt = (regionId: string): number | null => {
    const entry = state.bossAttempts?.[regionId];
    if (!entry || entry.date !== todayLocalDateKey()) return null;
    return entry.lastAttemptAtMs ?? null;
  };

  // 서버 권위 보상(claim-victory)이 character.v2 를 통째 반환할 때, 보스 도전 직전
  // 클라가 기록한 카운터가 응답 스냅샷에서 사라지지 않게 같이 보낸다.
  const getBossAttemptSnapshotToday = (
    regionId: string,
  ): { date: string; count: number; lastAttemptAtMs?: number } | null => {
    const entry = state.bossAttempts?.[regionId];
    if (!entry || entry.date !== todayLocalDateKey()) return null;
    return entry;
  };

  // 스킬북 사용 시 호출 — 이미 학습한 스킬이면 false (인벤 측이 책 소비 막아야 함).
  const learnAPSkill = (skillName: string): boolean => {
    const learned = state.learnedAPSkills ?? [];
    if (learned.includes(skillName)) return false;
    setState((prev) => ({
      ...prev,
      learnedAPSkills: [...(prev.learnedAPSkills ?? []), skillName],
    }));
    return true;
  };

  // 도전 1회 기록 — 날짜가 바뀌었으면 1 부터 시작. lastAttemptAtMs 도 갱신해
  // 누진 쿨다운 기준점이 된다. 호출 측이 쿨다운 검사를 했다고 가정.
  const consumeBossAttempt = (regionId: string) => {
    const today = todayLocalDateKey();
    const nowMs = Date.now();
    setState((prev) => {
      const cur = prev.bossAttempts?.[regionId];
      const nextCount = cur && cur.date === today ? cur.count + 1 : 1;
      return {
        ...prev,
        bossAttempts: {
          ...(prev.bossAttempts ?? {}),
          [regionId]: { date: today, count: nextCount, lastAttemptAtMs: nowMs },
        },
      };
    });
  };

  return {
    state,
    hydrated: true,
    equippedSlots,
    equippedTitleId: state.equippedTitleId ?? null,
    heal,
    restoreHpFull,
    setHp,
    setStance,
    addGold,
    addGoldFame,
    addExp,
    setSlot,
    setEquippedTitle,
    setEquippedSkills,
    setAPSkillCondition,
    setEquippedFeatAt,
    setEquippedRuneAt,
    setAffiliation,
    replaceFromSaved,
    getBossAttemptsToday,
    getBossLastAttemptAt,
    getBossAttemptSnapshotToday,
    consumeBossAttempt,
    learnAPSkill,
  };
}
