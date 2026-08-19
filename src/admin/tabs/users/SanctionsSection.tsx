"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import { useAdmin } from "../../AdminContext";
import { adminGet, adminPost } from "../../api";
import { Button, NumberInput, TextInput } from "../../ui/Field";
import { DangerAction } from "../../ui/DangerAction";

type SanctionRow = {
  id: number;
  type: string;
  reason: string;
  expiresAt: string | null;
  createdByEmail: string;
  createdAt: string;
  acknowledgedAt: string | null;
  liftedAt: string | null;
  liftedByEmail: string | null;
};

type TradeStatus = {
  suspended: boolean;
  suspendedUntil: string | null;
  reason: string | null;
  permanent: boolean;
};

type StatusResponse = {
  ok: boolean;
  banned: boolean;
  bannedUntil: string | null;
  banReason: string | null;
  permanent: boolean;
  trade: TradeStatus;
  sanctions: SanctionRow[];
};

type TradeCleanup = {
  listingsCancelled: number;
  buyOrdersCancelled: number;
  highestBidsCleared: number;
  refundedGold: number;
};

type SanctionResult = { cleanup?: TradeCleanup };
type ScopedTradeCleanup = { userId: string; cleanup: TradeCleanup };
type AccountAction = "ban" | "suspend" | "extend" | "warn" | "lift";
type TradeAction = "ban" | "suspend" | "extend" | "lift";

const TYPE_LABELS: Record<string, string> = {
  ban: "영구 밴",
  suspend: "기간 정지",
  warn: "경고",
  trade_ban: "영구 거래 정지",
  trade_suspend: "기간 거래 정지",
};

const SANCTION_PRESETS = [
  {
    label: "매크로 의심 경고",
    action: "warn" as const,
    days: 0,
    reason: "비정상 반복 플레이 패턴이 확인되어 경고 처리되었습니다.",
    adminMemo: "제한 이벤트·반복 요청 패턴 확인",
  },
  {
    label: "1일 정지",
    action: "suspend" as const,
    days: 1,
    reason: "반복 요청 제한 초과로 1일 이용 제한이 적용되었습니다.",
    adminMemo: "rate_limited 누적, 단기 정지",
  },
  {
    label: "3일 정지",
    action: "suspend" as const,
    days: 3,
    reason: "자동화 의심 행위가 반복되어 3일 이용 제한이 적용되었습니다.",
    adminMemo: "자동화 의심 반복, 중기 정지",
  },
  {
    label: "동일 IP 다계정",
    action: "suspend" as const,
    days: 3,
    reason: "동일 접속 환경에서 비정상 다계정 이용 정황이 확인되었습니다.",
    adminMemo: "IP 연결 계정/행동 패턴 교차 확인 필요",
  },
  {
    label: "보상 악용",
    action: "suspend" as const,
    days: 7,
    reason: "보상 시스템 악용 정황이 확인되어 이용 제한이 적용되었습니다.",
    adminMemo: "경제 로그와 보상 수령 이력 확인",
  },
  {
    label: "영구 정지",
    action: "ban" as const,
    days: 0,
    reason: "명백한 자동화 또는 악용 행위로 영구 이용 제한이 적용되었습니다.",
    adminMemo: "영구 차단 근거 확인 완료",
  },
];

const TRADE_SANCTION_PRESETS = [
  {
    label: "1일 거래 정지",
    days: 1,
    reason: "거래 이용 정책 위반으로 1일 거래 정지가 적용되었습니다.",
    adminMemo: "거래 로그 확인, 단기 거래 정지",
  },
  {
    label: "3일 거래 정지",
    days: 3,
    reason: "거래 이용 정책 위반이 반복되어 3일 거래 정지가 적용되었습니다.",
    adminMemo: "거래 로그 확인, 중기 거래 정지",
  },
  {
    label: "7일 거래 정지",
    days: 7,
    reason: "중대한 거래 이용 정책 위반으로 7일 거래 정지가 적용되었습니다.",
    adminMemo: "거래 로그 확인, 장기 거래 정지",
  },
];

function formatAccountStatus(status: StatusResponse | null) {
  if (!status) return "조회 중…";
  if (!status.banned) return "✅ 정상 — 차단 없음";
  if (status.permanent)
    return `🚫 영구 밴 중${status.banReason ? ` — ${status.banReason}` : ""}`;
  return `⏳ ${new Date(status.bannedUntil!).toLocaleString("ko-KR")} 까지 정지 중${status.banReason ? ` — ${status.banReason}` : ""}`;
}

function formatTradeStatus(trade: TradeStatus | undefined) {
  if (!trade) return "조회 중…";
  if (!trade.suspended) return "✅ 거래 가능 — 제한 없음";
  if (trade.permanent)
    return `🚫 영구 거래 정지 중${trade.reason ? ` — ${trade.reason}` : ""}`;
  return `⏳ ${new Date(trade.suspendedUntil!).toLocaleString("ko-KR")} 까지 거래 정지 중${trade.reason ? ` — ${trade.reason}` : ""}`;
}

function SanctionHistory({ sanctions }: { sanctions: SanctionRow[] }) {
  if (sanctions.length === 0) return null;
  return (
    <div className={`${SURFACE_INSET} mt-3 p-3`}>
      <div className="mb-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
        이력 (최근 {sanctions.length})
      </div>
      <ul className="space-y-2 border-l border-zinc-200 pl-3 dark:border-zinc-700">
        {sanctions.map((s) => (
          <li
            key={s.id}
            className="relative text-[11px] text-zinc-600 dark:text-zinc-300"
          >
            <span className="absolute -left-[17px] top-2 h-2 w-2 rounded-full bg-amber-500" />
            <span className="font-semibold">
              {TYPE_LABELS[s.type] ?? s.type}
            </span>
            {s.reason ? <> — {s.reason}</> : null}
            {s.expiresAt ? (
              <span className="ml-1 text-zinc-400">
                · 만료 {new Date(s.expiresAt).toLocaleString("ko-KR")}
              </span>
            ) : null}
            {s.acknowledgedAt ? (
              <span className="text-sky-600 dark:text-sky-400">
                {" "}
                · 유저 확인 {new Date(s.acknowledgedAt).toLocaleString("ko-KR")}
              </span>
            ) : null}
            {s.liftedAt ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                {" "}
                · 해제 {new Date(s.liftedAt).toLocaleString("ko-KR")}
              </span>
            ) : null}
            <span className="ml-1 text-zinc-400">
              · {new Date(s.createdAt).toLocaleString("ko-KR")} ·{" "}
              {s.createdByEmail}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// 계정 제재와 거래 제재는 서로 다른 상태·사유·기간을 사용한다.
export function SanctionsSection({
  userId,
  readOnly,
}: {
  userId: string;
  readOnly: boolean;
}) {
  const { showToast, adminMe } = useAdmin();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accountReason, setAccountReason] = useState("");
  const [accountAdminMemo, setAccountAdminMemo] = useState("");
  const [accountDays, setAccountDays] = useState(7);
  const [tradeReason, setTradeReason] = useState("");
  const [tradeAdminMemo, setTradeAdminMemo] = useState("");
  const [tradeDays, setTradeDays] = useState(7);
  const [tradeCleanup, setTradeCleanup] = useState<ScopedTradeCleanup | null>(
    null,
  );
  const selectedUserIdRef = useRef(userId);
  const loadRequestRef = useRef(0);

  useLayoutEffect(() => {
    selectedUserIdRef.current = userId;
  }, [userId]);

  const load = useCallback(async () => {
    if (selectedUserIdRef.current !== userId) return;
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    try {
      const nextStatus = await adminGet<StatusResponse>(
        `/api/admin/sanctions?userId=${encodeURIComponent(userId)}`,
      );
      if (
        selectedUserIdRef.current === userId &&
        loadRequestRef.current === requestId
      ) {
        setStatus(nextStatus);
      }
    } catch (e) {
      if (
        selectedUserIdRef.current === userId &&
        loadRequestRef.current === requestId
      ) {
        showToast(`제재 조회 실패: ${e instanceof Error ? e.message : "오류"}`);
      }
    } finally {
      if (
        selectedUserIdRef.current === userId &&
        loadRequestRef.current === requestId
      ) {
        setLoading(false);
      }
    }
  }, [userId, showToast]);

  useEffect(() => {
    // 유저 선택이 바뀌면 다시 로드.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const actAccount = async (
    action: AccountAction,
    overrideDays = accountDays,
  ) => {
    setBusy(true);
    try {
      await adminPost("/api/admin/sanctions", {
        userId,
        action,
        reason: accountReason,
        adminMemo: accountAdminMemo,
        days: overrideDays,
      });
      const label =
        action === "lift"
          ? "제재 해제"
          : action === "extend"
            ? "제재 연장"
            : (TYPE_LABELS[action] ?? action);
      showToast(`${label} 적용 완료`);
      if (action !== "warn") setAccountReason("");
      await load();
    } catch (e) {
      showToast(`처리 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setBusy(false);
    }
  };

  const actTrade = async (action: TradeAction, overrideDays = tradeDays) => {
    setBusy(true);
    try {
      const result = await adminPost<SanctionResult>("/api/admin/sanctions", {
        userId,
        scope: "trade",
        action,
        reason:
          action === "extend"
            ? tradeReason || status?.trade.reason || ""
            : tradeReason,
        adminMemo: tradeAdminMemo,
        days: overrideDays,
      });
      const label =
        action === "lift"
          ? "거래 제재 해제"
          : action === "extend"
            ? "거래 제재 연장"
            : action === "ban"
              ? "영구 거래 정지"
              : "기간 거래 정지";
      setTradeCleanup(
        result.cleanup ? { userId, cleanup: result.cleanup } : null,
      );
      showToast(`${label} 적용 완료`);
      if (action !== "lift") setTradeReason("");
      await load();
    } catch (e) {
      showToast(`처리 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setBusy(false);
    }
  };

  const applyAccountPreset = (preset: (typeof SANCTION_PRESETS)[number]) => {
    setAccountReason(preset.reason);
    setAccountAdminMemo(preset.adminMemo);
    if (preset.days > 0) setAccountDays(preset.days);
  };
  const applyTradePreset = (
    preset: (typeof TRADE_SANCTION_PRESETS)[number],
  ) => {
    setTradeReason(preset.reason);
    setTradeAdminMemo(preset.adminMemo);
    setTradeDays(preset.days);
  };

  const banned = status?.banned ?? false;
  const tradeSuspended = status?.trade.suspended ?? false;
  const accountSanctions =
    status?.sanctions.filter(
      (sanction) =>
        sanction.type === "ban" ||
        sanction.type === "suspend" ||
        sanction.type === "warn",
    ) ?? [];
  const tradeSanctions =
    status?.sanctions.filter(
      (sanction) =>
        sanction.type === "trade_suspend" || sanction.type === "trade_ban",
    ) ?? [];
  const selectedTradeCleanup =
    tradeCleanup?.userId === userId ? tradeCleanup.cleanup : null;
  const canSanction = Boolean(adminMe?.capabilities.sanction);
  const disabled = readOnly || loading || busy || !canSanction;

  return (
    <div className="space-y-3">
      <section className={`${SURFACE_ACCENT} p-3`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            제재 (밴 / 정지 / 경고)
          </h2>
          <Button onClick={() => void load()} disabled={loading || busy}>
            {loading ? "조회 중…" : "새로고침"}
          </Button>
        </div>
        <div className={`${SURFACE_INSET} mt-3 p-3`}>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {loading ? "조회 중…" : formatAccountStatus(status)}
          </p>
        </div>
        <div className="mt-3 space-y-2">
          <TextInput
            value={accountReason}
            onChange={setAccountReason}
            placeholder="유저 노출 사유"
            disabled={disabled}
          />
          <TextInput
            value={accountAdminMemo}
            onChange={setAccountAdminMemo}
            placeholder="관리자 메모 (감사 로그에만 기록)"
            disabled={disabled}
          />
          <div className="flex flex-wrap gap-1">
            {SANCTION_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={disabled}
                onClick={() => applyAccountPreset(preset)}
                className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={disabled} onClick={() => void actAccount("warn")}>
              경고 기록
            </Button>
            <div className="flex items-center gap-1">
              <div className="w-16">
                <NumberInput
                  value={accountDays}
                  min={1}
                  disabled={disabled}
                  onChange={setAccountDays}
                />
              </div>
              <span className="text-xs text-zinc-500">일</span>
              <DangerAction
                trigger="기간 정지"
                title="기간 정지"
                description={`${accountDays}일간 이 유저의 모든 게임 행동을 차단합니다(로그인은 가능하나 API 401). 사유: ${accountReason || "(없음)"}`}
                confirmText="SUSPEND"
                disabled={disabled}
                onConfirm={() => void actAccount("suspend")}
              />
            </div>
            <DangerAction
              trigger="영구 밴"
              title="영구 밴"
              description={`이 유저를 영구 차단합니다(해제 전까지 모든 게임 행동 불가). 사유: ${accountReason || "(없음)"}`}
              confirmText="BAN"
              disabled={disabled}
              onConfirm={() => void actAccount("ban")}
            />
            {banned && (
              <>
                <Button
                  disabled={disabled}
                  onClick={() => void actAccount("extend", 1)}
                >
                  1일 연장
                </Button>
                <Button
                  disabled={disabled}
                  onClick={() => void actAccount("extend", 3)}
                >
                  3일 연장
                </Button>
                <Button
                  variant="primary"
                  disabled={disabled}
                  onClick={() => void actAccount("lift")}
                >
                  제재 해제
                </Button>
              </>
            )}
          </div>
        </div>
        {status ? <SanctionHistory sanctions={accountSanctions} /> : null}
        {readOnly && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            보기 전용 모드 — 상단에서 편집 가능으로 전환해야 동작합니다.
          </p>
        )}
        {!canSanction && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            현재 계정에는 제재 권한이 없습니다.
          </p>
        )}
      </section>

      <section className={`${SURFACE_CARD} p-3`}>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          거래 제재
        </h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          거래소·유저 간 경제 활동만 제한합니다. 계정 제재 해제와는 독립적으로
          유지됩니다.
        </p>
        <div className={`${SURFACE_INSET} mt-3 p-3`}>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {loading ? "조회 중…" : formatTradeStatus(status?.trade)}
          </p>
        </div>
        <div className="mt-3 space-y-2">
          <TextInput
            value={tradeReason}
            onChange={setTradeReason}
            placeholder="거래 제재 유저 노출 사유"
            disabled={disabled}
          />
          <TextInput
            value={tradeAdminMemo}
            onChange={setTradeAdminMemo}
            placeholder="거래 제재 관리자 메모 (감사 로그에만 기록)"
            disabled={disabled}
          />
          <div className="flex flex-wrap gap-1">
            {TRADE_SANCTION_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                disabled={disabled}
                onClick={() => applyTradePreset(preset)}
                className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="w-16">
                <NumberInput
                  value={tradeDays}
                  min={1}
                  disabled={disabled}
                  onChange={setTradeDays}
                />
              </div>
              <span className="text-xs text-zinc-500">일</span>
              <DangerAction
                trigger="기간 거래 정지"
                title="기간 거래 정지"
                description={`${tradeDays}일간 이 유저의 거래소·유저 간 경제 활동을 차단합니다. 사유: ${tradeReason || "(없음)"}`}
                confirmText="TRADE SUSPEND"
                disabled={disabled}
                onConfirm={() => void actTrade("suspend")}
              />
            </div>
            <DangerAction
              trigger="영구 거래 정지"
              title="영구 거래 정지"
              description={`이 유저의 거래소·유저 간 경제 활동을 해제 전까지 차단합니다. 사유: ${tradeReason || "(없음)"}`}
              confirmText="TRADE BAN"
              disabled={disabled}
              onConfirm={() => void actTrade("ban")}
            />
            {tradeSuspended && (
              <>
                <Button
                  disabled={disabled}
                  onClick={() => void actTrade("extend", 1)}
                >
                  1일 거래 연장
                </Button>
                <Button
                  disabled={disabled}
                  onClick={() => void actTrade("extend", 3)}
                >
                  3일 거래 연장
                </Button>
                <Button
                  variant="primary"
                  disabled={disabled}
                  onClick={() => void actTrade("lift")}
                >
                  거래 제재 해제
                </Button>
              </>
            )}
          </div>
        </div>
        {selectedTradeCleanup && (
          <div
            className={`${SURFACE_INSET} mt-3 p-3 text-xs text-zinc-600 dark:text-zinc-300`}
          >
            거래 노출 정리 결과 — 취소 매물{" "}
            {selectedTradeCleanup.listingsCancelled}건 · 취소 구매 주문{" "}
            {selectedTradeCleanup.buyOrdersCancelled}건 · 해제 최고 입찰{" "}
            {selectedTradeCleanup.highestBidsCleared}건 · 반환 골드{" "}
            {selectedTradeCleanup.refundedGold.toLocaleString()}
          </div>
        )}
        <SanctionHistory sanctions={tradeSanctions} />
      </section>
    </div>
  );
}
