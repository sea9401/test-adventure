"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "../../AdminContext";
import { adminGet, adminPost } from "../../api";
import { Button } from "../../ui/Field";
import { useAsyncData } from "@/lib/useAsyncData";

type OpsUserNote = {
  id: string;
  text: string;
  status: "open" | "resolved";
  createdByEmail: string;
  createdAt: string;
  updatedByEmail: string | null;
  updatedAt: string | null;
};

export function OpsUserNotesSection({
  userId,
  readOnly,
}: {
  userId: string;
  readOnly: boolean;
}) {
  const { showToast, adminMe } = useAdmin();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const { data, loading, error, refetch } = useAsyncData<{
    notes: OpsUserNote[];
  }>(
    (signal) =>
      adminGet(
        `/api/admin/users/ops-notes?userId=${encodeURIComponent(userId)}`,
        signal,
      ),
    [userId],
  );
  const canWrite = Boolean(adminMe?.capabilities.reward || adminMe?.capabilities.sanction);
  const disabled = readOnly || saving || !canWrite;

  useEffect(() => {
    if (error) showToast(`운영 메모 조회 실패: ${error}`);
  }, [error, showToast]);

  const run = async (
    action: "add" | "resolve" | "reopen" | "delete",
    noteId = "",
  ) => {
    setSaving(true);
    try {
      await adminPost("/api/admin/users/ops-notes", {
        userId,
        action,
        noteId,
        text,
      });
      if (action === "add") setText("");
      showToast("운영 메모 저장됨");
      refetch();
    } catch (e) {
      showToast(`운영 메모 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setSaving(false);
    }
  };

  const notes = data?.notes ?? [];
  const openNotes = notes.filter((note) => note.status === "open");
  const resolvedNotes = notes.filter((note) => note.status === "resolved");

  return (
    <section className="rounded-md border border-sky-200 bg-sky-50/50 p-3 dark:border-sky-900 dark:bg-sky-950/20">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-sky-800 dark:text-sky-300">
          운영 메모
        </h2>
        <Button onClick={() => void refetch()} disabled={loading}>
          {loading ? "조회 중..." : "새로고침"}
        </Button>
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        반복 문의, 보상 판단 근거, 제재 검토 내용을 유저 단위로 남깁니다.
      </p>

      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          rows={3}
          maxLength={1_000}
          placeholder="운영자가 참고할 메모"
          className="min-h-20 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
        />
        <div className="flex items-end">
          <Button
            variant="primary"
            disabled={disabled || text.trim().length === 0}
            onClick={() => void run("add")}
          >
            {saving ? "저장 중..." : "메모 추가"}
          </Button>
        </div>
      </div>
      {!canWrite ? (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
          현재 계정은 메모 작성 권한이 없습니다.
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">조회 실패: {error}</p>
      ) : notes.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">메모 없음</p>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <NoteList
            title={`열린 메모 ${openNotes.length}`}
            notes={openNotes}
            disabled={disabled}
            onAction={run}
          />
          <NoteList
            title={`처리된 메모 ${resolvedNotes.length}`}
            notes={resolvedNotes}
            disabled={disabled}
            onAction={run}
          />
        </div>
      )}
    </section>
  );
}

function NoteList({
  title,
  notes,
  disabled,
  onAction,
}: {
  title: string;
  notes: OpsUserNote[];
  disabled: boolean;
  onAction: (
    action: "resolve" | "reopen" | "delete",
    noteId: string,
  ) => void | Promise<void>;
}) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold">{title}</h3>
      {notes.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">없음</p>
      ) : (
        <ul className="space-y-2">
          {notes.slice(0, 12).map((note) => (
            <li
              key={note.id}
              className="rounded-md border border-zinc-200 bg-white p-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
            >
              <p className="whitespace-pre-wrap text-zinc-800 dark:text-zinc-100">
                {note.text}
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
                <span>
                  {note.createdByEmail} · {new Date(note.createdAt).toLocaleString("ko-KR")}
                </span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      void onAction(
                        note.status === "open" ? "resolve" : "reopen",
                        note.id,
                      )
                    }
                    className="rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    {note.status === "open" ? "처리" : "다시 열기"}
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => void onAction("delete", note.id)}
                    className="rounded border border-red-300 px-2 py-0.5 text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                  >
                    삭제
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
