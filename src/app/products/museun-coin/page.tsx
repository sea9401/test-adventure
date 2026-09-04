import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MUSEUN_COIN_PACKAGES } from "@/adventure/data/v2/adventureSupport";
import { MerchantDisclosure } from "@/components/MerchantDisclosure";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import {
  readPublicMerchantInfo,
  type PublicMerchantInfo,
} from "@/lib/publicMerchantInfo";

export const metadata: Metadata = {
  title: "무슨 코인 상품 안내 | 무슨무슨게임",
  description:
    "무슨무슨게임에서 판매하는 계정 귀속형 무슨 코인 상품과 가격, 지급 및 환불 기준을 안내합니다.",
};

export const MUSEUN_COIN_PRODUCT_IMAGES = {
  coin_1000: "/images/products/museun-coin-1000.svg",
  coin_2000: "/images/products/museun-coin-2000.svg",
  coin_3000: "/images/products/museun-coin-3000.svg",
  coin_5000: "/images/products/museun-coin-5000.svg",
} as const;

export function MuseunCoinProductContent({
  merchantInfo,
}: {
  merchantInfo: PublicMerchantInfo | null;
}) {
  return (
    <main className="min-h-screen bg-zinc-50 px-5 py-10 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:px-8 sm:py-16">
      <div className="mx-auto max-w-5xl">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700 dark:text-amber-300">
            Museun Coin
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            무슨 코인 상품 안내
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
            무슨 코인은 게임 내 유료 콘텐츠를 이용할 때 사용하는 계정 귀속형
            재화입니다. 구매 전 상품 가격과 이용 조건을 확인해 주세요.
          </p>
        </header>

        <section aria-labelledby="coin-products" className="mt-10">
          <h2 id="coin-products" className="sr-only">
            판매 중인 무슨 코인 상품
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {MUSEUN_COIN_PACKAGES.map((product) => {
              const coins = product.coins.toLocaleString("ko-KR");
              return (
                <article key={product.id} className={`${SURFACE_CARD} p-4`}>
                  <div className={`${SURFACE_INSET} overflow-hidden p-3`}>
                    <Image
                      src={MUSEUN_COIN_PRODUCT_IMAGES[product.id]}
                      alt={`${coins} 무슨 코인 상품 이미지`}
                      width={256}
                      height={256}
                      className="mx-auto aspect-square h-auto w-full max-w-52"
                    />
                  </div>
                  <h3 className="mt-4 font-semibold">무슨 코인 {coins}개</h3>
                  <p className="mt-1 text-lg font-bold text-amber-700 dark:text-amber-300">
                    {product.priceKrw.toLocaleString("ko-KR")}원
                  </p>
                  <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    결제 승인 직후 계정에 즉시 지급
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <section className={`${SURFACE_CARD} mt-8 p-6 sm:p-8`}>
          <h2 className="text-lg font-semibold">구매 및 이용 안내</h2>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            <li>구매한 코인은 결제에 사용한 게임 계정에만 지급됩니다.</li>
            <li>현금 환전이나 계정 간 이전은 지원하지 않습니다.</li>
            <li>
              미사용 유료 코인의 청약철회와 환불 기준은{" "}
              <Link href="/terms" className="font-medium underline underline-offset-2">
                이용약관
              </Link>
              에서 확인할 수 있습니다.
            </li>
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/sign-in"
              className="rounded-lg bg-amber-500 px-5 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-amber-400"
            >
              로그인하고 구매하기
            </Link>
            <Link
              href="/privacy"
              className="rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              개인정보처리방침
            </Link>
          </div>
        </section>

        <footer className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <MerchantDisclosure merchantInfo={merchantInfo} />
          <Link
            href="/sign-in"
            className="mt-4 inline-block text-xs text-zinc-500 underline underline-offset-2 dark:text-zinc-400"
          >
            무슨무슨게임 홈으로
          </Link>
        </footer>
      </div>
    </main>
  );
}

export default function MuseunCoinProductPage() {
  return (
    <MuseunCoinProductContent
      merchantInfo={readPublicMerchantInfo(process.env)}
    />
  );
}
