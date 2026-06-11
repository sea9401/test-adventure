"use client";

import { Button, Field, NumberInput, TextInput } from "../../ui/Field";
import { initialCharacterState } from "@/adventure/character/useCharacterState";
import type { CharacterDynamicState } from "@/adventure/character/useCharacterState";
import { maxHpForLevel } from "@/adventure/character/defaults";
import { MAX_LEVEL, requiredExpToNext } from "@/lib/leveling";
import type { Profile } from "@/adventure/profile/useProfile";
import {
  type AdminUserRow,
  type SavesMap,
  type V2GrantPayload,
} from "./types";
import { GuildCooldownSection } from "./GuildCooldownSection";
import { V2GrantSection } from "./V2GrantSection";

export function SelectedUserPanel({
  user,
  saves,
  loading,
  error,
  readOnly,
  onUpdateProfile,
  onUpdateCharacter,
  onGrantV2,
  onReload,
}: {
  user: AdminUserRow;
  saves: SavesMap | null;
  loading: boolean;
  error: string | null;
  readOnly: boolean;
  onUpdateProfile: (next: Profile) => void;
  onUpdateCharacter: (next: CharacterDynamicState) => void;
  onGrantV2: (payload: V2GrantPayload) => void | Promise<void>;
  onReload: () => void;
}) {
  const character = saves?.["character.v2"] ?? initialCharacterState;
  const profile = saves?.["character-profile.v2"] ?? {
    name: user.gameName ?? "모험가",
    gender: "male1" as const,
  };
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

      {/* 훈련(training.v2) 섹션 제거(2026-06-12) — v2 는 훈련 시스템 없음(숙련도 재설계로 폐기). */}
      <V2GrantSection readOnly={readOnly || loading} onGrant={onGrantV2} />
    </>
  );
}

