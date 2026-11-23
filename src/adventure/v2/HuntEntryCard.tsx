"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonClassName } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { huntingGroundImageForDepth } from "./gameSceneBackgroundForPath";
import { MAX_STAMINA, applyRegen, type StaminaState } from "./stamina";

// 장면 그림 띠 — 카드 머리에 넣는 가로로 긴 그림의 공통 훅.
//   은신 모드와 터미널 모드에서는 globals.css가 이 클래스를 숨겨 글과 버튼만 남긴다.
export const SCENE_STRIP_CLASS = "ui-scene-strip";

const STAMINA_REFRESH_MS = 5_000;

/** 모험 홈의 사냥터 카드. 홈에서 가장 자주 하는 행동인 사냥으로 바로 보낸다. */
export function HuntEntryCard({
  stamina,
  staminaMax = MAX_STAMINA,
  regenBonusPct = 0,
  now,
}: {
  stamina: StaminaState;
  staminaMax?: number;
  regenBonusPct?: number;
  /** 테스트와 미리보기에서 시각을 고정할 때만 준다. */
  now?: number;
}) {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (now != null) return;
    const id = setInterval(() => setTick(Date.now()), STAMINA_REFRESH_MS);
    return () => clearInterval(id);
  }, [now]);
  const current = applyRegen(stamina, now ?? tick, staminaMax, regenBonusPct)
    .current;

  return (
    <Card
      as="section"
      padding="none"
      aria-labelledby="hunt-entry-title"
      className="overflow-hidden"
    >
      <div
        aria-hidden
        // 사냥터 그림을 끄는 환경 설정(ui-hunting-ground-image)도 함께 따른다.
        className={`${SCENE_STRIP_CLASS} ui-hunting-ground-image relative h-28 border-b border-zinc-200 bg-zinc-100 sm:h-36 dark:border-zinc-700 dark:bg-zinc-800`}
      >
        <Image
          src={huntingGroundImageForDepth(1)}
          alt=""
          fill
          sizes="(min-width: 768px) 720px, 100vw"
          className="object-cover"
        />
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h2
            id="hunt-entry-title"
            className="text-base font-bold text-zinc-900 dark:text-zinc-100"
          >
            사냥터
          </h2>
          <p className="truncate text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            스태미너 {current.toLocaleString()} / {staminaMax.toLocaleString()}
          </p>
        </div>
        <Link
          href="/battle/dungeon"
          className={buttonClassName({
            variant: "primary",
            size: "md",
            className: "shrink-0 font-semibold",
          })}
        >
          사냥하러 가기
        </Link>
      </div>
    </Card>
  );
}
