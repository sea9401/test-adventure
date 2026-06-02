"use client";

import { SaveProvider } from "@/lib/storage/SaveProvider";
import { STARTER_SAVES } from "@/adventure/starterSaves";
import { CreateCharacterFlow } from "./CreateCharacterFlow";

// SaveProvider 로 감싸 useProfile(character-profile.v2) 과 STARTER_SAVES 시드를 client
// 컨텍스트에서만 다룬다 (V2GamePageContents 와 동일 패턴 — Turbopack server/client 사고 회피).
export function CreateCharacterPageContents() {
  return (
    <SaveProvider starters={STARTER_SAVES}>
      <CreateCharacterFlow />
    </SaveProvider>
  );
}
