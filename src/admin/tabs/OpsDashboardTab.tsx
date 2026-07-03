"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAdmin } from "../AdminContext";
import { adminGet, adminPost } from "../api";
import { Button } from "../ui/Field";
import { useAsyncData } from "@/lib/useAsyncData";

type CountRow = { key: string; count: number };

type Dashboard = {
  generatedAt: string;
  periodHours: number;
  webhookConfigured: boolean;
  alertThresholds: AlertThresholdSettings;
  alertHistory: AlertHistoryEntry[];
  alerts: Array<{
    level: "danger" | "warning" | "info";
    title: string;
    message: string;
  }>;
  abuse: {
    last5m: number;
    last1h: number;
    last24h: number;
    rateLimited24h: number;
    topActions: CountRow[];
    topIps: CountRow[];
    topUsers: CountRow[];
  };
  economy: {
    last1h: number;
    last24h: number;
    goldIn24h: number;
    goldOut24h: number;
    rewardFailures24h: number;
    largeGoldEvents24h: number;
    topEvents: CountRow[];
    topItems: CountRow[];
    topRewardFailures: CountRow[];
  };
  audit: {
    last24h: number;
    latest: Array<{
      id: number;
      adminEmail: string;
      action: string;
      targetUserId: string | null;
      createdAt: string;
    }>;
  };
  slowQueryCandidates: Array<{
    key: string;
    status: string;
    cacheTtlSec: number;
    note: string;
  }>;
  suspiciousUsers: Array<{
    userId: string;
    score: number;
    events: number;
    rateLimited: number;
    actionCount: number;
    ipCount: number;
    ips: string[];
    lastAt: string;
  }>;
  connectedIps: Array<{
    ip: string;
    events: number;
    rateLimited: number;
    userCount: number;
    actionCount: number;
    userIds: string[];
    lastAt: string;
  }>;
  rewardFailureCandidates: Array<{
    id: number;
    userId: string | null;
    eventType: string;
    itemId: string | null;
    detail: Record<string, unknown> | null;
    createdAt: string;
  }>;
};

type HotTimeSettings = {
  enabled: boolean;
  title: string;
  startsAt: string;
  endsAt: string;
  bonuses: {
    goldPct: number;
    expPct: number;
    masteryPct: number;
    fishingCoinPct: number;
  };
  note: string;
};

type HotTimeSchedule = {
  id: string;
  enabled: boolean;
  title: string;
  days: number[];
  startsAt: string;
  endsAt: string;
  bonuses: HotTimeSettings["bonuses"];
  note: string;
};

type AlertThresholdSettings = {
  abuseLast5m: number;
  abuseLast1h: number;
  rewardFailures: number;
  largeGoldEvents: number;
  adminAudit: number;
};

type AlertHistoryEntry = {
  id: string;
  message: string;
  detail: Record<string, unknown> | null;
  status: "sent" | "failed" | "skipped";
  error: string | null;
  createdAt: string;
};

export function OpsDashboardTab() {
  const { showToast } = useAdmin();
  const [hours, setHours] = useState(24);
  const { data, loading, error, refetch } = useAsyncData<{ ok: true } & Dashboard>(
    (signal) => adminGet(`/api/admin/ops-dashboard?hours=${hours}`, signal),
    [hours],
  );
  const [testingWebhook, setTestingWebhook] = useState(false);

  useEffect(() => {
    if (error) showToast(`조회 실패: ${error}`);
  }, [error, showToast]);

  const testWebhook = async () => {
    setTestingWebhook(true);
    try {
      await adminPost("/api/admin/ops-alert-test", {});
      showToast("알림 테스트 전송됨");
    } catch (e) {
      showToast(`알림 테스트 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setTestingWebhook(false);
    }
  };
  const periodLabel = hours === 168 ? "7일" : `${hours}시간`;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">운영 현황판</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            선택 기간({periodLabel}) 기준 이상 행동, 경제 이벤트, 관리자 변경 흐름을 봅니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value={1}>1시간</option>
            <option value={6}>6시간</option>
            <option value={24}>24시간</option>
            <option value={168}>7일</option>
          </select>
          <Button onClick={() => void testWebhook()} disabled={testingWebhook}>
            {testingWebhook ? "전송 중..." : "알림 테스트"}
          </Button>
          <Button onClick={() => void refetch()} disabled={loading}>
            {loading ? "조회 중..." : "새로고침"}
          </Button>
        </div>
      </div>

      {!data ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {loading ? "불러오는 중..." : "데이터 없음"}
        </p>
      ) : (
        <>
          <div className="grid gap-2">
            {!data.webhookConfigured ? (
              <AlertCard
                level="warning"
                title="알림 웹훅 미설정"
                message="OPS_ALERT_WEBHOOK_URL 이 없어서 임계치 초과 알림은 관리자 화면에서만 확인됩니다."
              />
            ) : null}
            {data.alerts.length === 0 ? (
              <AlertCard
                level="info"
                title="주의 알림 없음"
                message="최근 운영 지표가 설정된 임계치 안에 있습니다."
              />
            ) : (
              data.alerts.map((alert) => (
                <AlertCard
                  key={`${alert.level}:${alert.title}`}
                  level={alert.level}
                  title={alert.title}
                  message={alert.message}
                />
              ))
            )}
          </div>

          <div className="grid gap-2 md:grid-cols-4">
            <Metric label="제한 초과 5분" value={data.abuse.last5m} />
            <Metric label="제한 초과 1시간" value={data.abuse.last1h} />
            <Metric label="경제 이벤트 1시간" value={data.economy.last1h} />
            <Metric label={`관리자 변경 ${periodLabel}`} value={data.audit.last24h} />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="이상 행동 Top">
              <CountList rows={data.abuse.topActions} empty="action 없음" />
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <MiniList title="IP" rows={data.abuse.topIps} />
                <MiniList title="유저" rows={data.abuse.topUsers} />
              </div>
            </Panel>
            <Panel title="경제 이벤트">
              <div className="mb-2 grid grid-cols-2 gap-2 text-xs">
                <Metric label={`골드 유입 ${periodLabel}`} value={data.economy.goldIn24h} />
                <Metric label={`골드 유출 ${periodLabel}`} value={data.economy.goldOut24h} />
                <Metric
                  label={`보상 실패 ${periodLabel}`}
                  value={data.economy.rewardFailures24h}
                />
                <Metric
                  label="대량 골드 이동"
                  value={data.economy.largeGoldEvents24h}
                />
              </div>
              <CountList rows={data.economy.topEvents} empty="event 없음" />
              {data.economy.topRewardFailures.length > 0 ? (
                <div className="mt-2">
                  <MiniList title="보상 실패" rows={data.economy.topRewardFailures} />
                </div>
              ) : null}
            </Panel>
          </div>

          <Panel title="느린 쿼리 후보">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="py-1 pr-3 font-medium">key</th>
                    <th className="py-1 pr-3 font-medium">상태</th>
                    <th className="py-1 pr-3 font-medium">TTL</th>
                    <th className="py-1 pr-3 font-medium">메모</th>
                  </tr>
                </thead>
                <tbody>
                  {data.slowQueryCandidates.map((row) => (
                    <tr key={row.key} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="py-1 pr-3 font-mono">{row.key}</td>
                      <td className="py-1 pr-3">{row.status}</td>
                      <td className="py-1 pr-3 tabular-nums">{row.cacheTtlSec}s</td>
                      <td className="py-1 pr-3 text-zinc-500">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="매크로 의심 점수">
            {data.suspiciousUsers.length === 0 ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">의심 점수 없음</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-zinc-500 dark:text-zinc-400">
                    <tr>
                      <th className="py-1 pr-3 font-medium">userId</th>
                      <th className="py-1 pr-3 font-medium">점수</th>
                      <th className="py-1 pr-3 font-medium">제한</th>
                      <th className="py-1 pr-3 font-medium">이벤트</th>
                      <th className="py-1 pr-3 font-medium">action/IP</th>
                      <th className="py-1 pr-3 font-medium">최근</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.suspiciousUsers.map((row) => (
                      <tr key={row.userId} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="py-1 pr-3 font-mono">
                          <Link
                            href={`/admin?tab=abuse&userId=${encodeURIComponent(row.userId)}`}
                            className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:decoration-zinc-700 dark:hover:text-white"
                          >
                            {row.userId.slice(0, 12)}
                          </Link>
                        </td>
                        <td className="py-1 pr-3 tabular-nums">{row.score}</td>
                        <td className="py-1 pr-3 tabular-nums">{row.rateLimited}</td>
                        <td className="py-1 pr-3 tabular-nums">{row.events}</td>
                        <td className="py-1 pr-3 tabular-nums">
                          {row.actionCount}/
                          {row.ips.length > 0 ? (
                            <Link
                              href={`/admin?tab=abuse&ip=${encodeURIComponent(row.ips[0])}`}
                              className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:decoration-zinc-700 dark:hover:text-white"
                            >
                              {row.ipCount}
                            </Link>
                          ) : (
                            row.ipCount
                          )}
                        </td>
                        <td className="py-1 pr-3 text-zinc-500">
                          {new Date(row.lastAt).toLocaleString("ko-KR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="IP 연결 계정">
            {data.connectedIps.length === 0 ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">연결 후보 없음</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-zinc-500 dark:text-zinc-400">
                    <tr>
                      <th className="py-1 pr-3 font-medium">IP</th>
                      <th className="py-1 pr-3 font-medium">계정</th>
                      <th className="py-1 pr-3 font-medium">제한/이벤트</th>
                      <th className="py-1 pr-3 font-medium">userIds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.connectedIps.map((row) => (
                      <tr key={row.ip} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="py-1 pr-3 font-mono">
                          <Link
                            href={`/admin?tab=abuse&ip=${encodeURIComponent(row.ip)}`}
                            className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:decoration-zinc-700 dark:hover:text-white"
                          >
                            {row.ip}
                          </Link>
                        </td>
                        <td className="py-1 pr-3 tabular-nums">{row.userCount}</td>
                        <td className="py-1 pr-3 tabular-nums">
                          {row.rateLimited}/{row.events}
                        </td>
                        <td className="py-1 pr-3 font-mono text-[11px] text-zinc-500">
                          {row.userIds.map((id) => id.slice(0, 8)).join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <RewardFailurePanel rows={data.rewardFailureCandidates} onDone={refetch} />

          <AlertThresholdPanel value={data.alertThresholds} onSaved={refetch} />
          <AlertHistoryPanel rows={data.alertHistory} />
          <HotTimePanel />
        </>
      )}
    </section>
  );
}

function RewardFailurePanel({
  rows,
  onDone,
}: {
  rows: Dashboard["rewardFailureCandidates"];
  onDone: () => void;
}) {
  const { showToast } = useAdmin();
  const [selected, setSelected] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedSet = new Set(selected);

  const toggle = (id: number) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  };

  const markReviewed = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    try {
      await adminPost("/api/admin/reward-failures/resolve", {
        eventIds: selected,
        note,
      });
      setSelected([]);
      setNote("");
      showToast("선택 보상 실패 검토 처리됨");
      onDone();
    } catch (e) {
      showToast(`처리 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="보상 실패 보정 후보">
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">후보 없음</p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <TextField
              label="처리 메모"
              value={note}
              onChange={setNote}
            />
            <Button
              onClick={() => void markReviewed()}
              disabled={saving || selected.length === 0}
            >
              {saving ? "처리 중..." : `선택 ${selected.length}건 검토 처리`}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="py-1 pr-3 font-medium">선택</th>
                  <th className="py-1 pr-3 font-medium">event id</th>
                  <th className="py-1 pr-3 font-medium">유저</th>
                  <th className="py-1 pr-3 font-medium">유형</th>
                  <th className="py-1 pr-3 font-medium">시각</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1 pr-3">
                      <input
                        type="checkbox"
                        checked={selectedSet.has(row.id)}
                        onChange={() => toggle(row.id)}
                      />
                    </td>
                    <td className="py-1 pr-3 font-mono">{row.id}</td>
                    <td className="py-1 pr-3 font-mono">
                      {row.userId ? (
                        <Link
                          href={`/admin?tab=economy&userId=${encodeURIComponent(row.userId)}&eventType=${encodeURIComponent(row.eventType)}`}
                          className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:decoration-zinc-700 dark:hover:text-white"
                        >
                          {row.userId.slice(0, 12)}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-1 pr-3 font-mono">{row.itemId ?? row.eventType}</td>
                    <td className="py-1 pr-3 text-zinc-500">
                      {new Date(row.createdAt).toLocaleString("ko-KR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Panel>
  );
}

function AlertThresholdPanel({
  value,
  onSaved,
}: {
  value: AlertThresholdSettings;
  onSaved: () => void;
}) {
  const { showToast } = useAdmin();
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // 서버 설정을 편집 draft 로 복사한다. 이후 입력 중에는 draft 가 로컬 소스다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(value);
  }, [value]);

  const save = async () => {
    setSaving(true);
    try {
      await adminPost("/api/admin/ops-settings", { alertThresholds: draft });
      showToast("알림 임계치 저장됨");
      onSaved();
    } catch (e) {
      showToast(`저장 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="운영 알림 임계치">
      <div className="grid gap-2 md:grid-cols-5">
        <NumberField
          label="제한 5분"
          value={draft.abuseLast5m}
          onChange={(abuseLast5m) => setDraft({ ...draft, abuseLast5m })}
          max={100_000}
        />
        <NumberField
          label="제한 1시간"
          value={draft.abuseLast1h}
          onChange={(abuseLast1h) => setDraft({ ...draft, abuseLast1h })}
          max={100_000}
        />
        <NumberField
          label="보상 실패"
          value={draft.rewardFailures}
          onChange={(rewardFailures) => setDraft({ ...draft, rewardFailures })}
          max={100_000}
        />
        <NumberField
          label="대량 골드"
          value={draft.largeGoldEvents}
          onChange={(largeGoldEvents) => setDraft({ ...draft, largeGoldEvents })}
          max={100_000}
        />
        <NumberField
          label="관리자 변경"
          value={draft.adminAudit}
          onChange={(adminAudit) => setDraft({ ...draft, adminAudit })}
          max={100_000}
        />
      </div>
      <div className="mt-2 flex justify-end">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "저장 중..." : "임계치 저장"}
        </Button>
      </div>
    </Panel>
  );
}

function AlertHistoryPanel({ rows }: { rows: AlertHistoryEntry[] }) {
  return (
    <Panel title="운영 알림 이력">
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">이력 없음</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="py-1 pr-3 font-medium">시각</th>
                <th className="py-1 pr-3 font-medium">상태</th>
                <th className="py-1 pr-3 font-medium">메시지</th>
                <th className="py-1 pr-3 font-medium">오류</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="whitespace-nowrap py-1 pr-3 text-zinc-500">
                    {new Date(row.createdAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="py-1 pr-3 font-mono">{row.status}</td>
                  <td className="py-1 pr-3">{row.message}</td>
                  <td className="py-1 pr-3 text-zinc-500">{row.error ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function HotTimePanel() {
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
            {scheduleDraft.length === 0 ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">예약 없음</p>
            ) : (
              <div className="space-y-2">
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

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function ScheduleEditor({
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

function AlertCard({
  level,
  title,
  message,
}: {
  level: "danger" | "warning" | "info";
  title: string;
  message: string;
}) {
  const tone =
    level === "danger"
      ? "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
      : level === "warning"
        ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        : "border-zinc-200 bg-white text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200";
  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${tone}`}>
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5">{message}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "datetime-local" | "time";
}) {
  return (
    <label className="space-y-1 text-xs">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  max = 500,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max?: number;
}) {
  return (
    <label className="space-y-1 text-xs">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) =>
          onChange(Math.min(max, Math.max(0, Math.floor(Number(e.target.value) || 0))))
        }
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
    </label>
  );
}

function toLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <h4 className="mb-2 text-xs font-semibold">{title}</h4>
      {children}
    </section>
  );
}

function CountList({ rows, empty }: { rows: CountRow[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="text-xs text-zinc-500 dark:text-zinc-400">{empty}</p>;
  }
  return (
    <ul className="space-y-1 text-xs">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate font-mono">{row.key}</span>
          <span className="shrink-0 tabular-nums text-zinc-500">{row.count.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

function MiniList({ title, rows }: { title: string; rows: CountRow[] }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium text-zinc-500">{title}</div>
      <CountList rows={rows} empty="없음" />
    </div>
  );
}
