"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "@phosphor-icons/react";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { UGC_POLICY_VERSION } from "@/lib/ugc-safety";

type ConsentState = "loading" | "required" | "submitting" | "accepted" | "error";

export function UgcConsentPrompt() {
  const [state, setState] = useState<ConsentState>("loading");
  const [checked, setChecked] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch("/api/safety/ugc-consent", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("load failed");
      const result = (await response.json()) as { accepted: boolean };
      setState(result.accepted ? "accepted" : "required");
      setMessage(null);
    } catch {
      setState("error");
      setMessage("동의 상태를 확인하지 못했습니다. 네트워크를 확인해주세요.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/safety/ugc-consent", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("load failed");
        return response.json() as Promise<{ accepted: boolean }>;
      })
      .then((result) => {
        if (!active) return;
        setState(result.accepted ? "accepted" : "required");
        setMessage(null);
      })
      .catch(() => {
        if (!active) return;
        setState("error");
        setMessage("동의 상태를 확인하지 못했습니다. 네트워크를 확인해주세요.");
      });
    return () => {
      active = false;
    };
  }, []);

  const accept = async () => {
    if (!checked || state === "submitting") return;
    setState("submitting");
    setMessage(null);
    try {
      const response = await fetch("/api/safety/ugc-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: true, version: UGC_POLICY_VERSION }),
      });
      if (!response.ok) throw new Error("accept failed");
      setState("accepted");
    } catch {
      setState("required");
      setMessage("동의를 저장하지 못했습니다. 다시 시도해주세요.");
    }
  };

  if (state === "accepted" || state === "loading") return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ugc-consent-title"
        className={`${SURFACE_CARD} w-full max-w-lg p-5 text-zinc-900 dark:text-zinc-100 sm:p-6`}
      >
        <div className="flex items-start gap-3">
          <ShieldCheck
            size={32}
            weight="duotone"
            className="shrink-0 text-emerald-600 dark:text-emerald-400"
          />
          <div>
            <h2 id="ugc-consent-title" className="text-xl font-bold">
              커뮤니티 운영정책 동의
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              이름·프로필 이미지·길드 정보·글·댓글·채팅·쪽지처럼 다른 이용자에게 공개되는 콘텐츠를 만들기 전에 아래 기준에 명시적으로 동의해야 합니다.
            </p>
          </div>
        </div>

        <div className={`${SURFACE_INSET} mt-5 space-y-2 p-4 text-sm leading-relaxed`}>
          <p>괴롭힘, 혐오·차별, 음란물, 폭력적 위협, 도배·광고, 사기, 개인정보 침해 콘텐츠를 게시하지 않습니다.</p>
          <p>위반 콘텐츠는 숨김·삭제될 수 있으며, 반복하거나 중대한 경우 계정 이용이 제한될 수 있습니다.</p>
          <p>다른 이용자는 콘텐츠와 사용자를 신고하거나 차단할 수 있고, 운영자는 신고 당시 내용과 관련 기록을 검토할 수 있습니다.</p>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          전문은 <Link href="/terms" target="_blank" className="font-semibold underline underline-offset-2">이용약관</Link>,{" "}
          <Link href="/operations" target="_blank" className="font-semibold underline underline-offset-2">운영정책</Link>,{" "}
          <Link href="/privacy" target="_blank" className="font-semibold underline underline-offset-2">개인정보처리방침</Link>에서 확인할 수 있습니다.
        </p>

        {state === "error" ? (
          <div className="mt-5">
            <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
              {message}
            </p>
            <button
              type="button"
              onClick={load}
              className="mt-3 min-h-11 rounded-md bg-zinc-800 px-4 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              다시 확인
            </button>
          </div>
        ) : (
          <>
            <label className={`${SURFACE_INSET} mt-5 flex cursor-pointer items-start gap-3 p-3 text-sm font-semibold`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => setChecked(event.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0"
              />
              <span>위 커뮤니티 운영 기준과 이용자 콘텐츠 처리 방침을 확인했으며 이에 동의합니다.</span>
            </label>
            {message && (
              <p className="mt-3 text-sm text-rose-600 dark:text-rose-400" role="alert">
                {message}
              </p>
            )}
            <button
              type="button"
              onClick={accept}
              disabled={!checked || state === "submitting"}
              className="mt-4 min-h-12 w-full rounded-md bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state === "submitting" ? "동의 저장 중…" : "동의하고 커뮤니티 이용"}
            </button>
          </>
        )}

        <p className="mt-4 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
          동의하지 않으면 커뮤니티 콘텐츠를 작성할 수 없습니다. 계정 삭제 안내는{" "}
          <Link href="/account-deletion" className="underline underline-offset-2">여기</Link>에서 확인할 수 있습니다.
        </p>
      </section>
    </div>
  );
}
