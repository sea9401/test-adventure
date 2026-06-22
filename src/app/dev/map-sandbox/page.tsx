import { notFound } from "next/navigation";
import { MapSandbox } from "@/adventure/v2/dev/MapSandbox";

// staging(IS_STAGING=true) 또는 dev 빌드에서만. 라이브 prod 는 404.
export default function MapSandboxPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.IS_STAGING !== "true"
  ) {
    notFound();
  }
  return (
    <main className="min-h-screen bg-zinc-950">
      <MapSandbox />
    </main>
  );
}
