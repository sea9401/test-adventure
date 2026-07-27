"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Gift, Ticket } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { TextInput } from "@/components/ui/TextInput";

type RedeemResult = {
  campaignName: string;
  rewards: string[];
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_code: "쿠폰 코드를 다시 확인해주세요.",
  not_available: "현재 사용할 수 없는 쿠폰입니다.",
  not_started: "아직 사용 기간이 시작되지 않은 쿠폰입니다.",
  expired: "사용 기간이 끝난 쿠폰입니다.",
  already_used: "이미 사용된 쿠폰입니다.",
  already_redeemed: "이미 이 쿠폰의 보상을 받았습니다.",
  not_eligible: "이 계정에서 사용할 수 없는 쿠폰입니다.",
  rate_limited: "입력 횟수가 너무 많습니다. 잠시 뒤 다시 시도해주세요.",
};

export function V2CouponView() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RedeemResult | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim() || busy || result) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/coupons/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json().catch(() => null)) as
        | ({ ok: true } & RedeemResult)
        | { ok?: false; error?: string }
        | null;
      if (!response.ok || !data?.ok) {
        const key = data && "error" in data ? data.error : undefined;
        throw new Error(key || "unknown");
      }
      setResult({ campaignName: data.campaignName, rewards: data.rewards });
      window.dispatchEvent(new Event("v2inbox:refresh"));
    } catch (caught) {
      const key = caught instanceof Error ? caught.message : "unknown";
      setError(ERROR_MESSAGES[key] ?? "쿠폰을 확인하지 못했습니다. 잠시 뒤 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell spacing="normal">
      <SubViewHeader title="쿠폰 등록" onBack={() => router.back()} />

      <Card padding="lg" className="space-y-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-amber-100 p-2 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            <Ticket size={28} weight="duotone" />
          </div>
          <div>
            <h2 className="font-semibold">쿠폰 코드를 입력해주세요</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              대소문자와 하이픈은 구분하지 않습니다. 등록한 보상은 우편함으로 도착합니다.
            </p>
          </div>
        </div>

        {result ? (
          <div className="space-y-3">
            <StatusBanner tone="success" role="status" className="py-3 text-sm">
              <span className="font-semibold">{result.campaignName}</span> 쿠폰을 등록했습니다.
            </StatusBanner>
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Gift size={18} weight="duotone" /> 도착한 보상
              </div>
              <ul className="space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                {result.rewards.map((reward) => (
                  <li key={reward}>· {reward}</li>
                ))}
              </ul>
            </div>
            <Link
              href="/plaza/inbox"
              className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 dark:border-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              우편함에서 받기
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label htmlFor="coupon-code" className="block text-sm font-medium">
              쿠폰 코드
            </label>
            <TextInput
              id="coupon-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="BETA-XXXX-XXXX-XXXX"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={48}
              className="w-full py-2.5 font-mono tracking-wider uppercase"
              aria-describedby={error ? "coupon-error" : undefined}
            />
            {error && (
              <StatusBanner id="coupon-error" tone="error" role="alert" className="py-2 text-sm">
                {error}
              </StatusBanner>
            )}
            <Button type="submit" variant="primary" size="md" fullWidth disabled={!code.trim() || busy}>
              {busy ? "확인 중..." : "쿠폰 등록"}
            </Button>
          </form>
        )}
      </Card>
    </PageShell>
  );
}
