"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/adventure/profile/useProfile";
import { CreateCharacterForm } from "@/components/CreateCharacterForm";
import {
  V2_CLASS_DEFS,
  V2_SELECTABLE_CLASSES,
  type V2Class,
} from "@/adventure/data/v2/classes";
import {
  V2_ELEMENT_LABEL,
  V2_PLAYER_ELEMENTS,
  type V2Element,
} from "@/adventure/data/v2/elements";

// v2 캐릭터 생성 2단계:
//  ① 이름·외형 — CreateCharacterForm (중복검사 내장) → /api/profile/setup
//  ② 직업·속성 — 첫 선택은 무료(none 에서) → /api/v2/me/class-element
// 완료 시 게임(/)으로. 이미 프로필이 있으면(중복 진입) 바로 / 로 되돌린다.
export function CreateCharacterFlow() {
  const router = useRouter();
  const { needsSetup, submit } = useProfile();
  const [phase, setPhase] = useState<"profile" | "class">("profile");
  const [cls, setCls] = useState<V2Class>(V2_SELECTABLE_CLASSES[0]);
  const [elem, setElem] = useState<V2Element>(V2_PLAYER_ELEMENTS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 프로필 단계에서 이미 캐릭터가 있으면 게임으로. 직업 단계는 방금 프로필을 만든
  // 직후(needsSetup=false)라 리다이렉트하지 않는다 (phase 가드).
  useEffect(() => {
    if (phase === "profile" && !needsSetup) router.replace("/");
  }, [phase, needsSetup, router]);

  const finish = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/v2/me/class-element", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ class: cls, element: elem }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!j?.ok) {
        setErr(`직업·속성 적용 실패: ${j?.error ?? `http ${res.status}`}`);
        setBusy(false);
        return;
      }
      router.replace("/");
    } catch (e) {
      setErr(`네트워크 오류: ${(e as Error).message}`);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {phase === "profile" ? (
          <>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              캐릭터 생성
            </h1>
            <p className="mb-4 mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              이름과 외형을 정하세요.
            </p>
            <CreateCharacterForm
              onSubmit={submit}
              onSuccess={() => setPhase("class")}
            />
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              직업 · 속성 선택
            </h1>
            <p className="mb-4 mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              시작 직업과 속성을 고르세요. 나중에 마을 「성장의 신전」에서 바꿀 수 있어요.
            </p>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              직업
              <select
                value={cls}
                onChange={(e) => setCls(e.target.value as V2Class)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {V2_SELECTABLE_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {V2_CLASS_DEFS[c].name} ({V2_CLASS_DEFS[c].group})
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              속성
              <select
                value={elem}
                onChange={(e) => setElem(e.target.value as V2Element)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {V2_PLAYER_ELEMENTS.map((el) => (
                  <option key={el} value={el}>
                    {V2_ELEMENT_LABEL[el]}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-3 rounded-md bg-zinc-100 p-3 text-xs leading-relaxed text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">
              {V2_CLASS_DEFS[cls].description}
            </p>
            <button
              type="button"
              onClick={finish}
              disabled={busy}
              className="mt-4 w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "생성 중…" : "모험 시작"}
            </button>
            {err && (
              <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                {err}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
