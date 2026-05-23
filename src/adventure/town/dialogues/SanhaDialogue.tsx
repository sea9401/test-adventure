import type { Npc } from "@/adventure/data/npcs";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { useInventory } from "@/adventure/inventory/useInventory";
import type { useCharacterState } from "@/adventure/character/useCharacterState";
import type { NotificationKind } from "@/lib/notifications";
import { SKILL_BOOKS } from "@/adventure/data/skillBooks";
import { QuestLineDialogue, type QuestLineStep } from "./questLineDialogue";

const MENDING_BOOK_ID = "book_mending" as const;

type Props = {
  npc: Npc;
  onClose: () => void;
  quests: ReturnType<typeof useQuests>;
  completeQuest: (id: string) => boolean;
  inventory: ReturnType<typeof useInventory>;
  characterStateHook: ReturnType<typeof useCharacterState>;
  addNotification: (kind: NotificationKind, text: string) => void;
};

// 산하 — 약초꾼. 전부 deliver 의뢰. 산초꽃·거인 비늘 → 다리 구간 재료 → 봉황령 화염 비늘.
// 노라(디올라 여관)와 친분 — 연계 의뢰는 §7.2(M5).
const STEPS: QuestLineStep[] = [
  {
    id: "unhyang-sanha-herbs",
    offerText:
      "산기슭에 피는 산초꽃이요. 작고 매운 꽃이에요.\n8송이만 모아다 주시면 약 만드는 솜씨로 보답할게요. 산초꽃을 누벼 만드는 조끼, 그 만드는 법도 적어 드릴게요.",
    activeText: (have, need) => `산초꽃은 산양이 가끔 떨군다고 들었어요. 진행 ${have}/${need}`,
    doneText:
      "오, 산초꽃을 다 모아오셨네요! 향이 정말 좋아요.\n약속한 대로. 포션 한도를 늘려드릴게요. 조끼 만드는 법도 적어 드렸어요.",
    acceptLabel: "받아들인다",
  },
  {
    id: "unhyang-sanha-bones",
    offerText:
      "거인 비늘이 약을 갈무리하는 데 그만이거든요. 5개만 모아다 주시면 회복약을 가득 챙겨드릴게요.",
    activeText: (have, need) =>
      `거인 비늘은 협곡의 무리장 늑대가 가끔 떨군다고 해요. 진행 ${have}/${need}`,
    doneText: "거인 비늘 5개… 정말 가져오셨네요. 무서운 일이었을 텐데요.\n약속한 회복약이에요. 잘 챙겨 두세요.",
  },
  {
    id: "unhyang-sanha-nora-herbs",
    offerText:
      "디올라 여관 주인 노라한테 산정 약초를 좀 보내고 싶어요. 산초꽃 열 송이만 모아다 주시면 제가 부쳐 드릴게요. 답례는 노라가 직접 챙겨 줄 거예요. 디올라 들르면 인사 한번 하시고요.",
    activeText: (have, need) => `산초꽃은 산기슭에서, 산양이 가끔 떨궈요. 진행 ${have}/${need}`,
    doneText:
      "열 송이 다 모으셨네요. 이건 디올라 노라한테 부칠게요. 답례는 거기서 직접 받으세요.\n포션도 좀 챙겨드릴게요. 한도도 조금 늘려드리고요.",
  },
  {
    id: "unhyang-sanha-tough-hide",
    offerText:
      "단단한 가죽으로 약 보따리를 싸야 하거든요. 여섯 장만 모아다 주시면 회복약으로 보답할게요.",
    activeText: (have, need) => `단단한 가죽은 절벽 늑대 쪽이 쓸 만해요. 진행 ${have}/${need}`,
    doneText: "가죽 여섯 장, 결이 좋네요. 약 보따리가 든든하겠어요. 회복약 받으세요.",
  },
  {
    id: "unhyang-sanha-windstone",
    offerText:
      "바람 마석은 약을 오래 갈무리하는 데 그만이에요. 넷만 구해다 주시면 약 주머니를 더 크게 만들어 드릴게요.",
    activeText: (have, need) => `바람 마석은 협곡 돌풍 정령에게서 나와요. 진행 ${have}/${need}`,
    doneText: "바람 마석 넷… 좋아요. 약속한 대로 약 주머니를 크게 만들어 드릴게요.",
  },
  {
    id: "unhyang-sanha-bison-hide",
    offerText:
      "들소 가죽으로 약상자를 짜야겠어요. 여섯 장만 모아다 주시면 회복약으로 보답할게요.",
    activeText: (have, need) => `들소 가죽은 운저 평원 들소 떼에서 모을 수 있어요. 진행 ${have}/${need}`,
    doneText: "들소 가죽 여섯 장이요. 약상자가 튼튼하겠네요. 회복약 받으세요.",
  },
  {
    id: "unhyang-herbalist-flame-scale",
    offerText:
      "봉황령 화염 도마뱀의 비늘이 약 달이는 데 쓸 만해요. 8개만 모아다 주시면, 포션 한 보따리 드릴게요.",
    activeText: (have, need) => `화염 비늘은 봉황령 화염 도마뱀에게서 나와요. 진행 ${have}/${need}`,
    doneText: "화염 비늘 여덟 장, 뜨겁네요. 약속한 포션 한 보따리예요.",
  },
  {
    id: "unhyang-herbalist-flame-eagle-cape",
    offerText:
      "봉황령 불꽃 독수리의 깃을 통째로 엮으면 가벼운 망토가 돼요. 20마리만 잡아 주시면, 그 깃으로 짠 봉황 망토를 직접 만들어 드릴게요.",
    activeText: (have, need) => `불꽃 독수리는 봉황령 능선을 돌아요. 진행 ${have}/${need}`,
    doneText: "스무 마리나… 깃이 충분하네요. 약속한 봉황 망토예요. 가벼운데 불에 강해요. 잘 입으세요.",
  },
];

export function SanhaDialogue({
  npc,
  onClose,
  quests,
  completeQuest,
  inventory,
  characterStateHook,
  addNotification,
}: Props) {
  // 회복술 스킬북 — 약초꾼 답게 약식 처방서 1권 판매. 학습 후 인벤에서 사용.
  // 이미 학습/소지했으면 판매 옵션 자체를 숨겨 중복 구매 방지.
  const book = SKILL_BOOKS[MENDING_BOOK_ID];
  const price = book.price ?? 0;
  const alreadyKnown = (characterStateHook.state.learnedAPSkills ?? []).includes(
    "회복술",
  );
  const alreadyHas = inventory.skillBookCount(MENDING_BOOK_ID) > 0;
  const shouldOfferBook = !alreadyKnown && !alreadyHas;

  return (
    <QuestLineDialogue
      npc={npc}
      onClose={onClose}
      quests={quests}
      completeQuest={completeQuest}
      inventory={inventory}
      steps={STEPS}
      idleText={
        shouldOfferBook
          ? `약초는 여유가 있을 때마다 채워두려고 해요.\n\n…그리고, 손님이 다친 채로 산을 헤매는 게 안쓰러워서, 약식 처방서 한 권을 묶어 뒀어요. "${book.name}". ${price}G 면 가져가세요.`
          : "약초는 여유가 있을 때마다 채워두려고 해요. 또 필요한 게 생기면 말씀드릴게요."
      }
      idleAction={
        shouldOfferBook
          ? {
              label: `${book.name} 구매 (${price}G)`,
              onClick: () => {
                if (characterStateHook.state.gold < price) {
                  addNotification("info", "골드가 부족합니다.");
                  return;
                }
                characterStateHook.addGold(-price);
                inventory.addSkillBook(MENDING_BOOK_ID, 1);
                addNotification(
                  "item",
                  `${book.name} 을(를) 구매했습니다. 가방에서 사용하세요.`,
                );
                onClose();
              },
            }
          : undefined
      }
    />
  );
}
