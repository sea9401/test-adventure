"use client";

import { useMemo, useState } from "react";
import { useAdmin } from "../AdminContext";
import { adminGet, adminPost } from "../api";
import {
  cookingIngredientOptions,
  v2EquipmentOptions,
  v2MaterialOptions,
} from "../adminCatalogOptions";
import {
  adminMailCashItemOptions,
  adminMailConsumableOptions,
  splitAdminMailConsumables,
} from "../broadcastMailAttachments";
import {
  exactMailRecipient,
  mailRecipientMatches,
} from "../mailRecipient";
import { Button, Field, NumberInput, Select, TextInput } from "../ui/Field";
import {
  AttachmentPicker,
  type AttachmentEntry,
} from "../ui/AttachmentPicker";
import { DangerAction } from "../ui/DangerAction";
import { BULLETIN_NOTICE_MAX_LENGTH } from "@/lib/bulletin-config";
import { ADVENTURE_SUPPORT_MAX_GRANT_DAYS } from "@/adventure/data/v2/adventureSupport";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import type { AdminUserRow } from "./users/types";

// 공지/방송 + 대량 우편.
//   공지: 기존 게시판 notice 카테고리(admin 전용) 재사용 — POST /api/bulletin. 본문 최대 20000자.
//   우편: POST /api/admin/mail — 골드 + 재료/장비/소비템/무슨 코인 + 메시지를 발송.
export function BroadcastTab() {
  const { readOnly, showToast } = useAdmin();

  // 공지
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);

  // 대량 우편
  const [target, setTarget] = useState<"all" | "user">("user");
  const [recipientQuery, setRecipientQuery] = useState("");
  const [recipientResults, setRecipientResults] = useState<AdminUserRow[]>([]);
  const [selectedRecipient, setSelectedRecipient] =
    useState<AdminUserRow | null>(null);
  const [recipientSearching, setRecipientSearching] = useState(false);
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [gold, setGold] = useState(1000);
  const [museunCoins, setMuseunCoins] = useState(0);
  const [adventureSupportDays, setAdventureSupportDays] = useState(0);
  const [mailMsg, setMailMsg] = useState("");
  const [sending, setSending] = useState(false);

  // 우편 첨부 — 재료/요리 재료/장비/소비템/코인샵 아이템 목록.
  const [attachMaterials, setAttachMaterials] = useState<AttachmentEntry[]>([]);
  const [attachCookingIngredients, setAttachCookingIngredients] = useState<
    AttachmentEntry[]
  >([]);
  const [attachItems, setAttachItems] = useState<AttachmentEntry[]>([]);
  const [attachConsumables, setAttachConsumables] = useState<AttachmentEntry[]>(
    [],
  );
  const [attachCashItems, setAttachCashItems] = useState<AttachmentEntry[]>([]);

  // 카탈로그 옵션 (V2GrantSection 과 공용 — adminCatalogOptions).
  const materialOptions = useMemo(() => v2MaterialOptions(), []);
  const cookingOptions = useMemo(() => cookingIngredientOptions(), []);
  const equipOptions = useMemo(() => v2EquipmentOptions(), []);
  const consumableOptions = useMemo(() => adminMailConsumableOptions(), []);
  const cashItemOptions = useMemo(() => adminMailCashItemOptions(), []);

  const noticeDisabled = readOnly || posting;
  const mailDisabled = readOnly || sending;
  const hasReward =
    gold > 0 ||
    museunCoins > 0 ||
    attachMaterials.length > 0 ||
    attachCookingIngredients.length > 0 ||
    attachItems.length > 0 ||
    attachConsumables.length > 0 ||
    attachCashItems.length > 0 ||
    adventureSupportDays > 0;

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

  const searchRecipient = async () => {
    const query = recipientQuery.trim();
    if (!query) return;
    setRecipientSearching(true);
    setRecipientError(null);
    setSelectedRecipient(null);
    try {
      const rows = await adminGet<AdminUserRow[]>(
        `/api/admin/users?q=${encodeURIComponent(query)}`,
      );
      const matches = mailRecipientMatches(rows, query);
      const exact = exactMailRecipient(matches, query);
      if (exact) {
        setSelectedRecipient(exact);
        setRecipientQuery(exact.gameName ?? query);
        setRecipientResults([]);
      } else {
        setRecipientResults(matches);
        if (matches.length === 0) {
          setRecipientError("일치하는 닉네임을 찾지 못했습니다.");
        }
      }
    } catch (e) {
      setRecipientResults([]);
      setRecipientError(
        `닉네임 검색 실패: ${e instanceof Error ? e.message : "오류"}`,
      );
    } finally {
      setRecipientSearching(false);
    }
  };

  const selectRecipient = (user: AdminUserRow) => {
    setSelectedRecipient(user);
    setRecipientQuery(user.gameName ?? "");
    setRecipientResults([]);
    setRecipientError(null);
  };

  const changeRecipientQuery = (value: string) => {
    setRecipientQuery(value);
    setSelectedRecipient(null);
    setRecipientResults([]);
    setRecipientError(null);
  };

  const sendMail = async () => {
    setSending(true);
    try {
      const consumables = splitAdminMailConsumables(
        attachConsumables,
        attachCashItems,
      );
      const j = await adminPost<{
        recipients?: number;
        materials?: unknown[];
        cookingIngredients?: unknown[];
        items?: unknown[];
        staminaPotions?: number;
        museunCoins?: number;
        cashItems?: { itemId: string; count: number }[];
        adventureSupportDays?: number;
      }>("/api/admin/mail", {
        target,
        userId: selectedRecipient?.id ?? "",
        gold,
        materials: attachMaterials.map((e) => ({
          materialId: e.id,
          count: e.count,
        })),
        cookingIngredients: attachCookingIngredients.map((entry) => ({
          ingredientId: entry.id,
          count: entry.count,
        })),
        items: attachItems.map((e) => ({ itemId: e.id, count: e.count })),
        staminaPotions: consumables.staminaPotions,
        museunCoins,
        cashItems: consumables.cashItems,
        adventureSupportDays,
        message: mailMsg,
      });
      const parts: string[] = [];
      if (gold > 0) parts.push(`${gold.toLocaleString()} 골드`);
      const matCount = j.materials?.length ?? 0;
      const cookingIngredientCount = j.cookingIngredients?.length ?? 0;
      const itemCount = j.items?.length ?? 0;
      if (matCount > 0) parts.push(`재료 ${matCount}종`);
      if (cookingIngredientCount > 0) {
        parts.push(`요리 재료 ${cookingIngredientCount}종`);
      }
      if (itemCount > 0) parts.push(`장비 ${itemCount}종`);
      if ((j.staminaPotions ?? 0) > 0) {
        parts.push(`스태미나 회복약 ${j.staminaPotions}개`);
      }
      if ((j.museunCoins ?? 0) > 0) {
        parts.push(`무슨 코인 ${(j.museunCoins ?? 0).toLocaleString()}개`);
      }
      if ((j.cashItems?.length ?? 0) > 0) {
        parts.push(`무슨 코인샵 아이템 ${j.cashItems?.length ?? 0}종`);
      }
      if ((j.adventureSupportDays ?? 0) > 0) {
        parts.push(`월간 모험 지원권 ${j.adventureSupportDays}일`);
      }
      showToast(
        `우편 발송 완료 — ${
          target === "user" && selectedRecipient?.gameName
            ? `${selectedRecipient.gameName}님에게`
            : `${j.recipients ?? 0}명에게`
        } ${parts.join(" · ") || "(빈 우편)"}`,
      );
      setMailMsg("");
      setAttachMaterials([]);
      setAttachCookingIngredients([]);
      setAttachItems([]);
      setAttachConsumables([]);
      setAttachCashItems([]);
      setMuseunCoins(0);
      setAdventureSupportDays(0);
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
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            접기: <code>:::details 제목</code>으로 시작하고 접을 내용 아래에{" "}
            <code>:::</code>만 입력해 닫습니다. 내부 마크다운도 적용되며, 문단
            사이는 빈 줄로 구분합니다.
          </p>
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
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {content.length} / {BULLETIN_NOTICE_MAX_LENGTH}
            </span>
          </div>
        </div>
      </div>

      {/* 대량 우편 */}
      <div className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-sm font-semibold">
          대량 우편 (골드·재료·요리 재료·장비·소비템·무슨 코인·지원권)
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          골드 + 재료/요리 재료/장비/소비템/무슨 코인 + 메시지를 우편함으로 발송합니다(수신자가 수령).
          보정금·이벤트 보상용. 장비는 기본 등급으로 지급됩니다.
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
            <div>
              <span className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                수신자 닉네임
              </span>
              <form
                className="mt-1 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void searchRecipient();
                }}
              >
                <TextInput
                  value={recipientQuery}
                  onChange={changeRecipientQuery}
                  placeholder="닉네임 입력"
                  disabled={mailDisabled}
                />
                <Button
                  type="submit"
                  disabled={
                    mailDisabled || recipientSearching || !recipientQuery.trim()
                  }
                >
                  {recipientSearching ? "검색 중…" : "검색"}
                </Button>
              </form>
              <span className="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-500">
                닉네임을 검색한 뒤 정확한 계정을 선택하세요.
              </span>

              {recipientError ? (
                <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
                  {recipientError}
                </p>
              ) : null}

              {selectedRecipient ? (
                <div className={`${SURFACE_INSET} mt-2 flex items-start gap-2 p-2`}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                      수신자 선택됨 · {selectedRecipient.gameName}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                      {selectedRecipient.email ?? "이메일 없음"}
                    </div>
                    <div className="mt-0.5 break-all font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                      ID {selectedRecipient.id}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={mailDisabled}
                    onClick={() => changeRecipientQuery("")}
                    className="shrink-0 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    변경
                  </button>
                </div>
              ) : null}

              {recipientResults.length > 0 ? (
                <div
                  role="listbox"
                  aria-label="닉네임 검색 결과"
                  className={`${SURFACE_INSET} mt-2 max-h-48 overflow-y-auto p-1`}
                >
                  {recipientResults.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => selectRecipient(user)}
                      disabled={mailDisabled}
                      className="block w-full rounded-md px-2 py-2 text-left hover:bg-white disabled:opacity-50 dark:hover:bg-zinc-800"
                    >
                      <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {user.gameName}
                      </span>
                      <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                        {user.email ?? "이메일 없음"} · ID {user.id.slice(0, 12)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
          <Field label="골드" hint="0이면 미첨부">
            <NumberInput
              value={gold}
              min={0}
              disabled={mailDisabled}
              onChange={(n) => setGold(Math.max(0, Math.floor(n)))}
            />
          </Field>
          <Field label="무슨 코인" hint="0이면 미첨부 · 수령 시 코인 지갑에 적립">
            <NumberInput
              value={museunCoins}
              min={0}
              disabled={mailDisabled}
              onChange={(n) => setMuseunCoins(Math.max(0, Math.floor(n)))}
            />
          </Field>
          <Field
            label="월간 모험 지원권"
            hint="0이면 미첨부 · 수령 시점부터 시작 · 활성 이용자는 기간 연장"
          >
            <NumberInput
              value={adventureSupportDays}
              min={0}
              max={ADVENTURE_SUPPORT_MAX_GRANT_DAYS}
              disabled={mailDisabled}
              onChange={(n) =>
                setAdventureSupportDays(
                  Math.max(
                    0,
                    Math.min(
                      ADVENTURE_SUPPORT_MAX_GRANT_DAYS,
                      Math.floor(n),
                    ),
                  ),
                )
              }
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
          label="요리 재료 첨부"
          options={cookingOptions}
          entries={attachCookingIngredients}
          onChange={setAttachCookingIngredients}
          disabled={mailDisabled}
        />
        <AttachmentPicker
          label="장비 첨부 (기본 등급)"
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
        <AttachmentPicker
          label="무슨 코인샵 아이템 첨부"
          options={cashItemOptions}
          entries={attachCashItems}
          onChange={setAttachCashItems}
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
                attachCookingIngredients.length > 0
                  ? ` · 요리 재료 ${attachCookingIngredients.length}종`
                  : ""
              }${
                attachItems.length > 0 ? ` · 장비 ${attachItems.length}종` : ""
              }${
                attachConsumables.length > 0
                  ? ` · 소비템 ${attachConsumables.length}종`
                  : ""
              }${museunCoins > 0 ? ` · 무슨 코인 ${museunCoins.toLocaleString()}개` : ""}${
                attachCashItems.length > 0
                  ? ` · 무슨 코인샵 아이템 ${attachCashItems.length}종`
                  : ""
              }${
                adventureSupportDays > 0
                  ? ` · 월간 모험 지원권 ${adventureSupportDays}일`
                  : ""
              }을 우편으로 발송합니다. 되돌릴 수 없습니다(수령 전 우편 회수 불가).`}
              confirmText="SEND ALL"
              disabled={mailDisabled || !hasReward}
              onConfirm={() => void sendMail()}
            />
          ) : (
            <Button
              variant="primary"
              disabled={mailDisabled || !hasReward || !selectedRecipient}
              onClick={() => void sendMail()}
            >
              {sending ? "발송 중…" : "우편 발송"}
            </Button>
          )}
        </div>
      </div>

      {readOnly && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          보기 전용 모드 — 상단에서 편집 가능으로 전환해야 동작합니다.
        </p>
      )}
    </section>
  );
}
