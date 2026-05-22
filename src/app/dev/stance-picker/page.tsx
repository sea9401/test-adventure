"use client";

import { useState } from "react";
import { StancePicker } from "@/adventure/character/StancePicker";
import type { StanceId } from "@/adventure/character/stance";

// #497 전술 선택기 프리뷰 — 로그인 없이 선택 동작 확인. (prod 404 은 /dev layout 가드.)
export default function StancePickerPreview() {
  const [stance, setStance] = useState<StanceId | null>(null);
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>DEV</strong> · StancePicker — 선택값:{" "}
        <code className="font-semibold">{stance ?? "null(없음)"}</code>
      </div>
      <StancePicker value={stance} onChange={setStance} />
    </div>
  );
}
