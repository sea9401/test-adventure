"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "../../AdminContext";
import { adminGet } from "../../api";
import { Button } from "../../ui/Field";

// 길드 탈퇴/추방 쿨다운 — 현재 만료 시각 표시 + 즉시 초기화. guild_leave_cooldown 테이블
// 직접 조작이라 다른 동적 상태(savesKv)와 별도 엔드포인트(/api/admin/users/guild-cooldown).
export function GuildCooldownSection({
  userId,
  readOnly,
}: {
  userId: string;
  readOnly: boolean;
}) {
  const { showToast } = useAdmin();
  const [until, setUntil] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await adminGet<{ cooldownUntil: string | null }>(
        `/api/admin/users/guild-cooldown?userId=${encodeURIComponent(userId)}`,
      );
      setUntil(j.cooldownUntil);
    } catch (e) {
      showToast(`쿨다운 조회 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setLoading(false);
    }
  }, [userId, showToast]);

  useEffect(() => {
    // 유저 선택이 바뀌면 다시 로드. 비동기 fetch 후 setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const reset = async () => {
    setBusy(true);
    try {
      const r = await fetch(
        `/api/admin/users/guild-cooldown?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );
      if (!r.ok) throw new Error(await r.text());
      setUntil(null);
      showToast("길드 탈퇴 쿨다운을 초기화했습니다.");
    } catch (e) {
      showToast(`초기화 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setBusy(false);
    }
  };

  // GET 엔드포인트가 이미 만료된 쿨다운은 null 로 내려주므로 non-null = 활성.
  const active = until !== null;

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">길드 탈퇴 쿨다운</h2>
        <Button onClick={() => void load()} disabled={loading || busy}>
          {loading ? "조회 중…" : "새로고침"}
        </Button>
      </div>
      <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
        {loading
          ? "조회 중…"
          : active
            ? `${new Date(until!).toLocaleString("ko-KR")} 까지 — 다른 길드 가입·생성 차단 중`
            : "쿨다운 없음 — 즉시 길드 가입 가능"}
      </p>
      <div className="mt-3">
        <Button
          disabled={readOnly || loading || busy || !active}
          onClick={() => void reset()}
        >
          {busy ? "초기화 중…" : "쿨다운 초기화"}
        </Button>
      </div>
      {readOnly && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          보기 전용 모드 — 상단에서 편집 가능으로 전환해야 동작합니다.
        </p>
      )}
    </section>
  );
}
