"use client";

import { useState } from "react";
import { useAdmin } from "../AdminContext";
import { Button, Field, NumberInput, Select, TextInput } from "../ui/Field";
import { DangerAction } from "../ui/DangerAction";

// 공지/방송 + 대량 우편.
//   공지: 기존 게시판 notice 카테고리(admin 전용) 재사용 — POST /api/bulletin.
//   우편: POST /api/admin/mail — 골드 + 메시지를 한 유저/전체 유저에게 우편함으로 발송.
export function BroadcastTab() {
  const { readOnly, showToast } = useAdmin();

  // 공지
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);

  // 대량 우편
  const [target, setTarget] = useState<"all" | "user">("user");
  const [userId, setUserId] = useState("");
  const [gold, setGold] = useState(1000);
  const [mailMsg, setMailMsg] = useState("");
  const [sending, setSending] = useState(false);

  const noticeDisabled = readOnly || posting;
  const mailDisabled = readOnly || sending;

  const postNotice = async () => {
    if (readOnly) {
      showToast("보기 전용 모드 — 변경 불가");
      return;
    }
    setPosting(true);
    try {
      const r = await fetch("/api/bulletin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "notice", title, content }),
      });
      if (!r.ok) throw new Error(await r.text());
      showToast("공지를 게시했습니다.");
      setTitle("");
      setContent("");
    } catch (e) {
      showToast(`공지 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setPosting(false);
    }
  };

  const sendMail = async () => {
    setSending(true);
    try {
      const r = await fetch("/api/admin/mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, userId, gold, message: mailMsg }),
      });
      const j = (await r.json()) as {
        ok?: boolean;
        recipients?: number;
        error?: string;
      };
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      showToast(`우편 발송 완료 — ${j.recipients ?? 0}명에게 ${gold.toLocaleString()} 골드`);
      setMailMsg("");
    } catch (e) {
      showToast(`우편 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-4">
      {/* 공지 */}
      <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-sm font-semibold">공지 게시</h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          광장 게시판 <strong>공지사항</strong> 카테고리에 게시됩니다(작성자는 "운영자"로
          표시). 점검·업데이트·이벤트 안내용. 1분에 1건 제한.
        </p>
        <div className="mt-3 space-y-2">
          <Field label="제목">
            <TextInput
              value={title}
              onChange={setTitle}
              placeholder="공지 제목 (최대 50자)"
              disabled={noticeDisabled}
            />
          </Field>
          <Field label="본문">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={noticeDisabled}
              rows={4}
              placeholder="공지 내용 (최대 2000자)"
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </Field>
          <Button
            variant="primary"
            disabled={noticeDisabled || !title.trim() || !content.trim()}
            onClick={() => void postNotice()}
          >
            {posting ? "게시 중…" : "공지 게시"}
          </Button>
        </div>
      </div>

      {/* 대량 우편 */}
      <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-sm font-semibold">대량 우편 (골드)</h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          골드 + 메시지를 우편함으로 발송합니다(수신자가 수령). 보정금·이벤트 보상용.
          <strong> 전체 발송</strong>은 모든 유저에게 골드를 지급하는 강력한 작업입니다.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="대상">
            <Select
              value={target}
              onChange={(v) => setTarget(v)}
              disabled={mailDisabled}
              options={[
                { value: "user", label: "특정 유저" },
                { value: "all", label: "전체 유저" },
              ]}
            />
          </Field>
          {target === "user" && (
            <Field label="유저 ID" hint="유저 탭에서 복사한 user id">
              <TextInput
                value={userId}
                onChange={setUserId}
                placeholder="user id"
                disabled={mailDisabled}
              />
            </Field>
          )}
          <Field label="골드">
            <NumberInput
              value={gold}
              min={1}
              disabled={mailDisabled}
              onChange={setGold}
            />
          </Field>
        </div>
        <div className="mt-2">
          <Field label="메시지 (선택)">
            <TextInput
              value={mailMsg}
              onChange={setMailMsg}
              placeholder="예: 점검 보상입니다. (최대 300자)"
              disabled={mailDisabled}
            />
          </Field>
        </div>
        <div className="mt-3">
          {target === "all" ? (
            <DangerAction
              trigger="전체 발송"
              title="전체 유저에게 골드 우편 발송"
              description={`모든 유저에게 ${gold.toLocaleString()} 골드를 우편으로 발송합니다. 되돌릴 수 없습니다(수령 전 우편 회수 불가).`}
              confirmText="SEND ALL"
              disabled={mailDisabled || gold <= 0}
              onConfirm={() => void sendMail()}
            />
          ) : (
            <Button
              variant="primary"
              disabled={mailDisabled || gold <= 0 || !userId.trim()}
              onClick={() => void sendMail()}
            >
              {sending ? "발송 중…" : "우편 발송"}
            </Button>
          )}
        </div>
      </div>

      {readOnly && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          보기 전용 모드 — 상단에서 편집 가능으로 전환해야 동작합니다.
        </p>
      )}
    </section>
  );
}
