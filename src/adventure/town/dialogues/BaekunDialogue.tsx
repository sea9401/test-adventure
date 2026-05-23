import type { Npc } from "@/adventure/data/npcs";
import { NpcDialogue } from "@/adventure/NpcDialogue";
import type { useQuests } from "@/adventure/quests/useQuests";
import type { useStoryFlags } from "@/adventure/storyFlags/useStoryFlags";
import type { useInventory } from "@/adventure/inventory/useInventory";

type Props = {
  npc: Npc;
  onClose: () => void;
  quests: ReturnType<typeof useQuests>;
  completeQuest: (id: string) => boolean;
  storyFlags: ReturnType<typeof useStoryFlags>;
  inventory: ReturnType<typeof useInventory>;
};

const CANYON = "unhyang-baekun-canyon-survey";
const GIANT = "unhyang-baekun-peak-giant";
const CLIFF = "unhyang-baekun-cliff-wolves";
const GOATS = "unhyang-baekun-highland-goats";
const ESCORT = "unhyang-baekun-pilgrim-escort";
const HUNTER = "peak-giant-hunter"; // 운봉의 거인 누적 ×10 (보스 사냥꾼 칭호 일부)
const HEAVEN = "unhyang-baekun-heaven-slay"; // 히든 — HUNTER 완료 후 노출. 봉황 깃털 ×5 → 천살 스킬북.
const HEAVEN_NEED = 5;
const STORM = "unhyang-baekun-storm-strike"; // 히든 — HEAVEN 완료 후 노출. 돌풍 정령 ×10 → 폭풍 일격.
const STORM_NEED = 10;

// 백운 — 운향 메인 라인 "잠들지 않는 산".
// A 협곡 정찰 → B 운봉의 거인 → C 교역로 정리(절벽 늑대 ×30 + 산양 ×40) → D 교역로 개통.
// 정기 토벌(`unhyang-peak-giant-recurring`)은 길드 게시판이 맡는다(거인 처치 후 노출).
export function BaekunDialogue({
  npc,
  onClose,
  quests,
  completeQuest,
  storyFlags,
  inventory,
}: Props) {
  // 운향 진입 조건 자체가 거인과 한 번 맞붙는 것(peak_giant_engaged)이라 보통은 켜져 있다.
  if (!storyFlags.has("peak_giant_engaged")) {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "산을 오르느라 고단했겠지.\n구름 위에서는 바람도, 시간도 다르게 흐른다네. 잠시 머물다 가게."
        }
      />
    );
  }

  const canyon = quests.getEntry(CANYON);
  const giant = quests.getEntry(GIANT);
  const cliff = quests.getEntry(CLIFF);
  const goats = quests.getEntry(GOATS);

  // ── A. 협곡 정찰 ──
  if (canyon.state === "available") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "…먼 길을 올라왔구먼. 그 이야기, 이제 들려주지.\n이 산정에는 옛부터 잠들지 않는 것이 살고 있다네. 그놈이 깨어나는 걸 막아야 해. 우선 협곡 사정부터 봐 주겠나? 무리장 늑대 셋이면 충분하네."
        }
        primaryAction={{
          label: "받아들인다",
          onClick: () => {
            quests.accept(CANYON);
            onClose();
          },
        }}
      />
    );
  }
  if (canyon.state === "active") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={`무리장이 무리를 어떻게 끌고 다니는지, 그걸 잘 봐 두게. 진행 ${canyon.progress}/3`}
      />
    );
  }
  if (canyon.state === "ready") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "협곡을 봤다면 알 게야. 그놈은 산의 숨을 먹고 자라.\n…고맙네. 자, 약속한 사례일세."
        }
        primaryAction={{
          label: "보상을 받는다",
          onClick: () => {
            if (completeQuest(CANYON)) onClose();
          },
        }}
      />
    );
  }

  // ── B. 운봉의 거인 ──
  if (giant.state === "available") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "이제 알겠네. 산 깊은 곳에 잠들지 않는 것이 버티는 한, 이 산정은 평온할 수 없어.\n운봉의 거인. 혼자선 어림없는 상대지. 동료를 모아 그놈을 잠재워 주게. 산정의 명운이 거기 달렸다네."
        }
        primaryAction={{
          label: "받아들인다",
          onClick: () => {
            quests.accept(GIANT);
            onClose();
          },
        }}
      />
    );
  }
  if (giant.state === "active") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "혼자 가지 말게. 그놈은 산의 숨을 먹고 일어선다네. 동료들과 함께라야 잠재울 수 있어."
        }
      />
    );
  }
  if (giant.state === "ready") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "산정이 다시 숨 쉬는구먼. …고맙네, 정말로.\n자, 받게. 거인의 심장을 운봉석으로 봉인해 둔 것일세. 자네 손에 어울려."
        }
        primaryAction={{
          label: "보상을 받는다",
          onClick: () => {
            if (completeQuest(GIANT)) onClose();
          },
        }}
      />
    );
  }

  // ── C. 교역로 정리 (거인 처치 후) ──
  if (cliff.state === "available") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "거인이 잠든 지금이 기회야. 디올라와 다시 거래를 트려면 길부터 안전해야 하니. 두 군데 손을 봐 주게.\n협곡 길의 절벽 늑대 서른, 산기슭 비탈의 산양 마흔. 둘 다 부탁함세."
        }
        primaryAction={{
          label: "받아들인다",
          onClick: () => {
            quests.accept(CLIFF);
            quests.accept(GOATS);
            onClose();
          },
        }}
      />
    );
  }
  if (cliff.state === "ready") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"협곡 길이 트였구먼. 짐꾼들이 한시름 놓겠어. 자, 사례일세."}
        primaryAction={{
          label: "보상을 받는다",
          onClick: () => {
            if (completeQuest(CLIFF)) onClose();
          },
        }}
      />
    );
  }
  if (goats.state === "ready") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={"비탈도 정리됐다고? 이제 짐수레가 산을 오를 수 있겠구먼. 받게."}
        primaryAction={{
          label: "보상을 받는다",
          onClick: () => {
            if (completeQuest(GOATS)) onClose();
          },
        }}
      />
    );
  }
  if (cliff.state === "active" || goats.state === "active") {
    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          `교역로 정리는 어떤가? 협곡 절벽 늑대 ${cliff.progress}/30, 산기슭 산양 ${goats.progress}/40`
        }
      />
    );
  }

  // ── D. 교역로 개통 (협곡·산기슭 둘 다 완료) ──
  // 거인 처치 후 풀리는 사이드 의뢰 "순례자의 길"(pilgrim-escort)도 여기서 함께 내준다.
  if (cliff.state === "completed" && goats.state === "completed") {
    const escort = quests.getEntry(ESCORT);
    if (escort.state === "available") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={
            "길이 열렸어. 디올라 촌장 마린에게 가 보게. 산정과 다시 거래를 트자고, 백운이 전하더라고 말일세.\n…아, 한 가지 더. 북쪽에서 온 순례자가 운저 평원을 지나 다시 떠난다네. 거기 떠돌이 약탈자 무리가 자리를 잡았다더군. 열다섯만 손봐 주겠나? 순례자가 무사히 지나가게."
          }
          primaryAction={{
            label: "받아들인다",
            onClick: () => {
              quests.accept(ESCORT);
              onClose();
            },
          }}
        />
      );
    }
    if (escort.state === "active") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={`운저 평원 약탈자들은 정리됐는가? 진행 ${escort.progress}/15`}
        />
      );
    }
    if (escort.state === "ready") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"순례자가 무사히 평원을 건넜다는 소식일세. 고맙네. 받게."}
          primaryAction={{
            label: "보상을 받는다",
            onClick: () => {
              if (completeQuest(ESCORT)) onClose();
            },
          }}
        />
      );
    }
    // 거인 누적 사냥 "사냥 기록" — 백운이 주는 개인 도전.
    const hunter = quests.getEntry(HUNTER);
    if (hunter.state === "available") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={
            "교역로가 열렸고, 순례자도 떠났어. 산정이 한동안은 조용하겠지.\n…한 가지 더. 거인을 열 번 잠재운 무리는 산정의 노래에 이름이 남는다네. 동료들과 함께 그 기록을 채워 보겠나? 정기 토벌은 길드 게시판에도 걸어 뒀으니, 거기 기록도 함께 쌓일 게야."
          }
          primaryAction={{
            label: "받아들인다",
            onClick: () => {
              quests.accept(HUNTER);
              onClose();
            },
          }}
        />
      );
    }
    if (hunter.state === "active") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={`거인을 몇 번이나 잠재웠는가? 산정의 노래는 천천히 쓰여도 좋아. 진행 ${hunter.progress}/10`}
        />
      );
    }
    if (hunter.state === "ready") {
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={"열 번이라… 자네 무리의 이름이 산정의 노래에 들어갔네. 자, 받게. 마땅한 사례일세."}
          primaryAction={{
            label: "보상을 받는다",
            onClick: () => {
              if (completeQuest(HUNTER)) onClose();
            },
          }}
        />
      );
    }

    // 히든 — 거인 10회 처치 완료 후 풀리는 검결 라인. 봉황 깃털 ×5 deliver → 천살 스킬북.
    if (hunter.state === "completed") {
      const heaven = quests.getEntry(HEAVEN);
      if (heaven.state === "available") {
        return (
          <NpcDialogue
            npc={npc}
            onClose={onClose}
            text={
              "…자네 이름이 산정의 노래에 새겨졌으니, 한 가지 더 일러두지.\n옛 산정엔 '천살'이라 불리던 검결이 있었네. 한 번 휘두르면 회피도, 갑주도 소용없는 결이지. 잔편 한 권이 내 손에 남아 있어. 봉황 깃털 다섯이면, 진짜 불을 머금은 깃이라야. 그 결을 새길 수 있네. 가져와 보겠나?"
            }
            primaryAction={{
              label: "받아들인다",
              onClick: () => {
                quests.accept(HEAVEN);
                onClose();
              },
            }}
          />
        );
      }
      if (heaven.state === "active") {
        const have = inventory.materialCount("phoenix_feather");
        if (have >= HEAVEN_NEED) {
          return (
            <NpcDialogue
              npc={npc}
              onClose={onClose}
              text={
                "다섯 장. 결이 살아 있군. 잔편의 결도 이걸로 깨어나겠어.\n자, 천살. 가져가게. 함부로 휘두르진 말고."
              }
              primaryAction={{
                label: "건네준다",
                onClick: () => {
                  const r = quests.tryDeliver(
                    HEAVEN,
                    inventory.materialCount,
                    inventory.consumeMaterial,
                  );
                  if (r.ok) {
                    completeQuest(HEAVEN);
                    onClose();
                  }
                },
              }}
            />
          );
        }
        return (
          <NpcDialogue
            npc={npc}
            onClose={onClose}
            text={`봉황 깃털은 봉황령 능선. 불꽃 독수리한테서 나오지. 진행 ${have}/${HEAVEN_NEED}`}
          />
        );
      }
      // 천살 잔편 완료 → 두 번째 히든. 폭풍 일격 (돌풍 정령 ×10).
      if (heaven.state === "completed") {
        const storm = quests.getEntry(STORM);
        if (storm.state === "available") {
          return (
            <NpcDialogue
              npc={npc}
              onClose={onClose}
              text={
                "…한 가지 더. 산정의 바람은 한 자루 결로 옮길 수 있다고들 했지. 돌풍 정령 열을 잠재워 보게. 그 결이 자네 검에 옮겨질 거야."
              }
              primaryAction={{
                label: "받아들인다",
                onClick: () => {
                  quests.accept(STORM);
                  onClose();
                },
              }}
            />
          );
        }
        if (storm.state === "active") {
          return (
            <NpcDialogue
              npc={npc}
              onClose={onClose}
              text={`돌풍 정령은 협곡 위 능선에 모여. 진행 ${storm.progress}/${STORM_NEED}`}
            />
          );
        }
        if (storm.state === "ready") {
          return (
            <NpcDialogue
              npc={npc}
              onClose={onClose}
              text={
                "열 마리. 산정이 한결 조용해졌어. 자네 검에 바람의 결이 옮겨졌네. 가져가게."
              }
              primaryAction={{
                label: "보상을 받는다",
                onClick: () => {
                  if (completeQuest(STORM)) onClose();
                },
              }}
            />
          );
        }
      }
    }

    // ── 5막 「빈 옥좌의 시대」 PR-B1 — 별빛 협곡 ────────────────────────────
    // Ch 26 「별이 떨어진 자리」 완료 후 협곡 안쪽으로 별빛이 떨어진다. 별빛 거인 잔영을
    // 협동으로 잠재울 때까지(starlit_giant_quelled) 우선 노출. 4막 산정 라인 모두 종료
    // 후의 fallback 자리에 끼워, 4막 히든 의뢰(escort/hunter/heaven/storm) 진행을 막지 않는다.
    if (storyFlags.has("starfall_warden_felled")) {
      if (!storyFlags.has("starlit_giant_quelled")) {
        return (
          <NpcDialogue
            npc={npc}
            onClose={onClose}
            text={
              "…자네, 마침 잘 왔네. 지미가 사람을 보냈더라고. 별빛이 광맥에 떨어졌단 얘기. 그놈만 그리된 게 아니더만.\n협곡이 다시 들썩이고 있네. 운봉의 거인을 잠재웠던 자리 깊은 곳에서, 잔영 하나가 두 발을 박아 넣고 있어. 별빛에 데워진 채로.\n혼자선 어림없네. 그때처럼 동료를 모아. 잔영을 한 번 더 잠재워 주게."
            }
            objective={{
              body: "별빛 협곡의 별빛 거인 잔영을 잠재우세요.\n지역 보스 도전 버튼으로 진입합니다.",
            }}
          />
        );
      }
      return (
        <NpcDialogue
          npc={npc}
          onClose={onClose}
          text={
            "잔영도 다시 잠들었구먼. 거인의 자리에서 떨어진 별빛 한 점이 자네 손에 거두어졌다 들었네.\n…한데 산정의 노수호자들이 그러더라고. 별이 세 자리에 떨어졌다고. 갯바람도 차가워졌고, 옛 성채 쪽에서 쇳소리도 들린다네. 자네, 다른 두 자리도 한 번씩 둘러봐 주게."
          }
        />
      );
    }

    return (
      <NpcDialogue
        npc={npc}
        onClose={onClose}
        text={
          "교역로가 열렸고, 순례자도 떠났어. 산정의 노래에 자네 이름도 남았고.\n…운봉의 거인은 잠재워도 산의 숨결을 먹고 다시 일어선다네. 길드 게시판에 정기 토벌을 걸어 뒀으니, 동료들과 가끔 산정을 살펴 주게."
        }
      />
    );
  }

  // 그 외(이론상 도달하지 않음) — 무난한 인사.
  return (
    <NpcDialogue
      npc={npc}
      onClose={onClose}
      text={"구름 위에서는 바람도, 시간도 다르게 흐른다네. 잠시 머물다 가게."}
    />
  );
}
