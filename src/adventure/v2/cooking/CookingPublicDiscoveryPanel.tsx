"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Pagination } from "@/components/ui/Pagination";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { usePagination } from "@/lib/usePagination";
import type { PublicCookingDiscovery } from "./clientTypes";
import {
  publicCookingDiscoveries,
  type PublicCookingDiscoverySort,
} from "./publicDiscoveries";

const PUBLIC_DISCOVERY_PAGE_SIZE = 20;

export function CookingPublicDiscoveryPanel({
  discoveries: sourceDiscoveries,
}: {
  discoveries: readonly PublicCookingDiscovery[];
}) {
  const [sort, setSort] = useState<PublicCookingDiscoverySort>("recent");
  const discoveries = useMemo(
    () => publicCookingDiscoveries(sourceDiscoveries, sort),
    [sourceDiscoveries, sort],
  );
  const pager = usePagination(discoveries, PUBLIC_DISCOVERY_PAGE_SIZE, sort);

  return (
    <section className={`${SURFACE_CARD} p-4`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-bold text-zinc-900 dark:text-zinc-100">
            공개 발견 요리
          </h3>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            공개된 요리 {discoveries.length.toLocaleString("ko-KR")}개
          </p>
        </div>
        <label className="grid gap-1 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
          <span>정렬</span>
          <select
            aria-label="공개 발견 정렬"
            value={sort}
            onChange={(event) =>
              setSort(event.target.value as PublicCookingDiscoverySort)
            }
            className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-normal text-zinc-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-amber-900"
          >
            <option value="recent">최근 발견순</option>
            <option value="oldest">오래된 발견순</option>
            <option value="recipe_name">요리 이름순</option>
            <option value="actor_name">발견자 이름순</option>
            <option value="unregistered">도감 미등록</option>
          </select>
        </label>
      </div>

      {discoveries.length > 0 ? (
        <>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {pager.pageItems.map((discovery) => (
              <article
                key={`${discovery.recipeName}:${discovery.actorName}:${discovery.discoveredAt}`}
                className={`${SURFACE_INSET} flex items-center gap-3 p-3`}
              >
                <Image
                  src={discovery.imageSrc}
                  alt=""
                  width={72}
                  height={72}
                  unoptimized
                  className="h-[72px] w-[72px] shrink-0 object-contain"
                />
                <div className="min-w-0">
                  <h4 className="font-bold text-zinc-900 dark:text-zinc-100">
                    {discovery.recipeName}
                  </h4>
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                    최초 발견자: {discovery.actorName}
                  </p>
                </div>
              </article>
            ))}
          </div>
          <Pagination
            page={pager.page}
            pageCount={pager.pageCount}
            setPage={pager.setPage}
          />
        </>
      ) : (
        <div
          className={`${SURFACE_INSET} mt-4 p-6 text-center text-sm text-zinc-600 dark:text-zinc-300`}
        >
          {sort === "unregistered"
            ? "공개 발견 요리는 모두 도감에 등록했습니다."
            : "아직 공개된 요리가 없습니다."}
        </div>
      )}
    </section>
  );
}
