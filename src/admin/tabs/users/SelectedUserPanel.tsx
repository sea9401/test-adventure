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
import { OpsUserNotesSection } from "./OpsUserNotesSection";
import { OpsUserSummarySection } from "./OpsUserSummarySection";
import { SanctionsSection } from "./SanctionsSection";
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
  onResetCharacter,
  onResetMasteryTowerDaily,
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
  onResetCharacter: () => void | Promise<void>;
  onResetMasteryTowerDaily: () => void | Promise<void>;
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

      <SanctionsSection userId={user.id} readOnly={readOnly} />

      <OpsUserNotesSection userId={user.id} readOnly={readOnly} />

      <OpsUserSummarySection userId={user.id} readOnly={readOnly} />

      <GuildCooldownSection userId={user.id} readOnly={readOnly} />

      <section className="rounded-md border border-amber-300 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
        <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          숙련의 탑
        </h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          오늘 진행 층수와 수령 상태만 초기화합니다. 영구 최고층과 최초 돌파 보상
          수령 기록은 유지됩니다.
        </p>
        <Button
          variant="danger"
          disabled={readOnly || loading}
          onClick={() => void onResetMasteryTowerDaily()}
          className="mt-2"
        >
          오늘 진행 초기화
        </Button>
      </section>

      <section className="rounded-md border border-red-300 bg-red-50/50 p-3 dark:border-red-900 dark:bg-red-950/30">
        <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">
          위험 구역
        </h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          캐릭터 데이터(세이브 전체)를 삭제하고 무소속 새 캐릭터로 초기화합니다.
          계정·로그인은 유지되며, 대상 유저가 새로고침하면 캐릭터 생성 화면으로
          돌아갑니다. 되돌릴 수 없습니다.
        </p>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => void onResetCharacter()}
          className="mt-2 rounded-md border border-red-600 bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          캐릭터 초기화
        </button>
      </section>

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

      <V2GrantSection readOnly={readOnly || loading} onGrant={onGrantV2} />
    </>
  );
}
