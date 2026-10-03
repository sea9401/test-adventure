"use client";

import { useState } from "react";
import { mutateEmblems, type EmblemState } from "@/adventure/data/v2/emblems";
import { V2EmblemView } from "@/adventure/v2/V2EmblemView";

// 문장 화면 미리보기 — /api/v2/emblems 요청을 이 페이지 안의 예시 상태로 응답한다.
//   장착·해제·합성도 실제 규칙(mutateEmblems)으로 동작한다. 서버·DB 없이 화면 흐름 확인용.
const SAMPLE: EmblemState = {
  revision: 1,
  slots: ["e1", "e4", null, null],
  owned: [
    { iid: "e1", kind: "str", grade: 2 },
    { iid: "e2", kind: "str", grade: 1 },
    { iid: "e3", kind: "str", grade: 1 },
    { iid: "e4", kind: "hp", grade: 3 },
    { iid: "e5", kind: "hp", grade: 1 },
    { iid: "e6", kind: "dex", grade: 1 },
    { iid: "e7", kind: "dex", grade: 1 },
    { iid: "e8", kind: "dex", grade: 1 },
    { iid: "e9", kind: "int", grade: 2 },
    { iid: "e10", kind: "luk", grade: 1 },
    { iid: "e11", kind: "mp", grade: 1 },
    { iid: "e12", kind: "vit", grade: 1 },
  ],
};

let current: EmblemState = SAMPLE;
let installed = false;

function installMockFetch() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("/api/v2/emblems")) return realFetch(input, init);
    if (!init?.method || init.method === "GET") return Response.json({ ok: true, emblems: current });
    const body = JSON.parse(String(init.body ?? "{}"));
    try {
      const result = mutateEmblems(current, body);
      current = result.state;
      return Response.json({ ok: true, emblems: current, ...(result.success === undefined ? {} : { success: result.success }) });
    } catch (error) {
      return Response.json({ ok: false, error: (error as Error).message, emblems: current }, { status: 400 });
    }
  };
}

export default function EmblemsPreviewPage() {
  useState(() => installMockFetch());
  return <V2EmblemView />;
}
