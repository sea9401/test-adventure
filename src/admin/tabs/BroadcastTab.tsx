"use client";

import { useMemo, useState } from "react";
import { useAdmin } from "../AdminContext";
import { adminPost } from "../api";
import {
  v2EquipmentOptions,
  v2MaterialOptions,
  type CatalogOption,
} from "../adminCatalogOptions";
import { Button, Field, NumberInput, Select, TextInput } from "../ui/Field";
import {
  AttachmentPicker,
  type AttachmentEntry,
} from "../ui/AttachmentPicker";
import { DangerAction } from "../ui/DangerAction";
import { BULLETIN_NOTICE_MAX_LENGTH } from "@/lib/bulletin-config";

// 공지/방송 + 대량 우편.
//   공지: 기존 게시판 notice 카테고리(admin 전용) 재사용 — POST /api/bulletin. 본문 최대 3000자.
//   우편: POST /api/admin/mail — 골드 + 재료/장비/소비템 + 메시지를 한 유저/전체 유저에게 우편함으로 발송.
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

  // 우편 첨부 — 재료/장비/소비템 목록(선택·수량 UI 는 AttachmentPicker 내부 상태).
  const [attachMaterials, setAttachMaterials] = useState<AttachmentEntry[]>([]);
  const [attachItems, setAttachItems] = useState<AttachmentEntry[]>([]);
  const [attachConsumables, setAttachConsumables] = useState<AttachmentEntry[]>(
    [],
  );

  // 카탈로그 옵션 (V2GrantSection 과 공용 — adminCatalogOptions).
  const materialOptions = useMemo(() => v2MaterialOptions(), []);
  const equipOptions = useMemo(() => v2EquipmentOptions(), []);
  const consumableOptions = useMemo<CatalogOption[]>(
    () => [
      {
        id: "stamina_potion",
        name: "스태미나 회복약",
        label: "스태미나 회복약 (stamina_potion)",
      },
    ],
    [],
  );

  const noticeDisabled = readOnly || posting;
  const mailDisabled = readOnly || sending;
  const hasReward =
    gold > 0 ||
    attachMaterials.length > 0 ||
    attachItems.length > 0 ||
    attachConsumables.length > 0;

  const postNotice = async () => {
    if (readOnly) {
      showToast("보기 전용 모드 — 변경 불가");
      return;
    }
    setPosting(true);
    try {
      // 게시판 라우트는 admin envelope 이 아니라 text 에러를 반환 — adminPost 미사용.
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
      const j = await adminPost<{
        recipients?: number;
        materials?: unknown[];
        items?: unknown[];
        staminaPotions?: number;
      }>("/api/admin/mail", {
        target,
        userId,
        gold,
        materials: attachMaterials.map((e) => ({
          materialId: e.id,
          count: e.count,
        })),
        items: attachItems.map((e) => ({ itemId: e.id, count: e.count })),
        staminaPotions:
          attachConsumables.find((e) => e.id === "stamina_potion")?.count ?? 0,
        message: mailMsg,
      });
      const parts: string[] = [];
      if (gold > 0) parts.push(`${gold.toLocaleString()} 골드`);
      const matCount = j.materials?.length ?? 0;
      const itemCount = j.items?.length ?? 0;
      if (matCount > 0) parts.push(`재료 ${matCount}종`);
      if (itemCount > 0) parts.push(`장비 ${itemCount}종`);
      if ((j.staminaPotions ?? 0) > 0) {
        parts.push(`스태미나 회복약 ${j.staminaPotions}개`);
      }
      showToast(
        `우편 발송 완료 — ${j.recipients ?? 0}명에게 ${parts.join(" · ") || "(빈 우편)"}`,
      );
      setMailMsg("");
      setAttachMaterials([]);
      setAttachItems([]);
      setAttachConsumables([]);
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
          광장 게시판 <strong>공지사항</strong> 카테고리에 게시됩니다(작성자는 &quot;운영자&quot;로
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
              rows={6}
              maxLength={BULLETIN_NOTICE_MAX_LENGTH}
              placeholder={`공지 내용 (최대 ${BULLETIN_NOTICE_MAX_LENGTH}자)`}
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </Field>
          <div className="flex items-center justify-between">
            <Button
              variant="primary"
              disabled={noticeDisabled || !title.trim() || !content.trim()}
              onClick={() => void postNotice()}
            >
              {posting ? "게시 중…" : "공지 게시"}
            </Button>
            <span
              className={`text-[11px] ${
                content.length > BULLETIN_NOTICE_MAX_LENGTH
                  ? "text-red-500"
                  : "text-zinc-400 dark:text-zinc-500"
              }`}
            >
              {content.length} / {BULLETIN_NOTICE_MAX_LENGTH}
            </span>
          </div>
        </div>
      </div>

      {/* 대량 우편 */}
      <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-sm font-semibold">대량 우편 (골드·재료·장비·소비템)</h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          골드 + 재료/장비/소비템 + 메시지를 우편함으로 발송합니다(수신자가 수령). 보정금·이벤트
          보상용. 장비는 base 등급으로 지급됩니다.
          <strong> 전체 발송</strong>은 모든 유저에게 자원을 지급하는 강력한 작업입니다.
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
          <Field label="골드" hint="0 이면 골드 없이 재료/장비만 발송">
            <NumberInput
              value={gold}
              min={0}
              disabled={mailDisabled}
              onChange={(n) => setGold(Math.max(0, Math.floor(n)))}
            />
          </Field>
        </div>

        <AttachmentPicker
          label="재료 첨부"
          options={materialOptions}
          entries={attachMaterials}
          onChange={setAttachMaterials}
          disabled={mailDisabled}
        />
        <AttachmentPicker
          label="장비 첨부 (base 등급)"
          options={equipOptions}
          entries={attachItems}
          onChange={setAttachItems}
          disabled={mailDisabled}
        />
        <AttachmentPicker
          label="소비 아이템 첨부"
          options={consumableOptions}
          entries={attachConsumables}
          onChange={setAttachConsumables}
          disabled={mailDisabled}
        />

        <div className="mt-3">
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
              title="전체 유저에게 우편 발송"
              description={`모든 유저에게 ${gold.toLocaleString()} 골드${
                attachMaterials.length > 0
                  ? ` · 재료 ${attachMaterials.length}종`
                  : ""
              }${
                attachItems.length > 0 ? ` · 장비 ${attachItems.length}종` : ""
              }${
                attachConsumables.length > 0
                  ? ` · 소비템 ${attachConsumables.length}종`
                  : ""
              }을 우편으로 발송합니다. 되돌릴 수 없습니다(수령 전 우편 회수 불가).`}
              confirmText="SEND ALL"
              disabled={mailDisabled || !hasReward}
              onConfirm={() => void sendMail()}
            />
          ) : (
            <Button
              variant="primary"
              disabled={mailDisabled || !hasReward || !userId.trim()}
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
