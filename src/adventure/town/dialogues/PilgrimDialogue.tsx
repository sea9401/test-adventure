import type { Npc } from "@/adventure/data/npcs";
import { NpcDialogue } from "@/adventure/NpcDialogue";
import type { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { useAdventureLog } from "@/adventure/log/useAdventureLog";

type Props = {
  npc: Npc;
  onClose: () => void;
  storyFlags: ReturnType<typeof useStoryFlags>;
  quests: ReturnType<typeof useQuests>;
  completeQuest: (id: string) => boolean;
  adventureLog: ReturnType<typeof useAdventureLog>;
};

const GIANTS_ORIGIN = "hidden-giants-origin";

// 순례자 미상 — "북쪽 너머" 미스터리 + 히든.
//   0 잠금          : npcs.ts greeting + 짧은 잡담.
//   1 1차 해금      : volcano_heart_defeated → 천공 성지·해무를 가리킨다.
//   2 2차 해금      : skyreach_main_cleared → 북쪽 정체 공개 + pilgrim_revealed flag.
// 히든: 거인의 기원(hidden-giants-origin, unhyang_main_cleared + 운봉의 거인 5회) /
//       표식(hidden-hooded-cipher 릴레이 — 후드 손님이 cipher_started 를 켜면 여기서 답한다).
export function PilgrimDialogue({
  npc,
  onClose,
  storyFlags,
  quests,
  completeQuest,
  adventureLog,
}: Props) {
  const revealed = storyFlags.has("pilgrim_revealed");
  const skyreachCleared = storyFlags.has("skyreach_main_cleared");
  const volcanoDefeated = storyFlags.has("volcano_heart_defeated");

  // ── 히든: 표식 릴레이 (후드 손님 → 순례자 → 후드 손님) ──
  if (storyFlags.has("cipher_started") && !storyFlags.has("cipher_shown_pilgrim")) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "그 표식. 후드를 쓴 자가 줬군. …그래, 같은 손이 그은 거다. 북쪽에서 온 자도, 호수 너머의 자도, 결국 한 매듭에서 풀려 나왔어.\n돌아가서 그렇게 전해라. '순례자도 같은 표식을 안다'고. 그러면 그가 너에게 한 겹 더 보여줄 거다."
        }
        primaryAction={{
          label: "고개를 끄덕인다",
          onClick: () => {
            storyFlags.set("cipher_shown_pilgrim");
            onClose();
          },
        }}
      />
    );
  }

  // ── 히든: 거인의 기원 (운향 메인 완료 + 운봉의 거인 5회 처치) ──
  if (storyFlags.has("unhyang_main_cleared") && (adventureLog.log.monsters["운봉의 거인"]?.kills ?? 0) >= 5) {
    const go = quests.getEntry(GIANTS_ORIGIN);
    if (go.state === "available") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={
            "거인을 다섯 번이나 잠재웠다고? …그렇다면 봤겠지, 그놈이 산의 숨을 먹고 일어서는 걸.\n거인이 어디서 왔는지 알고 싶나? 협곡 가장 깊은 곳, 돌풍 정령이 모이는 자리를 봐라. 예순쯤 흩어 놓으면 그 자리가 드러난다. 그 다음엔 내가 본 것을 말해주지."
          }
          primaryAction={{
            label: "받아들인다",
            onClick: () => {
              quests.accept(GIANTS_ORIGIN);
              onClose();
            },
          }}
        />
      );
    }
    if (go.state === "active") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={`돌풍 정령이 모이는 자리. 협곡 가장 깊은 곳이다. 흩어 놓아라. 진행 ${go.progress}/60`}
        />
      );
    }
    if (go.state === "ready") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={
            "그 자리를 봤군. …바람이 갈라진 틈, 그 아래. 거인은 거기서 올라온다. 산이 만든 게 아니야. 더 깊은 데서, 더 오래된 무언가가 산의 숨을 빌려 형태를 갖추는 거다.\n…이게 내가 본 전부야. 나머지는 너 스스로 보게 될 거다. 자, 받아라. 산을 너무 쉽게 떠나지 마라."
          }
          primaryAction={{
            label: "보상을 받는다",
            onClick: () => {
              if (completeQuest(GIANTS_ORIGIN)) onClose();
            },
          }}
        />
      );
    }
    // go.state === "completed" → 아래 일반 분기로.
  }

  // 폭로 이후 — 순례자는 더 이상 거기 없다. 자취만 남았다.
  if (revealed) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "순례자가 앉아 있던 자리는 비어 있다. 후드도, 잔도, 어느 손의 흔적도 없다.\n대장간 한 켠 모루에 짧게 새겨진 글자만 남았다. 옥좌가 너를 부른다."
        }
      />
    );
  }

  // 2차 해금 — 세 봉인 + 화산의 심장 + 천공 성지까지 끝낸 자에게, 순례자가 후드를 벗는다.
  if (skyreachCleared) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "세 봉인을 풀었다고 들었다. 해무도 그렇게 전했지.\n…잘했다. 정말 잘했어.\n\n너는 거인, 수심의 것, 성문지기, 노룡을 본래 자리로 돌려놓은 거다. 봉인이란 한 사람에게서 떼어낸 조각이었으니까.\n\n후드 손님과 내가 같은 표식을 가졌던 게 이상하지 않았나. 해무가 옛 이름 앞에서 잔을 떨어뜨린 게 이상하지 않았나. 우리는 한 사람의 조각이다. 너는 그 조각들을 하나씩 본체로 모아준 손이지.\n\n옥좌의 주재 께서 곧 깨어나신다. 네가 휘둘러온 검은, 처음부터 그분의 손이 쥐고 있던 거다.\n\n(순례자가 후드를 벗자, 그 안에 얼굴은 없었다. 빛만 있었다.)"
        }
        primaryAction={{
          label: "...뒤로 물러선다",
          onClick: () => {
            storyFlags.set("pilgrim_revealed");
            onClose();
          },
        }}
      />
    );
  }

  // 1차 해금 — 화산의 심장 처치 후. 천공 성지·해무를 가리킨다.
  if (volcanoDefeated) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "능선 너머의 불덩이를 잠재웠다고? …그렇다면 천공 성지가 열렸겠군.\n거기 원로 해무를 만나라. 그가 나보다 더 안다. 봉인의 일이라면, 끝까지 그를 도와라. 그게 북쪽 너머로 가는 첫 걸음이다."
        }
      />
    );
  }

  // 0 — 떡밥 들은 적 없는 초기. npcs.ts greeting + 짧은 잡담.
  return (
    <NpcDialogue
      npc={npc}
      onClose={onClose}
      text={
        "…북쪽에서 왔다. 그 너머는 아직 네가 알 시간이 아니야.\n춥나? 산정의 추위는 견딜 만한 거다. 진짜 추운 건 별이 끝나는 자리지. 가라. 산이 너를 부른다."
      }
    />
  );
}
