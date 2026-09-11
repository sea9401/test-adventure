"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { HuntResultPayload } from "./useDungeonHunt";

type ResultHandoff = { href: string; result: HuntResultPayload } | null;
const DungeonResultHandoffContext = createContext<{
  returnResult: ResultHandoff;
  setReturnResult: Dispatch<SetStateAction<ResultHandoff>>;
} | null>(null);

// 깊이 경로가 바뀌어 페이지가 교체되어도 완료 결과를 한 번 전달한다.
export function DungeonResultHandoffProvider({ children }: { children: ReactNode }) {
  const [returnResult, setReturnResult] = useState<ResultHandoff>(null);
  return (
    <DungeonResultHandoffContext.Provider value={{ returnResult, setReturnResult }}>
      {children}
    </DungeonResultHandoffContext.Provider>
  );
}

export function useDungeonResultHandoff() {
  const value = useContext(DungeonResultHandoffContext);
  if (!value) throw new Error("DungeonResultHandoffProvider is required");
  return value;
}
