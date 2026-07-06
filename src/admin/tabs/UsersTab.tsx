"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "../AdminContext";
import { Button, TextInput } from "../ui/Field";
import type { CharacterDynamicState } from "@/adventure/character/useCharacterState";
import type { Profile } from "@/adventure/profile/useProfile";
import type {
  AdminUserRow,
  SavesMap,
  V2GrantPayload,
} from "./users/types";
import { SelectedUserPanel } from "./users/SelectedUserPanel";

function formatLastSeen(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return new Date(iso).toLocaleString("ko-KR");
}

export function UsersTab() {
  const { readOnly, showToast } = useAdmin();

  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [saves, setSaves] = useState<SavesMap | null>(null);
  const [savesLoading, setSavesLoading] = useState(false);
  const [savesError, setSavesError] = useState<string | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setSearchLoading(true);
    setSearchError(null);
    try {
      const r = await fetch(
        `/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`,
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setUsers((await r.json()) as AdminUserRow[]);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "검색 실패");
      setUsers([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    // 초기 1회 — 비동기 fetch 후 setState 라 cascading render 가 아니지만
    // 린트는 호출 그래프만 보고 발화하므로 명시적으로 끈다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void runSearch("");
  }, [runSearch]);

  const loadSaves = useCallback(async (userId: string) => {
    setSavesLoading(true);
    setSavesError(null);
    setSaves(null);
    try {
      const r = await fetch(
        `/api/admin/saves?userId=${encodeURIComponent(userId)}`,
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSaves((await r.json()) as SavesMap);
    } catch (e) {
      setSavesError(e instanceof Error ? e.message : "로드 실패");
    } finally {
      setSavesLoading(false);
    }
  }, []);

  const patchKey = async (userId: string, key: string, value: unknown) => {
    const r = await fetch(
      `/api/admin/saves?userId=${encodeURIComponent(userId)}&key=${encodeURIComponent(key)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value }),
      },
    );
    if (!r.ok) {
      // 닉네임 중복 등 알려진 실패는 본문에 error 코드가 동봉됨 — 사람 보기 좋게 변환.
      let detail = "";
      try {
        const body = (await r.json()) as { error?: string };
        if (body.error === "taken") detail = " (다른 유저가 사용 중인 닉네임)";
        else if (body.error) detail = ` (${body.error})`;
      } catch {}
      throw new Error(`HTTP ${r.status}${detail}`);
    }
  };

  const updateCharacter = async (next: CharacterDynamicState) => {
    if (!selected) return;
    try {
      await patchKey(selected.id, "character.v2", next);
      setSaves((s) => ({ ...(s ?? {}), "character.v2": next }));
      showToast("저장됨. 대상 유저는 새로고침해야 반영됩니다.");
    } catch (e) {
      showToast(`실패: ${e instanceof Error ? e.message : "오류"}`);
    }
  };

  const updateProfile = async (next: Profile) => {
    if (!selected) return;
    try {
      await patchKey(selected.id, "character-profile.v2", next);
      setSaves((s) => ({ ...(s ?? {}), "character-profile.v2": next }));
      // 검색 결과 리스트의 gameName 도 같이 갱신해 두면 목록에서도 새 이름이 보임.
      setUsers((list) =>
        list.map((u) => (u.id === selected.id ? { ...u, gameName: next.name } : u)),
      );
      showToast("저장됨. 대상 유저는 새로고침해야 반영됩니다.");
    } catch (e) {
      showToast(`실패: ${e instanceof Error ? e.message : "오류"}`);
    }
  };

  // v2 전용 지급(재료/장비/충전약/숙련도) — synced-keys 밖 키(equipment.v2/proficiency.v2)
  // 때문에 일반 PATCH 대신 전용 라우트. 성공 시 saves 리로드(재료/충전약은 보이고
  // equipment.v2/proficiency.v2 는 saves GET 비대상이라 토스트로만 확인).
  const grantV2 = async (payload: V2GrantPayload) => {
    if (!selected) return;
    try {
      const r = await fetch("/api/admin/v2-grant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: selected.id, ...payload }),
      });
      const j = (await r.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        hpCharges?: number;
        mpCharges?: number;
        proficiencyEarned?: number | null;
        equipmentOwned?: string[];
        equipmentNoOp?: boolean;
        materials?: Record<string, number>;
        staminaRefilled?: number;
      } | null;
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }
      const parts: string[] = [];
      if (j.materials) parts.push("재료");
      if (j.hpCharges != null) parts.push(`HP충전 ${j.hpCharges}`);
      if (j.mpCharges != null) parts.push(`MP충전 ${j.mpCharges}`);
      if (j.proficiencyEarned === null) parts.push("숙련(직업 없음 — 미지급)");
      else if (j.proficiencyEarned != null)
        parts.push(`숙련 보유 ${j.proficiencyEarned}`);
      if (j.equipmentNoOp) parts.push("장비(이미 보유)");
      else if (j.equipmentOwned) parts.push("장비 지급");
      if (j.staminaRefilled != null) parts.push(`스태미나 ${j.staminaRefilled}`);
      showToast(
        `지급 완료: ${parts.join(", ") || "변경 없음"}. 대상 유저 새로고침 필요.`,
      );
      await loadSaves(selected.id);
    } catch (e) {
      showToast(`실패: ${e instanceof Error ? e.message : "오류"}`);
    }
  };

  // 캐릭터 데이터 초기화 — 대상 유저의 savesKv 전 키 삭제 + 1인 길드 해체/거점 해제
  //   (계정·로그인 유지). 닉네임 확인 입력으로 오클릭/대상 혼동 방지.
  const resetCharacter = async () => {
    if (!selected || readOnly) return;
    const expected = selected.gameName?.trim() || selected.id;
    const input = window.prompt(
      `「${expected}」 캐릭터 데이터를 초기화합니다. 되돌릴 수 없습니다.\n` +
        `확인하려면 「${expected}」 를 정확히 입력하세요:`,
    );
    if (input == null) return; // 취소
    try {
      const r = await fetch("/api/admin/reset-character", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: selected.id, confirm: input }),
      });
      const j = (await r.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        deletedKeys?: number;
        guildDeleted?: boolean;
        leftGuildOnly?: boolean;
      } | null;
      if (!r.ok || !j?.ok) {
        throw new Error(
          j?.error === "confirm_mismatch"
            ? "닉네임 불일치"
            : (j?.error ?? `HTTP ${r.status}`),
        );
      }
      const parts: string[] = [`세이브 ${j.deletedKeys ?? 0}개 삭제`];
      if (j.guildDeleted) parts.push("1인 길드 해체");
      if (j.leftGuildOnly) parts.push("길드 탈퇴");
      showToast(
        `캐릭터 초기화 완료: ${parts.join(", ")}. 대상 유저 새로고침 시 새 캐릭 생성.`,
      );
      await loadSaves(selected.id);
    } catch (e) {
      showToast(`초기화 실패: ${e instanceof Error ? e.message : "오류"}`);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-[320px_1fr]">
      <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold">유저 검색</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(query.trim());
          }}
          className="mt-2 flex gap-2"
        >
          <TextInput
            value={query}
            onChange={setQuery}
            placeholder="이메일 또는 이름"
          />
          <Button type="submit" disabled={searchLoading}>
            검색
          </Button>
        </form>
        {searchError ? (
          <div className="mt-2 text-xs text-red-600 dark:text-red-400">
            {searchError}
          </div>
        ) : null}
        <ul className="mt-3 max-h-[60vh] divide-y divide-zinc-200 overflow-y-auto rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {searchLoading && users.length === 0 ? (
            <li className="px-3 py-2 text-xs text-zinc-500">로딩…</li>
          ) : users.length === 0 ? (
            <li className="px-3 py-2 text-xs text-zinc-500">결과 없음</li>
          ) : (
            users.map((u) => {
              const isSelected = selected?.id === u.id;
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(u);
                      void loadSaves(u.id);
                    }}
                    className={
                      "block w-full px-3 py-2 text-left text-xs " +
                      (isSelected
                        ? "bg-zinc-100 dark:bg-zinc-800"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60")
                    }
                  >
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">
                      {u.gameName ?? "(이름 없음)"}
                    </div>
                    <div className="font-mono text-[10px] text-zinc-500">
                      {u.email ?? u.id}
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      마지막 접속 {formatLastSeen(u.lastSeenAt)}
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </section>

      <section className="space-y-3">
        {!selected ? (
          <div className="rounded-md border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
            왼쪽에서 유저를 선택하세요.
          </div>
        ) : (
          <SelectedUserPanel
            user={selected}
            saves={saves}
            loading={savesLoading}
            error={savesError}
            readOnly={readOnly}
            onUpdateProfile={updateProfile}
            onUpdateCharacter={updateCharacter}
            onGrantV2={grantV2}
            onResetCharacter={resetCharacter}
            onReload={() => loadSaves(selected.id)}
          />
        )}
      </section>
    </div>
  );
}
