"use client";

import { useMemo, useState } from "react";
import { User } from "@phosphor-icons/react";
import { TabBar } from "@/components/ui/TabBar";
import { Pagination } from "@/components/ui/Pagination";
import { NPCS } from "@/adventure/data/npcs";
import {
  AVATARS,
  MONSTER_AVATAR_IDS,
  MONSTER_AVATAR_PREFIX,
  NPC_AVATAR_IDS,
  NPC_AVATAR_PREFIX,
  avatarImageSrc,
  type Avatar,
} from "./avatars";

export type AvatarCategory = "character" | "npc" | "monster";

const AVATAR_TABS: { key: AvatarCategory; label: string }[] = [
  { key: "character", label: "캐릭터" },
  { key: "npc", label: "NPC" },
  { key: "monster", label: "몬스터" },
];

const AVATAR_PAGE_SIZE = 12; // 3열 × 4행

const CHARACTER_AVATAR_LABELS: Record<string, string> = {
  male1: "남성 1",
  male2: "남성 2",
  male3: "남성 3",
  female1: "여성 1",
  female2: "여성 2",
  female3: "여성 3",
};

const NPC_NAME_BY_ID = new Map<string, string>(
  NPCS.map((n) => [n.id, n.name]),
);

export function avatarDisplayName(id: string): string {
  if (id.startsWith(NPC_AVATAR_PREFIX)) {
    const npcId = id.slice(NPC_AVATAR_PREFIX.length);
    return NPC_NAME_BY_ID.get(npcId) ?? npcId;
  }
  if (id.startsWith(MONSTER_AVATAR_PREFIX)) {
    return id.slice(MONSTER_AVATAR_PREFIX.length);
  }
  return CHARACTER_AVATAR_LABELS[id] ?? id;
}

const AVATAR_OPTIONS_BY_CATEGORY: Record<AvatarCategory, readonly string[]> = {
  character: AVATARS,
  npc: NPC_AVATAR_IDS,
  monster: MONSTER_AVATAR_IDS,
};

// 카테고리 3 탭 + 12개/페이지(3×4) 페이지네이션 카드 그리드 — 캐릭터 생성 폼과 설정의
// 프로필 이미지 변경 모달이 공유한다. 페이지 상태는 카테고리별로 분리해 유지 —
// 몬스터 3페이지 보다가 캐릭터 잠깐 확인 후 돌아와도 위치가 유지된다.
export function AvatarPicker({
  category,
  onCategoryChange,
  selected,
  onSelect,
}: {
  category: AvatarCategory;
  onCategoryChange: (next: AvatarCategory) => void;
  selected: Avatar | null;
  onSelect: (id: Avatar) => void;
}) {
  const options = AVATAR_OPTIONS_BY_CATEGORY[category];
  const [pageByCategory, setPageByCategory] = useState<
    Record<AvatarCategory, number>
  >({ character: 0, npc: 0, monster: 0 });
  const pageCount = Math.max(1, Math.ceil(options.length / AVATAR_PAGE_SIZE));
  const rawPage = pageByCategory[category];
  // options 가 줄어 현재 페이지가 비면 마지막 유효 페이지로 자동 보정.
  const page = Math.min(rawPage, pageCount - 1);
  const pageItems = useMemo(
    () => options.slice(page * AVATAR_PAGE_SIZE, (page + 1) * AVATAR_PAGE_SIZE),
    [options, page],
  );
  const setPage = (n: number) => {
    const clamped = Math.max(0, Math.min(pageCount - 1, n));
    setPageByCategory((p) => ({ ...p, [category]: clamped }));
  };
  return (
    <div className="space-y-2">
      <TabBar
        tabs={AVATAR_TABS}
        active={category}
        onChange={onCategoryChange}
        ariaLabel="외형 카테고리"
      />
      <div className="grid grid-cols-3 gap-2">
        {pageItems.map((id) => (
          <AvatarOption
            key={id}
            id={id}
            selected={selected === id}
            onSelect={() => onSelect(id)}
          />
        ))}
      </div>
      <Pagination page={page} pageCount={pageCount} setPage={setPage} />
    </div>
  );
}

// 단일 아바타 카드 — 이미지 + 라벨. 로드 실패 시 User 아이콘으로 폴백.
function AvatarOption({
  id,
  selected,
  onSelect,
}: {
  id: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const [errored, setErrored] = useState(false);
  const label = avatarDisplayName(id);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      className={`overflow-hidden rounded-md border transition-colors ${
        selected
          ? "border-zinc-900 ring-2 ring-zinc-900 dark:border-zinc-100 dark:ring-zinc-100"
          : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-700 dark:hover:border-zinc-400"
      }`}
    >
      <div className="flex aspect-square w-full items-center justify-center bg-zinc-50 text-zinc-400 dark:bg-zinc-950 dark:text-zinc-600">
        {errored ? (
          <User size={32} weight="duotone" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarImageSrc(id)}
            alt=""
            onError={() => setErrored(true)}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="truncate px-1.5 py-1 text-center text-[11px] leading-tight text-zinc-600 dark:text-zinc-300">
        {label}
      </div>
    </button>
  );
}
