import type { ReactNode } from "react";
import { DungeonResultHandoffProvider } from "@/adventure/v2/DungeonResultHandoffProvider";

export default function DungeonLayout({ children }: { children: ReactNode }) {
  return <DungeonResultHandoffProvider>{children}</DungeonResultHandoffProvider>;
}
