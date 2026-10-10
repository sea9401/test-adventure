"use client";

import { useEffect, useState } from "react";
import { Medal } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { confirmGameAction } from "@/components/ui/gameDialog";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import type { LifeMajorActivity, LifeMajorActivityView, LifeMajorView } from "./lifeMajor";
import {
  craftTemperingCatalyst,
  fetchLifeMajorView,
  isLifeMajorChange,
  lifeMajorErrorLabel,
  saveLifeMajors,
} from "./lifeMajorClient";

type Selection = { major: LifeMajorActivity | null; minor: LifeMajorActivity | null };

function formatDate(ms: number): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

function toActivity(value: string): LifeMajorActivity | null {
  return value === "" ? null : (value as LifeMajorActivity);
}

// 생활 기록 화면의 "생활 전공" 카드 — Lv.100 생활 중 주전공·부전공을 고르고 명장 단계를 본다.
export function LifeMajorCard() {
  const [view, setView] = useState<LifeMajorView | null>(null);
  const [selection, setSelection] = useState<Selection>({ major: null, minor: null });
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchLifeMajorView().then((next) => {
      if (cancelled) return;
      if (!next) {
        setLoadFailed(true);
        return;
      }
      setView(next);
      setSelection({ major: next.major, minor: next.minor });
      setNow(Date.now());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadFailed) {
    return (
      <section className={`${SURFACE_CARD} p-3 text-sm text-zinc-600 dark:text-zinc-300`}>
        생활 전공 정보를 불러오지 못했습니다.
      </section>
    );
  }
  if (!view) return null;

  const eligible = view.activities.filter((entry) => entry.eligible);
  const changed = selection.major !== view.major || selection.minor !== view.minor;
  const isChange = isLifeMajorChange(view, selection);
  const coolingDown = view.nextChangeAt !== null && view.nextChangeAt > now;
  const saveDisabled = !changed || (isChange && coolingDown) || saving;

  const save = async () => {
    if (isChange) {
      const confirmed = await confirmGameAction({
        title: "전공 변경",
        message: "전공을 바꾸면 30일 동안 다시 바꿀 수 없습니다. 쌓은 명장 단계는 그대로 남습니다.",
        confirmLabel: "변경",
      });
      if (!confirmed) return;
    }
    setSaving(true);
    setNotice(null);
    const result = await saveLifeMajors(selection);
    setSaving(false);
    if (result.ok) {
      setView(result.view);
      setSelection({ major: result.view.major, minor: result.view.minor });
      setNow(Date.now());
      setNotice({ tone: "success", text: "전공을 저장했습니다." });
    } else {
      setNotice({ tone: "error", text: lifeMajorErrorLabel(result.error) });
    }
  };

  return (
    <section className={`${SURFACE_CARD} space-y-3 p-3`} aria-labelledby="life-major-heading">
      <div className="flex items-center gap-2">
        <Medal size={20} weight="duotone" className="shrink-0 text-amber-500" aria-hidden />
        <h2 id="life-major-heading" className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
          생활 전공
        </h2>
      </div>

      {eligible.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Lv.100을 달성한 생활이 생기면 주전공과 부전공을 고를 수 있습니다. 전공 생활은 Lv.100 이후에도 명장 단계로 계속 성장합니다.
        </p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["major", "minor"] as const).map((slot) => (
              <label key={slot} className="flex flex-col gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                {slot === "major" ? "주전공" : "부전공"}
                <select
                  value={selection[slot] ?? ""}
                  onChange={(event) =>
                    setSelection((current) => ({ ...current, [slot]: toActivity(event.target.value) }))
                  }
                  className="min-h-10 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value="">선택 안 함</option>
                  {eligible.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" disabled={saveDisabled} loading={saving} onClick={() => void save()}>
              전공 저장
            </Button>
            {coolingDown && view.nextChangeAt !== null ? (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                다음 변경 가능 {formatDate(view.nextChangeAt)}
              </span>
            ) : null}
          </div>
        </>
      )}

      {notice ? <StatusBanner tone={notice.tone}>{notice.text}</StatusBanner> : null}

      {view.crafting.catalystUnlocked ? (
        <CatalystRow
          crafting={view.crafting}
          onCrafted={(next) => setView(next)}
          onNotice={setNotice}
        />
      ) : null}

      <ul className="space-y-1.5">
        {view.activities.filter((entry) => entry.role || entry.stage > 0).map((entry) => (
          <MajorRow key={entry.id} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

function CatalystRow({
  crafting,
  onCrafted,
  onNotice,
}: {
  crafting: LifeMajorView["crafting"];
  onCrafted: (view: LifeMajorView) => void;
  onNotice: (notice: { tone: "success" | "error"; text: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const canCraft = crafting.alloy >= 2 && crafting.wood >= 1;
  const craft = async () => {
    setBusy(true);
    const result = await craftTemperingCatalyst(1);
    setBusy(false);
    if (result.ok) {
      onCrafted(result.view);
      onNotice({ tone: "success", text: "단련 촉매를 만들었습니다." });
    } else {
      onNotice({ tone: "error", text: lifeMajorErrorLabel(result.error) });
    }
  };
  return (
    <div className={`${SURFACE_INSET} flex items-center gap-3 p-2.5`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">단련 촉매</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          명장 합금 {crafting.alloy} · 명장 목재 {crafting.wood} · 보유 촉매 {crafting.catalysts}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          1개당 명장 합금 2 + 명장 목재 1 · 강화 시 하락 확률을 최대 10%p 낮춥니다.
        </p>
      </div>
      <Button size="sm" className="shrink-0" disabled={!canCraft} loading={busy} onClick={() => void craft()}>
        1개 만들기
      </Button>
    </div>
  );
}

function MajorRow({ entry }: { entry: LifeMajorActivityView }) {
  const progress = entry.capped
    ? 100
    : Math.min(100, (entry.stageXpInto / Math.max(1, entry.stageXpForNext)) * 100);
  return (
    <li className={`${SURFACE_INSET} p-2.5`}>
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">{entry.name}</span>
        {entry.role ? (
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
            {entry.role === "major" ? "주전공" : "부전공"}
          </span>
        ) : null}
        <span className="ml-auto font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">
          명장 {entry.stage}단계
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className="h-full rounded-full bg-amber-500" style={{ width: `${progress}%` }} />
      </div>
      {entry.role ? (
        <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-300">
          {entry.effectText ? <span>{entry.effectText}</span> : null}
          {entry.productName && entry.productChancePct > 0 ? (
            <span>
              {entry.effectText ? " · " : ""}
              {entry.productName} 확률 {Number(entry.productChancePct.toFixed(3))}%
            </span>
          ) : null}
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">전공이 아니라 성장과 효과가 멈춰 있습니다.</p>
      )}
    </li>
  );
}
