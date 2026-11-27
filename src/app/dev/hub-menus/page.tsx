"use client";

import { V2BattleHome } from "@/adventure/v2/V2BattleHome";
import { V2CharacterMenu } from "@/adventure/v2/V2CharacterMenu";
import { V2PlazaHome } from "@/adventure/v2/V2PlazaHome";
import { V2TownHome } from "@/adventure/v2/V2TownHome";

// 허브 메뉴(캐릭터·마을·전투·광장) 미리보기 — 타일 격자를 로그인 없이 확인(상태 글은 로그인 화면에서만 붙는다).
export default function HubMenusPreviewPage() {
  const noop = () => undefined;
  return (
    <div className="space-y-2 pb-10">
      <V2CharacterMenu onAction={noop} />
      <V2TownHome gameStateLoaded viewerGuildId={null} onAction={noop} />
      <V2BattleHome onAction={noop} />
      <V2PlazaHome onAction={noop} />
    </div>
  );
}
