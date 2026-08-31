import { PageShell } from "@/components/ui/PageShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { SURFACE_CARD } from "@/components/ui/surfaces";

export default function Loading() {
  return (
    <PageShell spacing="tight">
      <section
        role="status"
        aria-label="화면 불러오는 중"
        aria-busy="true"
        className={`${SURFACE_CARD} space-y-4 p-4`}
      >
        <span className="sr-only">화면을 불러오고 있습니다.</span>
        <Skeleton className="h-10 w-2/5" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </section>
    </PageShell>
  );
}
