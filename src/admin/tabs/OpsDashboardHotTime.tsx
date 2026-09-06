"use client";

import { useAdmin } from "@/admin/AdminContext";
import { adminGet, adminPost } from "@/admin/api";
import { type HotTimeSchedule, type HotTimeSettings } from "./opsDashboardTypes";
import { NumberField, Panel, TextField, toLocalInput } from "./OpsDashboardUi";
import { Button } from "@/admin/ui/Field";
import { useAsyncData } from "@/lib/useAsyncData";
import { useEffect, useState } from "react";

export function HotTimePanel() {
  const { showToast } = useAdmin();
  const { data, loading, error, refetch } = useAsyncData<{
    hotTime: HotTimeSettings;
    hotTimeSchedules: HotTimeSchedule[];
    updatedByEmail: string | null;
    updatedAt: string | null;
  }>((signal) => adminGet("/api/admin/ops-settings", signal));
  const [draft, setDraft] = useState<HotTimeSettings | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<HotTimeSchedule[]>([]);
  const [saving, setSaving] = useState(false);
  const value = draft ?? data?.hotTime ?? null;
  const conflicts = value ? hotTimeConflicts(value, scheduleDraft) : [];
  const preview = value ? hotTimePreview(value, scheduleDraft) : [];

  useEffect(() => {
    // 서버 설정을 편집 draft 로 복사한다. 이후 입력 중에는 draft 가 로컬 소스다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data?.hotTime) setDraft(data.hotTime);
    if (data?.hotTimeSchedules) setScheduleDraft(data.hotTimeSchedules);
  }, [data]);

  useEffect(() => {
    if (error) showToast(`핫타임 조회 실패: ${error}`);
  }, [error, showToast]);

  const save = async () => {
    if (!value) return;
    setSaving(true);
    try {
      const saved = await adminPost<{ hotTime: HotTimeSettings }>(
        "/api/admin/ops-settings",
        { hotTime: value },
      );
      setDraft(saved.hotTime);
      showToast("핫타임 설정 저장됨");
      void refetch();
    } catch (e) {
      showToast(`저장 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setSaving(false);
    }
  };

  const saveSchedules = async () => {
    setSaving(true);
    try {
      const saved = await adminPost<{ hotTimeSchedules: HotTimeSchedule[] }>(
        "/api/admin/ops-settings",
        { hotTimeSchedules: scheduleDraft },
      );
      setScheduleDraft(saved.hotTimeSchedules);
      showToast("핫타임 반복 예약 저장됨");
      void refetch();
    } catch (e) {
      showToast(`저장 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setSaving(false);
    }
  };

  const addSchedule = () => {
    setScheduleDraft((prev) => [
      ...prev,
      {
        id: `schedule-${Date.now().toString(36)}`,
        enabled: true,
        title: "반복 핫타임",
        days: [6, 0],
        startsAt: "20:00",
        endsAt: "22:00",
        bonuses: {
          goldPct: 20,
          expPct: 20,
          masteryPct: 20,
          fishingCoinPct: 20,
        },
        note: "",
      },
    ]);
  };

  return (
    <Panel title="이벤트·핫타임 설정">
      {!value ? (
        <p className="text-xs text-zinc-500">
          {loading ? "불러오는 중..." : "설정 없음"}
        </p>
      ) : (
        <div className="space-y-2 text-xs">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.enabled}
              onChange={(e) =>
                setDraft({ ...value, enabled: e.target.checked })
              }
            />
            <span>활성화</span>
          </label>
          <div className="grid gap-2 md:grid-cols-3">
            <TextField
              label="제목"
              value={value.title}
              onChange={(title) => setDraft({ ...value, title })}
            />
            <TextField
              label="시작"
              type="datetime-local"
              value={toLocalInput(value.startsAt)}
              onChange={(startsAt) => setDraft({ ...value, startsAt })}
            />
            <TextField
              label="종료"
              type="datetime-local"
              value={toLocalInput(value.endsAt)}
              onChange={(endsAt) => setDraft({ ...value, endsAt })}
            />
            <NumberField
              label="골드 %"
              value={value.bonuses.goldPct}
              onChange={(goldPct) =>
                setDraft({ ...value, bonuses: { ...value.bonuses, goldPct } })
              }
            />
            <NumberField
              label="경험치 %"
              value={value.bonuses.expPct}
              onChange={(expPct) =>
                setDraft({ ...value, bonuses: { ...value.bonuses, expPct } })
              }
            />
            <NumberField
              label="숙련 %"
              value={value.bonuses.masteryPct}
              onChange={(masteryPct) =>
                setDraft({ ...value, bonuses: { ...value.bonuses, masteryPct } })
              }
            />
            <NumberField
              label="낚시 코인 %"
              value={value.bonuses.fishingCoinPct}
              onChange={(fishingCoinPct) =>
                setDraft({
                  ...value,
                  bonuses: { ...value.bonuses, fishingCoinPct },
                })
              }
            />
          </div>
          <TextField
            label="메모"
            value={value.note}
            onChange={(note) => setDraft({ ...value, note })}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-zinc-500">
              마지막 수정 {data?.updatedByEmail ?? "-"} ·{" "}
              {data?.updatedAt ? new Date(data.updatedAt).toLocaleString("ko-KR") : "-"}
            </span>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "저장 중..." : "설정 저장"}
            </Button>
          </div>
          <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h5 className="text-xs font-semibold">반복 예약</h5>
              <Button onClick={addSchedule}>예약 추가</Button>
            </div>
            <HotTimePreview rows={preview} />
            {scheduleDraft.length === 0 ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">예약 없음</p>
            ) : (
              <div className="space-y-2">
                {conflicts.length > 0 ? (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                    {conflicts.map((message) => (
                      <div key={message}>{message}</div>
                    ))}
                  </div>
                ) : null}
                {scheduleDraft.map((schedule, index) => (
                  <ScheduleEditor
                    key={schedule.id}
                    value={schedule}
                    onChange={(next) =>
                      setScheduleDraft((prev) =>
                        prev.map((row) => (row.id === schedule.id ? next : row)),
                      )
                    }
                    onRemove={() =>
                      setScheduleDraft((prev) => prev.filter((row) => row.id !== schedule.id))
                    }
                    index={index}
                  />
                ))}
                <div className="flex justify-end">
                  <Button onClick={() => void saveSchedules()} disabled={saving}>
                    {saving ? "저장 중..." : "반복 예약 저장"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}


export function hotTimeConflicts(
  hotTime: HotTimeSettings,
  schedules: HotTimeSchedule[],
): string[] {
  const active = schedules.filter((row) => row.enabled);
  const messages: string[] = [];
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const overlapDays = active[i].days.filter((day) => active[j].days.includes(day));
      if (overlapDays.length > 0 && timeOverlaps(active[i], active[j])) {
        messages.push(
          `반복 예약 겹침: ${active[i].title || active[i].id} / ${active[j].title || active[j].id} (${overlapDays.map((day) => DAY_LABELS[day]).join(", ")})`,
        );
      }
    }
  }
  if (isManualHotTimeValid(hotTime)) {
    const start = new Date(hotTime.startsAt);
    const end = new Date(hotTime.endsAt);
    for (const schedule of active) {
      if (manualOverlapsSchedule(start, end, schedule)) {
        messages.push(`단발 핫타임과 반복 예약 겹침: ${schedule.title || schedule.id}`);
      }
    }
  }
  return messages.slice(0, 5);
}


export function hotTimePreview(
  hotTime: HotTimeSettings,
  schedules: HotTimeSchedule[],
) {
  const now = Date.now();
  const until = now + 7 * 24 * 60 * 60 * 1000;
  const rows: Array<{
    source: "manual" | "schedule";
    title: string;
    startsAt: string;
    endsAt: string;
    bonuses: HotTimeSettings["bonuses"];
    conflict?: boolean;
  }> = [];
  if (isManualHotTimeValid(hotTime)) {
    const start = Date.parse(hotTime.startsAt);
    const end = Date.parse(hotTime.endsAt);
    if (end > now && start < until) {
      rows.push({
        source: "manual",
        title: hotTime.title,
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(end).toISOString(),
        bonuses: hotTime.bonuses,
      });
    }
  }
  const startDayKst = new Date(now + 9 * 60 * 60 * 1000);
  startDayKst.setUTCHours(0, 0, 0, 0);
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(startDayKst);
    day.setUTCDate(day.getUTCDate() + offset);
    const dayOfWeek = day.getUTCDay();
    const datePart = day.toISOString().slice(0, 10);
    for (const schedule of schedules) {
      if (!schedule.enabled || !schedule.days.includes(dayOfWeek)) continue;
      const start = Date.parse(`${datePart}T${schedule.startsAt}:00+09:00`);
      const end = Date.parse(`${datePart}T${schedule.endsAt}:00+09:00`);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) continue;
      if (end <= now || start >= until) continue;
      rows.push({
        source: "schedule",
        title: schedule.title,
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(end).toISOString(),
        bonuses: schedule.bonuses,
      });
    }
  }
  const sorted = rows.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return sorted
    .map((row, index) => ({
      ...row,
      conflict: sorted.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          Date.parse(row.startsAt) < Date.parse(other.endsAt) &&
          Date.parse(other.startsAt) < Date.parse(row.endsAt),
      ),
    }))
    .slice(0, 20);
}


export function HotTimePreview({
  rows,
}: {
  rows: ReturnType<typeof hotTimePreview>;
}) {
  return (
    <div className="mb-2 rounded-md border border-zinc-100 p-2 dark:border-zinc-800">
      <div className="mb-1 text-[11px] font-medium text-zinc-500">7일 미리보기</div>
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">예정 없음</p>
      ) : (
        <ul className="grid gap-1 text-[11px] md:grid-cols-2">
          {rows.map((row) => (
            <li
              key={`${row.source}:${row.startsAt}:${row.title}`}
              className="rounded border border-zinc-100 px-2 py-1 dark:border-zinc-800"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{row.title || "핫타임"}</span>
                {row.conflict ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    충돌
                  </span>
                ) : null}
              </div>
              <div className="text-zinc-500">
                {new Date(row.startsAt).toLocaleString("ko-KR")} -{" "}
                {new Date(row.endsAt).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              <div className="text-zinc-500">
                {row.source === "manual" ? "단발" : "반복"} · 골드 {row.bonuses.goldPct}% ·
                경험치 {row.bonuses.expPct}% · 숙련 {row.bonuses.masteryPct}%
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


export function isManualHotTimeValid(hotTime: HotTimeSettings) {
  const start = Date.parse(hotTime.startsAt);
  const end = Date.parse(hotTime.endsAt);
  return hotTime.enabled && Number.isFinite(start) && Number.isFinite(end) && start < end;
}


export function timeOverlaps(a: HotTimeSchedule, b: HotTimeSchedule) {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}


export function manualOverlapsSchedule(start: Date, end: Date, schedule: HotTimeSchedule) {
  const cursor = new Date(start);
  cursor.setUTCHours(0, 0, 0, 0);
  while (cursor.getTime() < end.getTime()) {
    const kst = new Date(cursor.getTime() + 9 * 60 * 60 * 1000);
    const day = kst.getUTCDay();
    if (schedule.days.includes(day)) {
      const datePart = kst.toISOString().slice(0, 10);
      const scheduledStart = Date.parse(`${datePart}T${schedule.startsAt}:00+09:00`);
      const scheduledEnd = Date.parse(`${datePart}T${schedule.endsAt}:00+09:00`);
      if (start.getTime() < scheduledEnd && scheduledStart < end.getTime()) return true;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return false;
}


export const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];


export function ScheduleEditor({
  value,
  onChange,
  onRemove,
  index,
}: {
  value: HotTimeSchedule;
  onChange: (value: HotTimeSchedule) => void;
  onRemove: () => void;
  index: number;
}) {
  const setBonus = (
    key: keyof HotTimeSettings["bonuses"],
    next: number,
  ) => {
    onChange({ ...value, bonuses: { ...value.bonuses, [key]: next } });
  };
  const toggleDay = (day: number) => {
    const days = value.days.includes(day)
      ? value.days.filter((value) => value !== day)
      : [...value.days, day].sort((a, b) => a - b);
    onChange({ ...value, days });
  };

  return (
    <div className="rounded-md border border-zinc-100 p-2 dark:border-zinc-800">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
          />
          <span>예약 {index + 1} 활성화</span>
        </label>
        <Button onClick={onRemove}>삭제</Button>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <TextField
          label="제목"
          value={value.title}
          onChange={(title) => onChange({ ...value, title })}
        />
        <TextField
          label="시작 시각(KST)"
          type="time"
          value={value.startsAt}
          onChange={(startsAt) => onChange({ ...value, startsAt })}
        />
        <TextField
          label="종료 시각(KST)"
          type="time"
          value={value.endsAt}
          onChange={(endsAt) => onChange({ ...value, endsAt })}
        />
        <NumberField
          label="골드 %"
          value={value.bonuses.goldPct}
          onChange={(next) => setBonus("goldPct", next)}
        />
        <NumberField
          label="경험치 %"
          value={value.bonuses.expPct}
          onChange={(next) => setBonus("expPct", next)}
        />
        <NumberField
          label="숙련 %"
          value={value.bonuses.masteryPct}
          onChange={(next) => setBonus("masteryPct", next)}
        />
        <NumberField
          label="낚시 코인 %"
          value={value.bonuses.fishingCoinPct}
          onChange={(next) => setBonus("fishingCoinPct", next)}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {DAY_LABELS.map((label, day) => (
          <button
            key={label}
            type="button"
            onClick={() => toggleDay(day)}
            className={
              value.days.includes(day)
                ? "rounded border border-zinc-900 bg-zinc-900 px-2 py-1 text-[11px] text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
            }
          >
            {label}
          </button>
        ))}
      </div>
      <TextField
        label="메모"
        value={value.note}
        onChange={(note) => onChange({ ...value, note })}
      />
    </div>
  );
}
