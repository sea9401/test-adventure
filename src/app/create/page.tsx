import { CreateCharacterPageContents } from "./CreateCharacterPageContents";

// v2 캐릭터 생성 페이지. 신규 유저(character-profile.v2 미설정)는 루트 게임의 온보딩
// 게이트가 이리로 보낸다. 이름·외형 → 직업·속성 선택 후 게임(/)으로 진입.
// server component 로 두고 client boundary 는 CreateCharacterPageContents 가 명시
// (SaveProvider/STARTER_SAVES 의 client hook chain 이 server build graph 로 끌려오는 것 회피).
export default function CreatePage() {
  return <CreateCharacterPageContents />;
}
