"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAdmin } from "../../AdminContext";
import { adminGet, adminPost } from "../../api";
import {
  economyCountKeyLabel,
  economyEventLabel,
  economyItemKindLabel,
  economyItemLabel,
  economyKnownItemName,
} from "../../economyLabels";
import { adminLogLabel, jobLabel, skillLabel } from "../../displayLabels";
import { Button } from "../../ui/Field";
import { useAsyncData } from "@/lib/useAsyncData";
import { V2_SLOT_LABEL, type V2EquipSlot } from "@/adventure/data/v2/v2Equipment";

type OpsEventRow = {
  id: number;
  eventType: string;
  goldDelta: number;
  itemKind: string | null;
  itemId: string | null;
  quantity: number | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

type OpsSummary = {
  summary: {
    gold: number;
    bankedGold: number;
    fishingCoins: number;
    treasureCoins: number;
    masteryCertificates: number;
    staminaPotions: number;
  };
  snapshot: {
    name: string | null;
    level: number;
    exp: number;
    hp: number;
    classId: string | null;
    specChoice: string | null;
    guild: string;
    stamina: {
      current: number;
      max: number;
      lastUpdatedAt: number;
    };
    equipmentCount: number;
    equippedSlots: Array<{ slot: string; itemId: string }>;
    learnedSkillCount: number;
    equippedSkills: string[];
    proficiencyTop: Array<{ key: string; quantity: number }>;
  };
  fishingCatchCoins: {
    earned: number;
    cap: number;
  };
  dailyLimits: Array<{
    key: string;
    label: string;
    earned: number;
    cap: number;
    remaining: number;
    status: "ok" | "near" | "capped";
  }>;
  economySnapshot: {
    goldIn24h: number;
    goldOut24h: number;
    goldNet24h: number;
    itemIn24h: number;
    compensationCount24h: number;
    rewardFailureCount24h: number;
    topEvents24h: CountRow[];
    topItems24h: CountRow[];
  };
  timeline: Array<{
    id: string;
    type: "note" | "audit" | "sanction" | "economy";
    tone: "danger" | "warning" | "info";
    title: string;
    summary: string;
    actor: string | null;
    createdAt: string;
  }>;
  inventorySummary: {
    equipmentCount: number;
    materialTop: Array<{ key: string; quantity: number }>;
    rareMapCount: number;
    coopBoxes: Array<{ key: string; quantity: number }>;
    coopMasteryTomes: Array<{ key: string; quantity: number }>;
    spFruits: Array<{ key: string; quantity: number }>;
  };
  rewardHistory: OpsEventRow[];
  recentCompensations: OpsEventRow[];
  proficiencyHistory: OpsEventRow[];
  recentEconomy: OpsEventRow[];
};

type CountRow = { key: string; count: number };

const TIMELINE_FILTERS = [
  { value: "all", label: "전체" },
  { value: "note", label: "메모" },
  { value: "economy", label: "경제·보상" },
  { value: "audit", label: "감사" },
  { value: "sanction", label: "제재" },
] as const;

type TimelineFilter = (typeof TIMELINE_FILTERS)[number]["value"];

const COMP_KIND_OPTIONS = [
  "gold",
  "fishing_coin",
  "treasure_coin",
  "mastery_certificate",
  "stamina_potion",
  "material",
] as const;

const COMP_PRESETS: Array<{
  id: string;
  label: string;
  itemKind: (typeof COMP_KIND_OPTIONS)[number];
  itemId: string;
  quantity: number;
  reason: string;
}> = [
  {
    id: "fishing-coin-missing",
    label: "낚시 코인 미지급",
    itemKind: "fishing_coin",
    itemId: "",
    quantity: 100,
    reason: "낚시 코인 미지급 보정",
  },
  {
    id: "treasure-coin-missing",
    label: "발굴 코인 미지급",
    itemKind: "treasure_coin",
    itemId: "",
    quantity: 100,
    reason: "발굴 코인 미지급 보정",
  },
  {
    id: "mastery-certificate-missing",
    label: "숙련 증서 미지급",
    itemKind: "mastery_certificate",
    itemId: "",
    quantity: 1,
    reason: "숙련 증서 미지급 보정",
  },
  {
    id: "stamina-potion-missing",
    label: "스태미나 회복약",
    itemKind: "stamina_potion",
    itemId: "",
    quantity: 1,
    reason: "스태미나 회복약 미지급 보정",
  },
  {
    id: "material-adjust",
    label: "재료 보정",
    itemKind: "material",
    itemId: "",
    quantity: 1,
    reason: "재료 미지급 보정",
  },
];

export function OpsUserSummarySection({
  userId,
  readOnly,
}: {
  userId: string;
  readOnly: boolean;
}) {
  const { showToast, adminMe } = useAdmin();
  const searchParams = useSearchParams();
  const [itemKind, setItemKind] = useState<(typeof COMP_KIND_OPTIONS)[number]>("gold");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [reason, setReason] = useState("");
  const [sourceEventId, setSourceEventId] = useState(0);
  const [saving, setSaving] = useState(false);
  const [lastCompensation, setLastCompensation] = useState<{
    beforeBalance: number;
    balance: number;
  } | null>(null);
  const { data, loading, error, refetch } = useAsyncData<OpsSummary>(
    (signal) =>
      adminGet(
        `/api/admin/users/ops-summary?userId=${encodeURIComponent(userId)}`,
        signal,
      ),
    [userId],
  );
  const { data: settings } = useAsyncData<{
    rewardCompensationPresets: typeof COMP_PRESETS;
  }>((signal) => adminGet("/api/admin/ops-settings", signal));
  const presets = settings?.rewardCompensationPresets ?? COMP_PRESETS;
  const canReward = Boolean(adminMe?.capabilities.reward);
  const formDisabled = readOnly || saving || !canReward;

  useEffect(() => {
    if (error) console.warn("[admin] ops summary failed", error);
  }, [error]);

  useEffect(() => {
    const eventId = Math.max(
      0,
      Math.floor(Number(searchParams.get("sourceEventId") ?? 0) || 0),
    );
    if (eventId > 0) {
      // 대시보드 보상 실패 후보에서 들어온 경우 원본 event id를 자동 채운다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSourceEventId(eventId);
    }
    const draftKind = searchParams.get("draftItemKind");
    if (draftKind && COMP_KIND_OPTIONS.includes(draftKind as (typeof COMP_KIND_OPTIONS)[number])) {
      setItemKind(draftKind as (typeof COMP_KIND_OPTIONS)[number]);
    }
    const draftItemId = searchParams.get("draftItemId");
    if (draftItemId != null) setItemId(draftItemId);
    const draftQuantity = Math.max(
      0,
      Math.floor(Number(searchParams.get("draftQuantity") ?? 0) || 0),
    );
    if (draftQuantity > 0) setQuantity(draftQuantity);
    const draftReason = searchParams.get("draftReason");
    if (draftReason) setReason(draftReason.slice(0, 500));
  }, [searchParams]);

  const compensate = async () => {
    const confirmLarge = isLargeCompensation(itemKind, quantity)
      ? window.confirm(
          `대량 보정 지급입니다. ${economyItemKindLabel(itemKind)} ${quantity.toLocaleString()}개를 지급할까요?`,
        )
      : false;
    if (isLargeCompensation(itemKind, quantity) && !confirmLarge) return;
    setSaving(true);
    try {
      const submit = (confirmDuplicate: boolean, confirmDailyRisk: boolean) =>
        adminPost<{
          beforeBalance: number;
          balance: number;
        }>("/api/admin/reward-compensate", {
          userId,
          itemKind,
          itemId,
          quantity,
          reason,
          sourceEventId,
          confirmLarge,
          confirmDuplicate,
          confirmDailyRisk,
        });
      let result: { beforeBalance: number; balance: number };
      try {
        result = await submit(false, false);
      } catch (e) {
        const message = e instanceof Error ? e.message : "";
        if (!isDuplicateCompensationError(message) && message !== "daily_compensation_risk") {
          throw e;
        }
        const ok = window.confirm(
          message === "duplicate_source_event"
            ? "이미 보정 완료 처리된 원본 이벤트입니다. 그래도 한 번 더 지급할까요?"
            : message === "daily_compensation_risk"
              ? "최근 24시간 안에 같은 유저에게 보정 지급이 여러 번 있거나 수량이 큽니다. 그래도 지급할까요?"
              : "최근 24시간 안에 같은 유저에게 같은 품목/수량 보정이 있습니다. 그래도 지급할까요?",
        );
        if (!ok) return;
        const confirmedDuplicate = isDuplicateCompensationError(message);
        const confirmedDailyRisk = message === "daily_compensation_risk";
        try {
          result = await submit(confirmedDuplicate, confirmedDailyRisk);
        } catch (second) {
          const secondMessage = second instanceof Error ? second.message : "";
          if (secondMessage !== "daily_compensation_risk" || confirmedDailyRisk) throw second;
          const dailyOk = window.confirm(
            "중복 확인 후에도 최근 24시간 보정 총량 경고가 있습니다. 그래도 지급할까요?",
          );
          if (!dailyOk) return;
          result = await submit(confirmedDuplicate, true);
        }
      }
      setLastCompensation(result);
      showToast("보정 지급 완료");
      refetch();
    } catch (e) {
      showToast(`보정 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">운영 요약</h2>
        <Button onClick={() => void refetch()} disabled={loading}>
          {loading ? "조회 중..." : "새로고침"}
        </Button>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">조회 실패: {error}</p>
      ) : !data ? (
        <p className="mt-2 text-xs text-zinc-500">
          {loading ? "불러오는 중..." : "데이터 없음"}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <SnapshotPanel snapshot={data.snapshot} />
          <DailyLimitPanel rows={data.dailyLimits} />
          <EconomySnapshotPanel snapshot={data.economySnapshot} />
          <div className="grid gap-2 sm:grid-cols-3">
            <Metric label="보유 골드" value={data.summary.gold} />
            <Metric label="은행 골드" value={data.summary.bankedGold} />
            <Metric label="낚시 코인" value={data.summary.fishingCoins} />
            <Metric label="발굴 코인" value={data.summary.treasureCoins} />
            <Metric label="숙련 증서" value={data.summary.masteryCertificates} />
            <Metric label="스태미나 회복약" value={data.summary.staminaPotions} />
            <Metric
              label="오늘 낚시 코인"
              value={data.fishingCatchCoins.earned}
              suffix={` / ${data.fishingCatchCoins.cap.toLocaleString()}`}
            />
          </div>
          <InventorySummary summary={data.inventorySummary} />
          <section className="rounded-md border border-zinc-100 p-2 dark:border-zinc-800">
            <h3 className="mb-2 text-xs font-semibold">보상 보정 지급</h3>
            <div className="mb-2 flex flex-wrap gap-1">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={formDisabled}
                  onClick={() => {
                    setItemKind(preset.itemKind);
                    setItemId(preset.itemId);
                    setQuantity(preset.quantity);
                    setReason(preset.reason);
                  }}
                  className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr]">
              <label className="space-y-1 text-xs">
                <span className="text-zinc-500">종류</span>
                <select
                  value={itemKind}
                  onChange={(e) =>
                    setItemKind(e.target.value as (typeof COMP_KIND_OPTIONS)[number])
                  }
                  disabled={formDisabled}
                  className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
                >
                  {COMP_KIND_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {economyItemKindLabel(value)}
                    </option>
                  ))}
                </select>
              </label>
              <SmallInput
                label="itemId"
                value={itemId}
                onChange={setItemId}
                disabled={formDisabled}
                placeholder="material만 필수"
              />
              <SmallInput
                label="수량"
                value={String(quantity)}
                onChange={(value) => setQuantity(Math.max(0, Math.floor(Number(value) || 0)))}
                disabled={formDisabled}
                type="number"
              />
              <SmallInput
                label="사유"
                value={reason}
                onChange={setReason}
                disabled={formDisabled}
                placeholder="문의/보상 실패 보정"
              />
              <SmallInput
                label="원본 event id"
                value={sourceEventId ? String(sourceEventId) : ""}
                onChange={(value) => setSourceEventId(Math.max(0, Math.floor(Number(value) || 0)))}
                disabled={formDisabled}
                type="number"
              />
              <div className="flex items-end">
                <Button
                  disabled={formDisabled || quantity <= 0}
                  onClick={() => void compensate()}
                >
                  {saving ? "지급 중..." : "보정 지급"}
                </Button>
              </div>
            </div>
            {lastCompensation ? (
              <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400">
                잔액 {lastCompensation.beforeBalance.toLocaleString()} →{" "}
                {lastCompensation.balance.toLocaleString()}
              </p>
            ) : null}
            {!canReward ? (
              <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
                현재 계정에는 보상 지급 권한이 없습니다.
              </p>
            ) : null}
            {data.recentCompensations.length > 0 ? (
              <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                최근 보정 {data.recentCompensations.length}건이 있습니다. 같은 문의 중복 지급 여부를 확인하세요.
              </div>
            ) : null}
          </section>
          <EventList title="최근 보상 수령" rows={data.rewardHistory} />
          <EventList title="최근 보정 지급" rows={data.recentCompensations} />
          <EventList title="숙련/증서 이벤트" rows={data.proficiencyHistory} />
          <TimelinePanel rows={data.timeline} />
        </div>
      )}
    </section>
  );
}

function SnapshotPanel({ snapshot }: { snapshot: OpsSummary["snapshot"] }) {
  return (
    <section className="rounded-md border border-zinc-100 p-2 dark:border-zinc-800">
      <h3 className="mb-2 text-xs font-semibold">문의 대응 스냅샷</h3>
      <div className="grid gap-2 sm:grid-cols-3">
        <Metric label="레벨" value={snapshot.level} />
        <Metric label="EXP" value={snapshot.exp} />
        <Metric label="HP" value={snapshot.hp} />
        <Metric
          label="스태미나"
          value={snapshot.stamina.current}
          suffix={` / ${snapshot.stamina.max.toLocaleString()}`}
        />
        <Metric label="장비 수" value={snapshot.equipmentCount} />
        <Metric label="학습 스킬" value={snapshot.learnedSkillCount} />
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <MiniPairs
          title="기본"
          rows={[
            ["이름", snapshot.name ?? "-"],
            ["직업", jobLabel(snapshot.classId, snapshot.specChoice)],
            ["길드", snapshot.guild],
          ]}
        />
        <MiniRows
          title="장착 장비"
          rows={snapshot.equippedSlots.map((row) => ({
            key: `${slotLabel(row.slot)} · ${economyKnownItemName(row.itemId)}`,
            quantity: 1,
          }))}
          labelKey={(key) => key}
        />
        <MiniRows
          title="장착 스킬"
          rows={snapshot.equippedSkills.map((key) => ({ key, quantity: 1 }))}
          labelKey={skillLabel}
        />
        <MiniRows
          title="숙련 상위"
          rows={snapshot.proficiencyTop}
          labelKey={(key) => jobLabel(key, null)}
        />
      </div>
    </section>
  );
}

function DailyLimitPanel({ rows }: { rows: OpsSummary["dailyLimits"] }) {
  return (
    <section className="rounded-md border border-zinc-100 p-2 dark:border-zinc-800">
      <h3 className="mb-2 text-xs font-semibold">일일 제한·문의 체크</h3>
      <div className="grid gap-2 md:grid-cols-3">
        {rows.map((row) => (
          <div
            key={row.key}
            className={`rounded-md border px-2 py-1.5 text-xs ${limitStatusClass(row.status)}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{row.label}</span>
              <span className="text-[11px]">{limitStatusLabel(row.status)}</span>
            </div>
            <div className="mt-1 tabular-nums">
              {row.earned.toLocaleString()} / {row.cap.toLocaleString()}
            </div>
            {row.key !== "reward_failures" ? (
              <div className="mt-0.5 text-[11px] opacity-75">
                남음 {row.remaining.toLocaleString()}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function InventorySummary({ summary }: { summary: OpsSummary["inventorySummary"] }) {
  return (
    <section className="rounded-md border border-zinc-100 p-2 dark:border-zinc-800">
      <h3 className="mb-2 text-xs font-semibold">인벤토리 핵심 요약</h3>
      <div className="grid gap-2 sm:grid-cols-3">
        <Metric label="장비 수" value={summary.equipmentCount} />
        <Metric label="레어맵" value={summary.rareMapCount} />
        <Metric
          label="협동 상자"
          value={summary.coopBoxes.reduce((sum, row) => sum + row.quantity, 0)}
        />
      </div>
      <MiniRows title="재료 상위" rows={summary.materialTop} />
      <MiniRows title="협동 숙련서" rows={summary.coopMasteryTomes} />
      <MiniRows title="SP 열매" rows={summary.spFruits} />
    </section>
  );
}

function EconomySnapshotPanel({
  snapshot,
}: {
  snapshot: OpsSummary["economySnapshot"];
}) {
  return (
    <section className="rounded-md border border-zinc-100 p-2 dark:border-zinc-800">
      <h3 className="mb-2 text-xs font-semibold">경제 스냅샷 24시간</h3>
      <div className="grid gap-2 sm:grid-cols-3">
        <Metric label="골드 유입" value={snapshot.goldIn24h} />
        <Metric label="골드 유출" value={snapshot.goldOut24h} />
        <Metric label="순변동" value={snapshot.goldNet24h} />
        <Metric label="아이템 유입 수량" value={snapshot.itemIn24h} />
        <Metric label="보정 지급" value={snapshot.compensationCount24h} />
        <Metric label="보상 실패" value={snapshot.rewardFailureCount24h} />
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <CountRows title="이벤트 상위" rows={snapshot.topEvents24h} labelKey={economyEventLabel} />
        <CountRows title="품목 상위" rows={snapshot.topItems24h} labelKey={economyItemKindLabel} />
      </div>
    </section>
  );
}

function TimelinePanel({ rows }: { rows: OpsSummary["timeline"] }) {
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const visibleRows = rows.filter((row) => filter === "all" || row.type === filter);
  return (
    <section>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold">문의 대응 타임라인</h3>
        <div className="flex flex-wrap gap-1">
          {TIMELINE_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={
                filter === option.value
                  ? "rounded border border-zinc-900 bg-zinc-900 px-2 py-0.5 text-[11px] text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "rounded border border-zinc-300 px-2 py-0.5 text-[11px] hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {visibleRows.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">기록 없음</p>
      ) : (
        <ol className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-zinc-100 p-2 dark:border-zinc-800">
          {visibleRows.slice(0, 24).map((row) => (
            <li
              key={row.id}
              className={`rounded-md border px-2 py-1.5 text-xs ${timelineClass(row.tone)}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{row.title}</span>
                <span className="text-[11px] opacity-75">
                  {new Date(row.createdAt).toLocaleString("ko-KR")}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words">{row.summary || "-"}</p>
              <div className="mt-1 font-mono text-[11px] opacity-70">
                {adminLogLabel(row.type)}
                {row.actor ? ` · ${row.actor}` : ""}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function CountRows({
  title,
  rows,
  labelKey = (key) => key,
}: {
  title: string;
  rows: CountRow[];
  labelKey?: (key: string) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="text-[11px]">
      <div className="mb-1 font-medium text-zinc-500">{title}</div>
      <div className="flex flex-wrap gap-1">
        {rows.map((row) => (
          <span
            key={row.key}
            className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800"
          >
            {labelKey(row.key)} {row.count.toLocaleString()}
          </span>
        ))}
      </div>
    </div>
  );
}

function timelineClass(tone: OpsSummary["timeline"][number]["tone"]) {
  if (tone === "danger") {
    return "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200";
  }
  if (tone === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200";
  }
  return "border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200";
}

function MiniPairs({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, string]>;
}) {
  return (
    <div className="text-[11px]">
      <div className="mb-1 font-medium text-zinc-500">{title}</div>
      <dl className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-zinc-400">{label}</dt>
            <dd className="min-w-0 truncate font-mono">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function MiniRows({
  title,
  rows,
  labelKey = economyCountKeyLabel,
}: {
  title: string;
  rows: Array<{ key: string; quantity: number }>;
  labelKey?: (key: string) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-2 text-[11px]">
      <div className="mb-1 font-medium text-zinc-500">{title}</div>
      <div className="flex flex-wrap gap-1">
        {rows.map((row) => (
          <span key={row.key} className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">
            {labelKey(row.key)} x{row.quantity.toLocaleString()}
          </span>
        ))}
      </div>
    </div>
  );
}

function slotLabel(slot: string): string {
  return V2_SLOT_LABEL[slot as V2EquipSlot] ?? slot;
}

function limitStatusClass(status: OpsSummary["dailyLimits"][number]["status"]) {
  if (status === "capped") {
    return "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200";
  }
  if (status === "near") {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200";
}

function limitStatusLabel(status: OpsSummary["dailyLimits"][number]["status"]) {
  if (status === "capped") return "상한/주의";
  if (status === "near") return "확인 필요";
  return "정상";
}

function Metric({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="rounded-md border border-zinc-100 px-2 py-1.5 dark:border-zinc-800">
      <div className="text-[10px] text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">
        {value.toLocaleString()}
        {suffix}
      </div>
    </div>
  );
}

function largeThreshold(itemKind: (typeof COMP_KIND_OPTIONS)[number]) {
  return itemKind === "gold" ? 100_000 : itemKind === "material" ? 5_000 : 1_000;
}

function isLargeCompensation(
  itemKind: (typeof COMP_KIND_OPTIONS)[number],
  quantity: number,
) {
  return quantity >= largeThreshold(itemKind);
}

function isDuplicateCompensationError(message: string) {
  return message === "duplicate_source_event" || message === "similar_compensation_exists";
}

function SmallInput({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  placeholder?: string;
  type?: "text" | "number";
}) {
  return (
    <label className="space-y-1 text-xs">
      <span className="text-zinc-500">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
      />
    </label>
  );
}

function EventList({ title, rows }: { title: string; rows: OpsEventRow[] }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">기록 없음</p>
      ) : (
        <div className="max-h-44 overflow-y-auto rounded-md border border-zinc-100 dark:border-zinc-800">
          <table className="w-full text-left text-[11px]">
            <tbody>
              {rows.slice(0, 12).map((row) => (
                <tr key={row.id} className="border-t border-zinc-100 first:border-t-0 dark:border-zinc-800">
                  <td className="whitespace-nowrap px-2 py-1 text-zinc-500">
                    {new Date(row.createdAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-2 py-1">{economyEventLabel(row.eventType)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {row.goldDelta !== 0
                      ? `${row.goldDelta > 0 ? "+" : ""}${row.goldDelta.toLocaleString()}G`
                      : row.quantity != null
                        ? `${row.quantity.toLocaleString()}`
                        : "-"}
                  </td>
                  <td className="max-w-[160px] truncate px-2 py-1 text-zinc-400">
                    {economyItemLabel(row.itemKind, row.itemId)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
