"use client";

import { Button, Field, NumberInput, TextInput } from "../../ui/Field";
import { initialCharacterState } from "@/adventure/character/useCharacterState";
import type { CharacterDynamicState } from "@/adventure/character/useCharacterState";
import { maxHpForLevel } from "@/adventure/character/defaults";
import { MAX_LEVEL, requiredExpToNext } from "@/lib/leveling";
import type { Profile } from "@/adventure/profile/useProfile";
import { emptyInventory, type InventoryState } from "@/adventure/inventory/useInventory";
import {
  emptyTraining,
  type AdminUserRow,
  type SavesMap,
  type TrainingPersisted,
} from "./types";
import { GuildCooldownSection } from "./GuildCooldownSection";
import { ItemGrantSection } from "./ItemGrantSection";
import { RuneGrantSection } from "./RuneGrantSection";
import { TowerSection } from "./TowerSection";
import { BossSection } from "./BossSection";

export function SelectedUserPanel({
  user,
  saves,
  loading,
  error,
  readOnly,
  onUpdateProfile,
  onUpdateCharacter,
  onUpdateTraining,
  onUpdateInventory,
  onResetTowerDailyAttempts,
  onResetBossAttempts,
  onReload,
}: {
  user: AdminUserRow;
  saves: SavesMap | null;
  loading: boolean;
  error: string | null;
  readOnly: boolean;
  onUpdateProfile: (next: Profile) => void;
  onUpdateCharacter: (next: CharacterDynamicState) => void;
  onUpdateTraining: (next: TrainingPersisted) => void;
  onUpdateInventory: (next: InventoryState) => void;
  onResetTowerDailyAttempts: () => void;
  onResetBossAttempts: () => void;
  onReload: () => void;
}) {
  const character = saves?.["character.v2"] ?? initialCharacterState;
  const profile = saves?.["character-profile.v2"] ?? {
    name: user.gameName ?? "모험가",
    gender: "male1" as const,
  };
  const training = saves?.["training.v2"] ?? emptyTraining();
  const inventory = saves?.["inventory.v2"] ?? emptyInventory();
  const requiredExp = requiredExpToNext(character.level) ?? 0;

  return (
    <>
      <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{profile.name}</div>
            <div className="font-mono text-[11px] text-zinc-500">
              {user.email ?? "(이메일 없음)"}
            </div>
            <div className="font-mono text-[10px] text-zinc-400">{user.id}</div>
          </div>
          <Button onClick={onReload} disabled={loading}>
            새로고침
          </Button>
        </div>
        {error ? (
          <div className="mt-2 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : null}
        {loading ? (
          <div className="mt-2 text-xs text-zinc-500">로딩…</div>
        ) : !saves ? null : !saves["character.v2"] ? (
          <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            ⚠️ 이 유저는 아직 캐릭터 데이터가 서버에 없습니다. 편집 시 새 행이
            생성됩니다.
          </div>
        ) : null}
      </div>

      <GuildCooldownSection userId={user.id} readOnly={readOnly} />

      <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold">프로필</h2>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <Field label="이름">
            <TextInput
              value={profile.name}
              disabled={readOnly || loading}
              onChange={(name) => onUpdateProfile({ ...profile, name })}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold">동적 상태</h2>
        <div className="mt-2 grid gap-3 md:grid-cols-3">
          <Field label="HP" hint={`최대(레벨기준) ${maxHpForLevel(character.level)}`}>
            <NumberInput
              value={character.hp}
              min={0}
              disabled={readOnly || loading}
              onChange={(hp) => onUpdateCharacter({ ...character, hp })}
            />
          </Field>
          <Field label="레벨" hint={`만렙 ${MAX_LEVEL}`}>
            <NumberInput
              value={character.level}
              min={1}
              max={MAX_LEVEL}
              disabled={readOnly || loading}
              onChange={(level) =>
                onUpdateCharacter({
                  ...character,
                  level: Math.max(1, Math.min(MAX_LEVEL, level)),
                })
              }
            />
          </Field>
          <Field
            label="EXP"
            hint={requiredExp ? `다음 레벨까지 ${requiredExp}` : "만렙"}
          >
            <NumberInput
              value={character.exp}
              min={0}
              disabled={readOnly || loading}
              onChange={(exp) => onUpdateCharacter({ ...character, exp })}
            />
          </Field>
          <Field label="골드">
            <NumberInput
              value={character.gold}
              min={0}
              disabled={readOnly || loading}
              onChange={(gold) => onUpdateCharacter({ ...character, gold })}
            />
          </Field>
          <Field label="명성">
            <NumberInput
              value={character.fame}
              min={0}
              disabled={readOnly || loading}
              onChange={(fame) => onUpdateCharacter({ ...character, fame })}
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            disabled={readOnly || loading}
            onClick={() =>
              onUpdateCharacter({
                ...character,
                hp: maxHpForLevel(character.level),
              })
            }
          >
            HP 풀 회복
          </Button>
          <Button
            disabled={readOnly || loading}
            onClick={() =>
              onUpdateCharacter({
                ...character,
                gold: character.gold + 1000,
              })
            }
          >
            +1000 G
          </Button>
        </div>
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold">훈련</h2>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <Field label="단련 포인트 (미사용)">
            <NumberInput
              value={training.points}
              min={0}
              disabled={readOnly || loading}
              onChange={(points) =>
                onUpdateTraining({
                  ...training,
                  points: Math.max(0, Math.floor(points)),
                })
              }
            />
          </Field>
          <Field label="되돌리기 포인트">
            <NumberInput
              value={training.revertPoints}
              min={0}
              disabled={readOnly || loading}
              onChange={(revertPoints) =>
                onUpdateTraining({
                  ...training,
                  revertPoints: Math.max(0, Math.floor(revertPoints)),
                })
              }
            />
          </Field>
          <Field label="누적 훈련 횟수">
            <NumberInput
              value={training.completedCount ?? 0}
              min={0}
              disabled={readOnly || loading}
              onChange={(completedCount) =>
                onUpdateTraining({
                  ...training,
                  completedCount: Math.max(0, Math.floor(completedCount)),
                })
              }
            />
          </Field>
          <Field label="기대 단련 포인트 (진단용)">
            <ExpectedPointsHint level={character.level} training={training} />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            disabled={readOnly || loading}
            onClick={() =>
              onUpdateTraining({ ...training, points: training.points + 1 })
            }
          >
            +1 단련
          </Button>
          <Button
            disabled={readOnly || loading}
            onClick={() =>
              onUpdateTraining({ ...training, points: training.points + 5 })
            }
          >
            +5 단련
          </Button>
          <Button
            disabled={readOnly || loading}
            onClick={() =>
              onUpdateTraining({
                ...training,
                revertPoints: training.revertPoints + 1,
              })
            }
          >
            +1 되돌리기
          </Button>
          <Button
            disabled={readOnly || loading}
            onClick={() =>
              onUpdateTraining({
                ...training,
                revertPoints: training.revertPoints + 3,
              })
            }
          >
            +3 되돌리기
          </Button>
        </div>
      </section>

      <ItemGrantSection
        inventory={inventory}
        readOnly={readOnly || loading}
        onUpdateInventory={onUpdateInventory}
      />

      <RuneGrantSection
        inventory={inventory}
        readOnly={readOnly || loading}
        onUpdateInventory={onUpdateInventory}
      />

      <TowerSection
        tower={saves?.["tower.v1"]}
        readOnly={readOnly}
        loading={loading}
        onResetDailyAttempts={onResetTowerDailyAttempts}
      />

      <BossSection
        character={saves?.["character.v2"]}
        readOnly={readOnly}
        loading={loading}
        onResetBossAttempts={onResetBossAttempts}
      />
    </>
  );
}

// 단련 포인트 손실/복구 진단용. 기대값: (level-1) 회의 레벨업 + completedCount 회의
// 훈련 완료 = 총 획득. 분배(allocated) 와 미사용(points) 의 합과 비교.
// 차이가 음수면 어딘가 손실 — 그 만큼 단련 포인트로 채워주면 복구.
function ExpectedPointsHint({
  level,
  training,
}: {
  level: number;
  training: TrainingPersisted;
}) {
  const earned = Math.max(0, level - 1) + (training.completedCount ?? 0);
  const allocated = Object.values(training.allocated).reduce((a, b) => a + b, 0);
  const held = training.points + allocated;
  const diff = earned - held;
  const tone =
    diff > 0
      ? "text-red-600 dark:text-red-400"
      : diff < 0
        ? "text-amber-600 dark:text-amber-400"
        : "text-zinc-500";
  return (
    <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
      <span className="font-mono">
        {earned} = ({level} - 1) + {training.completedCount ?? 0}
      </span>
      <span className={`font-mono tabular-nums ${tone}`}>
        보유 {held} · 차이 {diff >= 0 ? `+${diff}` : diff}
      </span>
    </div>
  );
}
