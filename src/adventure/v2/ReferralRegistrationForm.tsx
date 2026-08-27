"use client";

import { useState } from "react";
import { UserPlus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SURFACE_INSET } from "@/components/ui/surfaces";

const REGISTER_ERROR_MESSAGES: Record<string, string> = {
  invalid_referral: "유효한 홍보 링크 또는 코드를 확인해 주세요.",
  self_referral: "내 홍보 코드는 추천인으로 등록할 수 없습니다.",
  already_attributed: "이미 추천인이 등록되었거나 홍보 보상을 받은 계정입니다.",
};

const UNKNOWN_ERROR =
  "추천인을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export function ReferralRegistrationForm({
  onRegistered,
}: {
  onRegistered: () => Promise<void> | void;
}) {
  const [referral, setReferral] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !referral.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/referrals/me/attribute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ referral: referral.trim() }),
      });
      const json = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !json?.ok) {
        setError(
          (json?.error && REGISTER_ERROR_MESSAGES[json.error]) || UNKNOWN_ERROR,
        );
        return;
      }
      await onRegistered();
    } catch {
      setError(UNKNOWN_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card padding="md" className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="rounded-full bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <UserPlus size={22} weight="duotone" />
        </span>
        <div>
          <h2 className="text-sm font-bold">추천인 등록</h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            가입할 때 홍보 링크를 사용하지 않았어도 추천인의 링크나 코드를 등록할
            수 있습니다. 이미 완료한 단계도 소급 적용해 양쪽에 보상을 지급합니다.
          </p>
        </div>
      </div>

      <form className="space-y-2" onSubmit={submit}>
        <label
          htmlFor="referral-registration-input"
          className="block text-xs font-medium text-zinc-600 dark:text-zinc-300"
        >
          추천인의 홍보 링크 또는 코드
        </label>
        <input
          id="referral-registration-input"
          value={referral}
          onChange={(event) => setReferral(event.target.value)}
          autoComplete="off"
          placeholder="https://msmsge.com/r/… 또는 16자리 코드"
          className={`${SURFACE_INSET} min-h-11 w-full px-3 py-2 text-sm text-zinc-800 outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-zinc-100`}
        />
        <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
          추천인은 계정당 한 번만 등록할 수 있으며 등록 후 변경하거나 취소할 수
          없습니다.
        </p>
        {error && (
          <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">
            {error}
          </p>
        )}
        <Button
          type="submit"
          variant="success"
          size="md"
          fullWidth
          loading={submitting}
          loadingLabel="추천인 등록 중"
          disabled={!referral.trim()}
        >
          추천인 등록
        </Button>
      </form>
    </Card>
  );
}
