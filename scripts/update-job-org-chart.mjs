// Generate the standalone v2 job organization chart HTML.
// Usage: node --import tsx scripts/update-job-org-chart.mjs [output.html]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LEGACY_CLASS_SPEC_BY_JOB,
  V2_JOB_CATALOG,
  V2_JOB_LIST,
} from "../src/adventure/data/v2/v2JobCatalog.ts";
import { V2_SKILLS_BY_JOB } from "../src/adventure/data/v2/v2SkillsByJob.ts";
import { V2_COMMON_SKILLS } from "../src/adventure/data/v2/v2SkillsCommonCatalog.ts";
import { describeV2Skill, spCostOf } from "../src/adventure/data/v2/v2Skills.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = "/mnt/c/Users/sea94/OneDrive/바탕 화면/job-org-chart.html";
const outPath = process.argv[2] ?? DEFAULT_OUT;

const STAT_LABEL = {
  str: "STR",
  dex: "DEX",
  vit: "VIT",
  spd: "SPD",
  luk: "LUK",
  int: "INT",
  spi: "SPI",
};

const GROUP_LABEL = {
  warrior: "병사 계열",
  martial: "무인 계열",
  mage: "마법 계열",
  rogue: "도적 계열",
  survivor: "생존자 계열",
};

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function groupOf(jobId) {
  if (jobId === "__start" || jobId === "none") return "root";
  return LEGACY_CLASS_SPEC_BY_JOB[jobId]?.class ?? jobId;
}

function groupClass(jobId) {
  return `g-${groupOf(jobId)}`;
}

function focus(job) {
  return Object.entries(job.cultivateProfile)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([k]) => STAT_LABEL[k] ?? k.toUpperCase())
    .join("/");
}

function prerequisiteJobIds(job) {
  const ids = Object.keys(job.unlock.prereqs ?? {});
  for (const condition of job.unlock.extraConditions ?? []) {
    if (condition.type === "jobUnlocked" && !ids.includes(condition.jobId)) {
      ids.push(condition.jobId);
    }
  }
  return ids;
}

function extraConditionText(condition) {
  switch (condition.type) {
    case "jobUnlocked":
      return `${V2_JOB_CATALOG[condition.jobId]?.name ?? condition.jobId} 해금`;
    case "farmingLevel":
      return `농사 Lv.${condition.min}`;
    case "woodcuttingLevel":
      return `벌목 Lv.${condition.min}`;
    case "statThreshold":
      return `${STAT_LABEL[condition.stat] ?? condition.stat.toUpperCase()} 한계 ${condition.min}`;
    case "questCompleted":
      return `퀘스트 ${condition.questId} 완료`;
    case "monsterKilled":
      return `${condition.monsterId} ${condition.minCount}회 처치`;
  }
}

function unlockText(job) {
  if (job.id === "__start") return "🔓 시작점";
  if (job.id === "none") return "🔓 기본 루트 · 착용형 패시브 2종";
  if (job.id === "survivor") return "🔓 베이스 루트 · HP/회복";
  const entries = Object.entries(job.unlock.prereqs ?? {});
  const parts = [
    ...entries.map(([id, n]) => `${V2_JOB_CATALOG[id]?.name ?? id} 숙련도 ${n}`),
    ...(job.unlock.extraConditions ?? []).map(extraConditionText),
  ];
  if (parts.length === 0) return "🔓 시작 직업";
  const hybrid = prerequisiteJobIds(job).length > 1 ? ' <span class="hyb">하이브리드</span>' : "";
  return `🔒 ${parts.join(", ")}${hybrid}`;
}

function tierText(job) {
  if (job.id === "__start") return "";
  if (job.tier === 0) return "루트";
  return `${job.tier}차`;
}

function skillChip(skillId) {
  const s = V2_COMMON_SKILLS[skillId];
  if (!s) return "";
  const passive = s.category === "passive";
  const cls = passive ? "sk-p" : "sk-a";
  const suffix = passive ? " ·패" : "";
  return `<span class="sk ${cls}" data-sid="${esc(skillId)}">${esc(s.name)}${suffix}</span>`;
}

function card(job) {
  const isHybrid = prerequisiteJobIds(job).length > 1;
  const skills = (V2_SKILLS_BY_JOB[job.id] ?? []).map(skillChip).join("");
  const t = tierText(job);
  const focusText = job.id === "__start" ? "" : focus(job);
  const cls = [
    "card",
    groupClass(job.id),
    isHybrid ? "is-hyb" : "",
  ].filter(Boolean).join(" ");
  return `<div class="${cls}">` +
    (t ? `<div class="t">${esc(t)}</div>` : "") +
    `<div class="nm">${esc(job.name)}</div>` +
    `<div class="id">${esc(job.id === "__start" ? "job-root" : job.id)}</div>` +
    `<div class="unlock">${unlockText(job)}</div>` +
    (focusText ? `<div class="focus">${esc(focusText)}</div>` : "") +
    (skills ? `<div class="skills">${skills}</div>` : "") +
    `</div>`;
}

function buildTree() {
  const virtualRoot = {
    id: "__start",
    name: "시작",
    tier: 0,
    cultivateProfile: {},
    jobBonus: {},
    unlock: { prereqs: {} },
  };
  const children = new Map();
  children.set("__start", ["none", "survivor"]);
  for (const job of V2_JOB_LIST) children.set(job.id, []);

  const addChild = (parent, child) => {
    if (!children.has(parent)) children.set(parent, []);
    if (!children.get(parent).includes(child)) children.get(parent).push(child);
  };

  for (const job of V2_JOB_LIST) {
    if (job.id === "none" || job.id === "survivor") continue;
    const prereqs = prerequisiteJobIds(job);
    if (job.tier === 1 && prereqs.length === 0) {
      addChild("none", job.id);
      continue;
    }
    if (prereqs.length > 0) addChild(prereqs[0], job.id);
  }

  return { virtualRoot, children };
}

function renderNode(job, children) {
  const ids = children.get(job.id) ?? [];
  const kids = ids.map((id) => renderNode(V2_JOB_CATALOG[id], children)).join("");
  return `<li>${card(job)}${kids ? `<ul>${kids}</ul>` : ""}</li>`;
}

function catLabel(cat) {
  return {
    attack: "액티브",
    heal: "회복",
    buff: "버프",
    debuff: "디버프",
    passive: "패시브",
  }[cat] ?? cat;
}

function skillTip(def) {
  const tag = def.category === "passive" ? "tk-p" : "tk-a";
  const lines = [`필요 SP ${spCostOf(def)}`, ...describeV2Skill(def)];
  return `<b>${esc(def.name)}</b> <span class="tk ${tag}">${catLabel(def.category)}</span>` +
    `<ul>${lines.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>` +
    `<div class="td">${esc(def.description)}</div>`;
}

const tips = {};
for (const [id, def] of Object.entries(V2_COMMON_SKILLS)) tips[id] = skillTip(def);

const { virtualRoot, children } = buildTree();
const chart = renderNode(virtualRoot, children);
const total = V2_JOB_LIST.length;

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>직업 전직 조직도 (v2)</title><style>
:root{font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif}
body{margin:0;background:#f4f5f7;color:#18181b;padding:24px}
h1{font-size:20px;margin:0 0 4px}.sub{color:#71717a;font-size:13px;margin:0 0 12px}
.legend{margin:0 0 18px;display:flex;gap:8px;flex-wrap:wrap}.lg{font-size:12px;padding:3px 10px;border-radius:999px;color:#fff;font-weight:600}.lg-hyb{background:#0d9488}
.scroll{overflow-x:auto;padding-bottom:20px}.chart{display:inline-flex;min-width:100%;justify-content:center}
.chart ul{position:relative;padding:22px 0 0;display:flex;justify-content:center;margin:0}
.chart li{list-style:none;position:relative;padding:22px 7px 0;display:flex;flex-direction:column;align-items:center}
.chart li::before,.chart li::after{content:'';position:absolute;top:0;right:50%;border-top:2px solid #cbd5e1;width:50%;height:22px}
.chart li::after{right:auto;left:50%;border-left:2px solid #cbd5e1}
.chart li:only-child::before,.chart li:only-child::after{display:none}.chart li:only-child{padding-top:0}
.chart li:first-child::before,.chart li:last-child::after{border:0 none}
.chart li:last-child::before{border-right:2px solid #cbd5e1;border-radius:0 6px 0 0}.chart li:first-child::after{border-radius:6px 0 0 0}
.chart>li>ul::before,.chart ul ul::before{content:'';position:absolute;top:0;left:50%;border-left:2px solid #cbd5e1;width:0;height:22px}
.card{display:inline-block;border:1px solid #e4e4e7;border-top-width:4px;border-radius:8px;background:#fff;padding:7px 10px;min-width:128px;box-shadow:0 1px 2px rgba(0,0,0,.06);text-align:center}
.card.is-hyb{border:2px dashed #0d9488;border-top-width:4px;border-top-color:#0d9488}
.card .t{font-size:10px;color:#a1a1aa;font-weight:700}.card .nm{font-size:15px;font-weight:700;margin-top:1px}
.card .id{font-size:10px;color:#a1a1aa;font-family:ui-monospace,monospace}
.card .unlock{font-size:10px;color:#3f3f46;margin-top:3px;background:#f4f4f5;border-radius:4px;padding:1px 4px}
.hyb{background:#0d9488;color:#fff;border-radius:3px;padding:0 4px;font-size:9px;margin-left:2px}
.card .focus{font-size:11px;color:#52525b;margin-top:3px;font-weight:600}
.skills{margin-top:5px;display:flex;gap:3px;flex-wrap:wrap;justify-content:center}
.sk{font-size:10px;padding:1px 6px;border-radius:4px;cursor:help}.sk-a{background:#eef2ff;color:#4338ca}.sk-p{background:#f4f4f5;color:#71717a}
.g-root{border-top-color:#a1a1aa}.g-warrior{border-top-color:#dc2626}.lg.g-warrior{background:#dc2626}
.g-martial{border-top-color:#16a34a}.lg.g-martial{background:#16a34a}.g-mage{border-top-color:#2563eb}.lg.g-mage{background:#2563eb}
.g-rogue{border-top-color:#9333ea}.lg.g-rogue{background:#9333ea}.g-survivor{border-top-color:#ea580c}.lg.g-survivor{background:#ea580c}
#tip{position:fixed;display:none;z-index:50;max-width:280px;background:#18181b;color:#fafafa;padding:8px 10px;border-radius:8px;font-size:11px;line-height:1.5;box-shadow:0 6px 18px rgba(0,0,0,.35);pointer-events:none}
#tip b{font-size:13px}#tip .tk{font-size:9px;padding:1px 5px;border-radius:4px;vertical-align:middle}
#tip .tk-a{background:#4338ca}#tip .tk-p{background:#3f3f46}#tip .tm{color:#a1a1aa;margin-top:2px}
#tip ul{margin:5px 0 0;padding-left:15px}#tip li{margin:1px 0}#tip .td{margin-top:6px;color:#a1a1aa;font-style:italic;border-top:1px solid #3f3f46;padding-top:5px}
.theme-toggle{position:fixed;top:14px;right:14px;z-index:60;border:1px solid #d4d4d8;background:#fff;color:#18181b;border-radius:999px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.08)}
body.dark{background:#0f1115;color:#e4e4e7}
body.dark .sub{color:#9aa0aa}
body.dark .chart li::before,body.dark .chart li::after,body.dark .chart li:last-child::before,body.dark .chart>li>ul::before,body.dark .chart ul ul::before{border-color:#3f3f46}
body.dark .card{background:#1b1d23;border-color:#3a3a42;box-shadow:0 1px 2px rgba(0,0,0,.4)}
body.dark .card.is-hyb{border-color:#14b8a6}
body.dark .card .t,body.dark .card .id{color:#8b8b94}
body.dark .card .unlock{color:#d4d4d8;background:#27272a}
body.dark .card .focus{color:#a1a1aa}
body.dark .sk-a{background:#312e81;color:#c7d2fe}
body.dark .sk-p{background:#27272a;color:#a1a1aa}
body.dark .theme-toggle{background:#1f1f23;color:#e4e4e7;border-color:#3f3f46}
</style></head><body>
<button type="button" class="theme-toggle" id="themeToggle" aria-label="테마 전환">🌙 다크</button>
<h1>직업 전직 조직도 — v2</h1>
<p class="sub">총 ${total}개 직업 · 모험가/생존자 루트와 1~6차 전직. 🔒=해금 조건(숙련도). <b>하이브리드</b>(점선 카드)=조건 2개 직업. 스킬 칩 <b>마우스 오버</b>=필요 SP·효과·수치·마나 소모량·발동 확률.</p>
<div class="legend">${Object.entries(GROUP_LABEL).map(([k, v]) => `<span class="lg g-${k}">${v}</span>`).join("")}<span class="lg lg-hyb">하이브리드(조건 2개)</span></div>
<div class="scroll"><ul class="chart">${chart}</ul></div>
<div id="tip"></div>
<script>
const TIPS=${JSON.stringify(tips)};
const tip=document.getElementById('tip');
function place(e){let x=e.clientX+14,y=e.clientY+14;if(x+290>innerWidth)x=e.clientX-290;if(y+190>innerHeight)y=e.clientY-190;tip.style.left=x+'px';tip.style.top=y+'px';}
document.querySelectorAll('.sk').forEach(el=>{el.addEventListener('mouseenter',e=>{const h=TIPS[el.dataset.sid];if(!h)return;tip.innerHTML=h;tip.style.display='block';place(e);});el.addEventListener('mousemove',place);el.addEventListener('mouseleave',()=>{tip.style.display='none';});});
(function(){var KEY='jobchart-theme';var btn=document.getElementById('themeToggle');function apply(d){document.body.classList.toggle('dark',d);btn.textContent=d?'☀️ 라이트':'🌙 다크';}var saved=null;try{saved=localStorage.getItem(KEY);}catch(e){}var initDark=saved?saved==='dark':(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);apply(!!initDark);btn.addEventListener('click',function(){var d=!document.body.classList.contains('dark');apply(d);try{localStorage.setItem(KEY,d?'dark':'light');}catch(e){}});})();
</script></body></html>`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, "utf8");
console.log(`updated ${outPath}`);
console.log(`jobs=${total}, tips=${Object.keys(tips).length}, script=${path.relative(process.cwd(), path.join(__dirname, "update-job-org-chart.mjs"))}`);
