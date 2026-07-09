import { V2_LEVEL_CAP } from "@/adventure/data/v2/coreLoopConfig";
import {
  LEGACY_CLASS_SPEC_BY_JOB,
  TIER2_UNLOCK_CUMLEVEL,
  TIER3_UNLOCK_CUMLEVEL,
  TIER4_UNLOCK_CUMLEVEL,
  TIER5_UNLOCK_CUMLEVEL,
  V2_JOB_CATALOG,
  V2_JOB_LIST,
  type V2JobDefinition,
} from "@/adventure/data/v2/v2JobCatalog";
import { H2, P, UL, Em, Table, Note } from "./primitives";
import { JobRoadmapScroller } from "./JobRoadmapScroller";

export function JobsContent() {
  return (
    <>
      <H2>직군과 직업 사다리</H2>
      <P>
        직업은 <Em>전사·무도가·마법사·도적</Em>과 보조 루트인 <Em>생존자</Em>로 나뉩니다. 각 직군은{" "}
        <Em>견습 직업</Em>에서 출발해 <Em>전직</Em>을 거듭하며 더 강한 상위
        직업으로 갈래가 뻗어 나가요. 직군은 앵커 스탯을 중심으로 정체성을 가집니다.
      </P>
      <Table
        head={["직군", "앵커", "시작 직업"]}
        rows={[
          ["전사", "STR", "견습 병사"],
          ["무도가", "VIT", "견습 무인"],
          ["마법사", "INT", "견습 마법사"],
          ["도적", "DEX", "견습 도적"],
          ["생존자", "VIT", "생존자"],
        ]}
        caption="상위 직업(방패병·기사·마도사 등)의 계보는 모험의 서 → 직업 탭에서 볼 수 있어요."
      />
      <JobRoadmap />

      <H2>직업이 주는 것</H2>
      <UL>
        <li>
          <Em>직업 스탯 보너스</Em> — 전직해 있는 동안 그 직업의 주력 스탯에 고정
          보너스가 붙고, 상위 직업일수록 커집니다.
        </li>
        <li>
          <Em>직업 전용 스킬</Em> — 상위 직업일수록 더 강한 스킬을 배울 수 있어요
          (자세한 건 <Em>스킬</Em> 페이지).
        </li>
        <li>
          <Em>최상위 직업의 고유 특성</Em> — 사다리 정점의 직업들은 자기 정체성을
          극한까지 민 보상으로 고유한 특성을 가집니다. 예를 들어 검호·명궁은 한계를
          넘어선 속도를 공격력으로 바꾸고, 밤그림자는 스킬에도 치명타 한계 초과분을
          실어요.
        </li>
      </UL>
      <P>
        모든 직업의 <Em>레벨 상한은 {V2_LEVEL_CAP}</Em> 입니다. 시작 직업(견습)은
        자유롭게 고르고(무료), 상위 직업은 <Em>전직</Em>으로 올라갑니다.
      </P>

      <H2>전직</H2>
      <P>
        <Em>수행 화면</Em>(캐릭터 → 성장의 신전)의 직업 사다리에서 전직합니다.
        레벨 {V2_LEVEL_CAP} 에 도달하면 조건을 갖춘 상위 직업으로 전직할 수 있고,
        골드 비용은 없어요.
      </P>
      <P>
        상위 직업은 <Em>바로 아래 직업의 숙련도</Em>가 게이트를 넘으면 열립니다.
        계보가 깊어질수록 게이트가 높아져요(숙련도 {TIER2_UNLOCK_CUMLEVEL} →{" "}
        {TIER3_UNLOCK_CUMLEVEL} → {TIER4_UNLOCK_CUMLEVEL} →{" "}
        {TIER5_UNLOCK_CUMLEVEL}). 일부 상위 직업은 두 계보를 합친{" "}
        <Em>하이브리드</Em>라 양쪽을 모두 키워야 열립니다(예: 성기사 = 기사 + 사제).
      </P>
      <UL>
        <li>
          전직하면 <Em>레벨이 1 로</Em> 돌아가고 이번 직업 스탯도 하한부터 다시
          성장합니다. 단 <Em>숙달 포인트·직업 숙련도·스탯 한계·배운 스킬</Em>은
          그대로 유지돼요 — 레벨 리셋이 유일한 대가입니다.
        </li>
        <li>
          <Em>현재 직업으로 다시 전직</Em>(재전직)해 같은 직업을 계속 키우는 환생
          루프도 가능합니다.
        </li>
        <li>
          <Em>모험가</Em>는 시작 상태이자 기본 킷입니다. 언제든 돌아가
          강인함·수련을 배울 수 있지만, 직업 숙련도와 정복 보상은 쌓이지 않습니다.
        </li>
      </UL>
      <Note>
        레벨 {V2_LEVEL_CAP} 이 끝이 아니라, 전직을 거듭하며 직업군을 키우는 게 장기
        목표입니다. 직업 숙련도는 재전직에도 보존돼, 여러 직업을 두루 키울수록
        강해져요.
      </Note>

      <H2>숙련도와 숙달 포인트</H2>
      <UL>
        <li>
          사냥에서 승리할 때마다 <Em>숙달 포인트</Em>가 공용 잔액으로 쌓입니다
          (깊은 사냥터일수록 많이).
        </li>
        <li>
          숙달 포인트는 <Em>수행</Em>(스탯 한계 올리기)과 <Em>스킬 습득</Em>에
          씁니다.
        </li>
        <li>
          <Em>직업 숙련도</Em>는 실제 직업군으로 사냥에서 승리할 때마다 +1 씩
          쌓이고 전직해도 줄지 않아요 — 전직 게이트와 스탯 하한의 기준이 됩니다.
          모험가 상태에서는 직업 숙련도가 오르지 않습니다.
        </li>
      </UL>

      <H2>수행 (한계 올리기)</H2>
      <P>
        성장의 신전 <Em>수행</Em> 탭에서 숙달 포인트를 써 현재 직업군 주력 스탯의{" "}
        <Em>한계치</Em>를 올립니다(스탯 자체가 아니라 천장을 올리는 것). 직업군마다
        오르는 스탯이 다르고, 올릴수록 비용이 비싸져요. <Em>하이브리드</Em>(성기사·
        마검사)는 직군 대신 합쳐진 두 정체성에 맞는 스탯의 한계가 오릅니다.
      </P>
      <P>
        한계를 넓혀 두면 이후 레벨업이 그 천장까지 스탯을 채웁니다. 수행으로 넓히고
        레벨업으로 채우는 두 박자예요.
      </P>
    </>
  );
}

type RoadmapNode = {
  id: string;
  name: string;
  tier: V2JobDefinition["tier"] | "start";
  group: string;
  hybrid: boolean;
  prereqText: string;
  children: RoadmapNode[];
};

const JOB_ORDER = new Map(V2_JOB_LIST.map((job, index) => [job.id, index]));

function JobRoadmap() {
  const root = buildRoadmap();
  return (
    <section className="mt-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          간략 전직 로드맵
        </h3>
        <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
          {[
            ["warrior", "전사"],
            ["martial", "무도가"],
            ["mage", "마법사"],
            ["rogue", "도적"],
            ["survivor", "생존자"],
            ["hybrid", "하이브리드"],
          ].map(([key, label]) => (
            <span
              key={key}
              className={`manual-job-legend manual-job-${key}`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
      <JobRoadmapScroller>
        <ul className="manual-job-tree">
          <RoadmapBranch node={root} />
        </ul>
      </JobRoadmapScroller>
      <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        카드에는 이름과 순서만 표시합니다. 복합 표시는 여러 선행 직업 숙련도가 필요한
        하이브리드 전직입니다.
      </p>
      <style>{ROADMAP_CSS}</style>
    </section>
  );
}

function RoadmapBranch({ node }: { node: RoadmapNode }) {
  const tierLabel =
    node.tier === "start" ? "" : node.tier === 0 ? "루트" : `${node.tier}차`;
  return (
    <li>
      <div
        className={`manual-job-node manual-job-${node.group} ${
          node.hybrid ? "manual-job-hybrid" : ""
        }`}
        title={node.prereqText || undefined}
      >
        {tierLabel && <span className="manual-job-tier">{tierLabel}</span>}
        <span className="manual-job-name">{node.name}</span>
        {node.hybrid && <span className="manual-job-badge">복합</span>}
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <RoadmapBranch key={child.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

function buildRoadmap(): RoadmapNode {
  const childrenByParent = new Map<string, V2JobDefinition[]>();
  for (const job of V2_JOB_LIST) {
    const parent = primaryParentId(job);
    const children = childrenByParent.get(parent) ?? [];
    children.push(job);
    childrenByParent.set(parent, children);
  }

  const toNode = (job: V2JobDefinition): RoadmapNode => ({
    id: job.id,
    name: job.name,
    tier: job.tier,
    group: groupForJob(job),
    hybrid: Object.keys(job.unlock.prereqs).length > 1,
    prereqText: prereqText(job),
    children: sortedChildren(childrenByParent.get(job.id) ?? []).map(toNode),
  });

  return {
    id: "start",
    name: "시작",
    tier: "start",
    group: "root",
    hybrid: false,
    prereqText: "",
    children: sortedChildren(childrenByParent.get("start") ?? []).map(toNode),
  };
}

function primaryParentId(job: V2JobDefinition): string {
  if (job.id === "none" || job.id === "survivor") return "start";
  const [firstPrereq] = Object.keys(job.unlock.prereqs);
  if (firstPrereq) return firstPrereq;
  return "none";
}

function sortedChildren(children: V2JobDefinition[]): V2JobDefinition[] {
  return [...children].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return (JOB_ORDER.get(a.id) ?? 0) - (JOB_ORDER.get(b.id) ?? 0);
  });
}

function groupForJob(job: V2JobDefinition): string {
  if (job.id === "none") return "root";
  return LEGACY_CLASS_SPEC_BY_JOB[job.id]?.class ?? job.id;
}

function prereqText(job: V2JobDefinition): string {
  const entries = Object.entries(job.unlock.prereqs);
  if (entries.length === 0) return "";
  return entries
    .map(([id, level]) => `${V2_JOB_CATALOG[id]?.name ?? id} 숙련도 ${level}`)
    .join(", ");
}

const ROADMAP_CSS = `
.manual-job-roadmap-wrap{position:relative;max-width:100%}
.manual-job-roadmap-controls{position:absolute;right:10px;top:10px;z-index:2;display:flex;gap:6px}
.manual-job-roadmap-button{display:inline-flex;height:30px;width:30px;align-items:center;justify-content:center;border:1px solid rgba(248,250,252,.18);border-radius:7px;background:rgba(23,19,29,.86);color:#f8fafc;box-shadow:0 8px 18px rgba(0,0,0,.28);transition:background-color .15s ease,border-color .15s ease,transform .12s ease}
.manual-job-roadmap-button:hover{border-color:rgba(248,250,252,.34);background:rgba(40,33,52,.95)}
.manual-job-roadmap-button:active{transform:translateY(1px)}
.manual-job-roadmap{max-width:100%;overflow-x:auto;overflow-y:hidden;color:#f8fafc;background:#17131d;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:28px 28px;overscroll-behavior-x:contain;touch-action:pan-x pan-y;-webkit-overflow-scrolling:touch;cursor:grab}
.manual-job-roadmap.is-dragging{cursor:grabbing}
.manual-job-tree{display:flex;width:max-content;min-width:max(100%,1320px);justify-content:flex-start;margin:0;padding:34px 24px 0}
.manual-job-tree ul{position:relative;display:flex;justify-content:center;margin:0;padding:34px 0 0}
.manual-job-tree li{position:relative;display:flex;flex-direction:column;align-items:center;list-style:none;margin:0;padding:34px 8px 0}
.manual-job-tree li::before,.manual-job-tree li::after{content:"";position:absolute;top:0;right:50%;width:50%;height:34px;border-top:2px solid #5e526e}
.manual-job-tree li::after{right:auto;left:50%;border-left:2px solid #5e526e}
.manual-job-tree li:only-child::before,.manual-job-tree li:only-child::after{display:none}
.manual-job-tree li:only-child{padding-top:0}
.manual-job-tree li:first-child::before,.manual-job-tree li:last-child::after{border:0}
.manual-job-tree li:last-child::before{border-right:2px solid #5e526e;border-radius:0 8px 0 0}
.manual-job-tree li:first-child::after{border-radius:8px 0 0 0}
.manual-job-tree>li>ul::before,.manual-job-tree ul ul::before{content:"";position:absolute;top:0;left:50%;width:0;height:34px;border-left:2px solid #5e526e}
.manual-job-node{--accent:#d9b45a;position:relative;display:inline-flex;align-items:center;justify-content:center;gap:7px;min-width:102px;height:31px;padding:4px 12px 4px 9px;border:1px solid color-mix(in srgb,var(--accent) 74%,#ffffff 8%);border-left:5px solid var(--accent);border-radius:7px;background:#fffaf0;color:#211827;font-size:13px;font-weight:900;line-height:1;white-space:nowrap;box-shadow:0 9px 20px rgba(0,0,0,.28),inset 0 -2px 0 rgba(0,0,0,.08)}
.manual-job-tier{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:18px;padding:0 5px;border-radius:5px;background:color-mix(in srgb,var(--accent) 22%,#211827);color:#fff;font-size:9px;font-weight:900}
.manual-job-root{--accent:#f3c64b;background:#fff0a8;color:#2b2105}
.manual-job-warrior{--accent:#ff5f5f}
.manual-job-martial{--accent:#41d68a}
.manual-job-mage{--accent:#5aa8ff}
.manual-job-rogue{--accent:#c07cff}
.manual-job-survivor{--accent:#ff9c4a}
.manual-job-node.manual-job-hybrid{background:#fff2f6;border-color:#ff6b8b;color:#32111d}
.manual-job-node.manual-job-hybrid::after{content:"";position:absolute;inset:-5px;border:1px dashed #ff89a3;border-radius:8px;pointer-events:none}
.manual-job-badge{position:absolute;right:7px;top:-18px;display:inline-flex;align-items:center;justify-content:center;height:16px;padding:0 5px;border:1px solid #ff89a3;border-radius:5px;background:#3a1e2a;color:#ffd5df;font-size:9px;font-weight:900;box-shadow:0 7px 14px rgba(0,0,0,.25)}
.manual-job-legend{display:inline-flex;align-items:center;height:22px;border:1px solid color-mix(in srgb,var(--accent,#d9b45a) 70%,#ffffff 10%);border-left-width:4px;border-radius:6px;background:#211b2a;color:#f7f1ff;padding:0 7px}
.manual-job-legend.manual-job-hybrid{border-color:#ff6b8b;border-left-color:#ff6b8b;background:#3a1e2a;color:#ffd5df}
`;
