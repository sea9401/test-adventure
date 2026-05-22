"use client";

import { useEffect, useRef, useState } from "react";
import {
  applyBundle,
  clearAll,
  downloadBundle,
  loadBundle,
  parseBundle,
  type SaveBundle,
} from "../storage-bundle";
import { useAdmin } from "../AdminContext";
import { Button } from "../ui/Field";
import { DangerAction } from "../ui/DangerAction";
import { WORLD_MAP } from "@/adventure/data/world";
import { QUESTS } from "@/adventure/data/quests";
import { MONSTERS } from "@/adventure/data/monsters";

export function OverviewTab() {
  const { readOnly, bumpVersion, bump, showToast } = useAdmin();
  const fileRef = useRef<HTMLInputElement>(null);
  const [bundle, setBundle] = useState<SaveBundle | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBundle(loadBundle());
  }, [bumpVersion]);

  if (!bundle) return <div className="text-sm">로딩 중…</div>;

  const d = bundle.data;
  const visited = d.map?.visitedRegionIds?.length ?? 0;
  const totalRegions = WORLD_MAP.regions.length;
  const monsterTotal = Object.keys(MONSTERS).length;
  const monsterEncountered = d.log
    ? Object.values(d.log.monsters ?? {}).filter((m) => m?.encountered).length
    : 0;
  const questsCompleted = d.quests
    ? Object.values(d.quests).reduce((sum, q) => sum + (q?.completedCount ?? 0), 0)
    : 0;
  const potionTotal = d.inventory
    ? Object.values(d.inventory.potions ?? {}).reduce(
        (s, n) => s + (n ?? 0),
        0,
      )
    : 0;
  const equipKinds = d.inventory
    ? Object.keys(d.inventory.equipment ?? {}).length
    : 0;
  const matKinds = d.inventory
    ? Object.keys(d.inventory.materials ?? {}).length
    : 0;
  const notifCount = d.notifications?.list?.length ?? 0;
  const autoPotionRules = d.autoPotion?.rules?.length ?? 0;

  const onDownload = () => {
    downloadBundle(loadBundle());
    showToast("백업 파일을 다운로드했습니다.");
  };

  const onPickFile = () => fileRef.current?.click();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      const result = parseBundle(text);
      if ("error" in result) {
        showToast(`복원 실패: ${result.error}`);
        return;
      }
      applyBundle(result);
      bump();
      showToast("복원 완료. 게임 라우트는 새로고침하세요.");
    });
    e.target.value = "";
  };

  return (
    <div className="space-y-4">
      <section>
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          핵심 지표
        </h2>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
          <Card label="이름" value={d.profile?.name ?? "—"} />
          <Card
            label="레벨"
            value={d.character ? `Lv ${d.character.level} (EXP ${d.character.exp})` : "—"}
          />
          <Card label="골드" value={`${d.character?.gold ?? 0} G`} />
          <Card label="명성" value={String(d.character?.fame ?? 0)} />
          <Card label="HP" value={d.character ? `${d.character.hp}` : "—"} />
          <Card label="현재 위치" value={d.map?.currentRegionId ?? "—"} />
          <Card label="방문 지역" value={`${visited} / ${totalRegions}`} />
          <Card label="도감 조우" value={`${monsterEncountered} / ${monsterTotal}`} />
          <Card label="퀘스트 완료(누적)" value={`${questsCompleted}회`} />
          <Card label="포션 총합" value={`${potionTotal}개`} />
          <Card label="장비 종류" value={`${equipKinds}종`} />
          <Card label="재료 종류" value={`${matKinds}종`} />
          <Card label="알림" value={`${notifCount}건`} />
          <Card label="자동포션 룰" value={`${autoPotionRules}개`} />
          <Card label="테마" value={d.theme ?? "(미설정)"} />
        </div>
        <div className="mt-2 text-xs text-zinc-500">
          전체 퀘스트: {QUESTS.length} · 전체 지역: {totalRegions} · 전체 몬스터:{" "}
          {monsterTotal}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          백업 / 복원
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button onClick={onDownload}>📥 전체 백업 (JSON 다운로드)</Button>
          <Button disabled={readOnly} onClick={onPickFile}>
            📤 전체 복원 (JSON 업로드)
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={onFileChange}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          schemaVersion 1 형식의 JSON 만 허용. 누락된 키는 그대로 유지됨.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          위험한 작업
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <DangerAction
            disabled={readOnly}
            trigger="♻️ 전체 초기화"
            title="모든 진행 상태 삭제"
            description="모든 *.v1 키 + theme 키를 삭제합니다. 이 동작은 되돌릴 수 없습니다 (백업이 없다면)."
            confirmText="DELETE ALL"
            onConfirm={() => {
              clearAll();
              bump();
              showToast("전체 초기화 완료. 게임 라우트를 새로고침하세요.");
            }}
          />
        </div>
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}
