"use client";

import { useAdmin } from "@/admin/AdminContext";
import { adminGet, adminPost } from "@/admin/api";
import { adminActionLabel, adminStatusLabel } from "@/admin/displayLabels";
import {
  type AlertHistoryEntry,
  type AlertThresholdSettings,
  type Dashboard,
  type LifeFieldFeatureSettings,
} from "./opsDashboardTypes";
import { NumberField, Panel } from "./OpsDashboardUi";
import { AdminUserLink } from "@/admin/ui/AdminUserLink";
import { Button } from "@/admin/ui/Field";
import { type AdminUserIdentity } from "@/admin/useAdminUserDirectory";
import { useAsyncData } from "@/lib/useAsyncData";
import { useEffect, useState } from "react";

export function LifeFieldFeaturePanel() {
  const { showToast } = useAdmin();
  const { data, loading, error, refetch } = useAsyncData<{
    lifeFieldFeatures: LifeFieldFeatureSettings;
  }>((signal) => adminGet("/api/admin/ops-settings", signal));
  const [draft, setDraft] = useState<LifeFieldFeatureSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data?.lifeFieldFeatures) setDraft(data.lifeFieldFeatures);
  }, [data]);
  useEffect(() => {
    if (error) showToast(`현장 기록 설정 조회 실패: ${error}`);
  }, [error, showToast]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await adminPost<{
        lifeFieldFeatures: LifeFieldFeatureSettings;
      }>("/api/admin/ops-settings", { lifeFieldFeatures: draft });
      setDraft(saved.lifeFieldFeatures);
      showToast("현장 기록 기능 설정 저장됨");
      void refetch();
    } catch (e) {
      showToast(`저장 실패: ${e instanceof Error ? e.message : "오류"}`);
    } finally {
      setSaving(false);
    }
  };

  const rows: readonly [keyof LifeFieldFeatureSettings, string, string][] = [
    ["environmentEnabled", "일일 현장 환경", "환경 배정과 모든 환경 효과"],
    ["discoveriesEnabled", "흔적 발견 판정", "새 흔적 발견과 피티 진행"],
    ["discoveryRewardsEnabled", "발견 완료 보상", "기존 생활 재화 보너스 지급"],
    ["feedEnabled", "희귀 발견 전광판", "희귀 기록 완성 소식 발행"],
    ["milestonesEnabled", "현장 기록 업적", "업적 점수·배지·칭호 수령"],
  ];

  return (
    <Panel title="현장 환경·기록 기능 제어">
      {loading && !draft ? (
        <p className="text-xs text-zinc-500">설정 불러오는 중…</p>
      ) : draft ? (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            장애 범위를 좁혀 끌 수 있습니다. 진행 중인 세션의 환경 효과도 정산 시 현재 설정을 따릅니다.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {rows.map(([key, label, description]) => (
              <label key={key} className="flex items-start gap-2 rounded-md border border-zinc-200 bg-white p-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                <input
                  type="checkbox"
                  checked={draft[key]}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, [key]: event.target.checked } : current,
                    )
                  }
                  className="mt-0.5 size-4"
                />
                <span><b className="block">{label}</b><span className="mt-0.5 block text-[11px] text-zinc-500">{description}</span></span>
              </label>
            ))}
          </div>
          <Button variant="primary" disabled={saving} onClick={() => void save()}>
            {saving ? "저장 중…" : "기능 설정 저장"}
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}


export function AlertThresholdPanel({
  value,
  suggested,
  onSaved,
}: {
  value: AlertThresholdSettings;
  suggested: AlertThresholdSettings;
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
      <div className="grid gap-2 md:grid-cols-4">
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
        <NumberField
          label="동일 유저 이벤트"
          value={draft.repeatUserEvents}
          onChange={(repeatUserEvents) => setDraft({ ...draft, repeatUserEvents })}
          max={100_000}
        />
        <NumberField
          label="동일 IP 계정"
          value={draft.connectedIpUsers}
          onChange={(connectedIpUsers) => setDraft({ ...draft, connectedIpUsers })}
          max={100_000}
        />
        <NumberField
          label="상위 행동"
          value={draft.topActionEvents}
          onChange={(topActionEvents) => setDraft({ ...draft, topActionEvents })}
          max={100_000}
        />
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <Button onClick={() => setDraft(suggested)} disabled={saving}>
          추천값 적용
        </Button>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "저장 중..." : "임계치 저장"}
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
        추천값: 5분 {suggested.abuseLast5m}, 1시간 {suggested.abuseLast1h}, 보상 실패{" "}
        {suggested.rewardFailures}, 대량 골드 {suggested.largeGoldEvents}, 관리자 변경{" "}
        {suggested.adminAudit}, 동일 유저 {suggested.repeatUserEvents}, 동일 IP{" "}
        {suggested.connectedIpUsers}, 상위 행동 {suggested.topActionEvents}
      </p>
    </Panel>
  );
}


export function AlertChannelsPanel({ value }: { value: Dashboard["alertChannels"] }) {
  const rows = [
    { key: "default", label: "기본", env: "OPS_ALERT_WEBHOOK_URL" },
    { key: "reward", label: "보상", env: "OPS_ALERT_REWARD_WEBHOOK_URL" },
    { key: "abuse", label: "이상 행동", env: "OPS_ALERT_ABUSE_WEBHOOK_URL" },
    { key: "economy", label: "경제", env: "OPS_ALERT_ECONOMY_WEBHOOK_URL" },
    { key: "deploy", label: "배포", env: "OPS_ALERT_DEPLOY_WEBHOOK_URL" },
  ] as const;
  const missing = rows.filter((row) => !value[row.key]);
  return (
    <Panel title="운영 알림 채널">
      <div className="grid gap-2 md:grid-cols-5">
        {rows.map((row) => (
          <div
            key={row.key}
            className="rounded-md border border-zinc-100 px-2 py-1.5 text-xs dark:border-zinc-800"
          >
            <div className="font-medium">{row.label}</div>
            <div className={value[row.key] ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500"}>
              {value[row.key] ? "설정됨" : "미설정"}
            </div>
            <div className="mt-0.5 truncate font-mono text-[10px] text-zinc-600 dark:text-zinc-400">
              {row.env}
            </div>
          </div>
        ))}
      </div>
      {missing.length > 0 ? (
        <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          미설정 채널: {missing.map((row) => row.env).join(", ")}. 미설정 채널은 기본 웹훅으로 대체되거나 알림 이력에 skipped로 남습니다.
        </p>
      ) : null}
    </Panel>
  );
}


export function OpsChangeHistoryPanel({
  rows,
  userDirectory,
}: {
  rows: Dashboard["opsChangeHistory"];
  userDirectory: Record<string, AdminUserIdentity>;
}) {
  return (
    <Panel title="운영 변경 이력">
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">최근 변경 없음</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className="py-1 pr-3 font-medium">시각</th>
                <th className="py-1 pr-3 font-medium">작업</th>
                <th className="hidden py-1 pr-3 font-medium md:table-cell">대상</th>
                <th className="py-1 pr-3 font-medium">관리자</th>
                <th className="hidden py-1 pr-3 font-medium md:table-cell">요약</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="whitespace-nowrap py-1 pr-3 text-zinc-500">
                    {new Date(row.createdAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="py-1 pr-3">{adminActionLabel(row.action)}</td>
                  <td className="hidden py-1 pr-3 text-zinc-500 md:table-cell">
                    {row.targetUserId ? (
                      <AdminUserLink
                        userId={row.targetUserId}
                        gameName={userDirectory[row.targetUserId]?.gameName}
                        email={userDirectory[row.targetUserId]?.email}
                        compact
                      />
                    ) : "-"}
                  </td>
                  <td className="py-1 pr-3">{row.adminEmail}</td>
                  <td className="hidden py-1 pr-3 text-zinc-500 md:table-cell">
                    {row.summary || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}


export function AlertHistoryPanel({ rows }: { rows: AlertHistoryEntry[] }) {
  return (
    <Panel title="운영 알림 이력">
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">이력 없음</p>
      ) : (
        <div aria-label="운영 알림 이력 표" className="overflow-x-auto" tabIndex={0}>
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
                  <td className="py-1 pr-3">{adminStatusLabel(row.status)}</td>
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
