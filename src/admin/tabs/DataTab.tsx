"use client";

import { useState } from "react";
import { Button, TextInput } from "../ui/Field";
import { useAdmin } from "../AdminContext";
import { MONSTERS } from "@/adventure/data/monsters";
import { ITEMS } from "@/adventure/data/items";
import { POTIONS } from "@/adventure/data/potions";
import { MATERIALS } from "@/adventure/data/materials";
import { RECIPES } from "@/adventure/data/recipes";
import { QUESTS, questTargetSummary } from "@/adventure/data/quests";
import { NPCS } from "@/adventure/data/npcs";
import { WORLD_MAP, type EdgeRequirement } from "@/adventure/data/world";

function describeRequirement(req: EdgeRequirement | undefined): string {
  if (!req) return "—";
  if (req.kind === "bestiary") return `bestiary: ${req.regionId}`;
  if (req.kind === "trial")
    return `trial: ${req.battles}전 (${req.enemiesFrom})`;
  return "—";
}
import { getLevelTable } from "@/lib/leveling";
import { STAT_KEYS, STAT_LABELS, STAT_CONVERSIONS } from "@/adventure/data/stats";

type DataKey =
  | "monsters"
  | "items"
  | "potions"
  | "materials"
  | "recipes"
  | "quests"
  | "npcs"
  | "world"
  | "leveling"
  | "stats";

const DATA_TABS: { key: DataKey; label: string }[] = [
  { key: "monsters", label: "몬스터" },
  { key: "items", label: "아이템" },
  { key: "potions", label: "포션" },
  { key: "materials", label: "재료" },
  { key: "recipes", label: "레시피" },
  { key: "quests", label: "퀘스트" },
  { key: "npcs", label: "NPC" },
  { key: "world", label: "세계" },
  { key: "leveling", label: "레벨링" },
  { key: "stats", label: "스탯" },
];

export function DataTab() {
  const [active, setActive] = useState<DataKey>("monsters");
  const [query, setQuery] = useState("");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {DATA_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setActive(t.key);
              setQuery("");
            }}
            className={
              active === t.key
                ? "rounded-md border border-zinc-900 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <TextInput value={query} onChange={setQuery} placeholder="검색…" />
      </div>

      {active === "monsters" && <MonstersTable q={query} />}
      {active === "items" && <ItemsTable q={query} />}
      {active === "potions" && <PotionsTable q={query} />}
      {active === "materials" && <MaterialsTable q={query} />}
      {active === "recipes" && <RecipesTable q={query} />}
      {active === "quests" && <QuestsTable q={query} />}
      {active === "npcs" && <NpcsTable q={query} />}
      {active === "world" && <WorldTable />}
      {active === "leveling" && <LevelingTable />}
      {active === "stats" && <StatsTable />}
    </div>
  );
}

function CopyJsonButton({ data }: { data: unknown }) {
  const { showToast } = useAdmin();
  return (
    <Button
      onClick={() => {
        navigator.clipboard
          .writeText(JSON.stringify(data, null, 2))
          .then(() => showToast("JSON 복사됨"))
          .catch(() => showToast("복사 실패"));
      }}
    >
      JSON 복사
    </Button>
  );
}

function match(q: string, ...fields: string[]): boolean {
  if (!q.trim()) return true;
  const lower = q.toLowerCase();
  return fields.some((f) => f.toLowerCase().includes(lower));
}

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-100 dark:bg-zinc-900">
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="px-2 py-1 text-left text-xs font-semibold text-zinc-700 dark:text-zinc-300"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className="border-t border-zinc-200 dark:border-zinc-800"
            >
              {r.map((cell, j) => (
                <td key={j} className="px-2 py-1 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonstersTable({ q }: { q: string }) {
  const rows = Object.values(MONSTERS)
    .filter((m) => match(q, m.name, m.tags.join(",")))
    .map((m) => [
      m.name,
      m.tags.join(", "),
      m.hp,
      m.atk,
      m.def,
      m.spd,
      m.exp,
      m.drops
        ?.map((d) => {
          const id =
            d.kind === "material"
              ? d.materialId
              : d.kind === "equip"
                ? d.itemId
                : d.kind === "equip_one_of"
                  ? `equip one_of [${d.itemIds.join(",")}]`
                  : d.kind === "recipe"
                    ? `recipe ${d.recipeId}`
                    : d.kind === "recipe_one_of"
                      ? `recipe one_of [${d.recipeIds.join(",")}]`
                      : d.kind === "skill_book"
                        ? `book ${d.bookId}`
                        : `gold ${d.amount}`;
          return `${id}(${d.chance})`;
        })
        .join(", ") ?? "—",
    ]);
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <CopyJsonButton data={MONSTERS} />
      </div>
      <Table
        headers={["이름", "태그", "HP", "ATK", "DEF", "SPD", "EXP", "드랍"]}
        rows={rows}
      />
    </div>
  );
}

function ItemsTable({ q }: { q: string }) {
  const rows = (Object.entries(ITEMS) as [string, (typeof ITEMS)[keyof typeof ITEMS]][])
    .filter(([id, item]) => match(q, id, item.name, item.slot))
    .map(([id, item]) => [
      id,
      item.name,
      item.slot,
      item.bonus
        ? Object.entries(item.bonus)
            .map(([k, v]) => `${k}+${v}`)
            .join(" ")
        : "—",
      item.description ?? "",
    ]);
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <CopyJsonButton data={ITEMS} />
      </div>
      <Table
        headers={["id", "이름", "슬롯", "bonus", "설명"]}
        rows={rows}
      />
    </div>
  );
}

function PotionsTable({ q }: { q: string }) {
  const rows = Object.values(POTIONS)
    .filter((p) => match(q, p.id, p.name))
    .map((p) => [
      p.id,
      p.name,
      `${p.effect.kind} flat=${p.effect.flat ?? 0} pct=${p.effect.pct ?? 0}`,
      p.price,
      p.description,
    ]);
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <CopyJsonButton data={POTIONS} />
      </div>
      <Table headers={["id", "이름", "효과", "가격", "설명"]} rows={rows} />
    </div>
  );
}

function MaterialsTable({ q }: { q: string }) {
  const rows = Object.values(MATERIALS)
    .filter((m) => match(q, m.id, m.name))
    .map((m) => [m.id, m.name, m.price, m.inShop ? "✓" : "—", m.description]);
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <CopyJsonButton data={MATERIALS} />
      </div>
      <Table
        headers={["id", "이름", "가격", "상점", "설명"]}
        rows={rows}
      />
    </div>
  );
}

function RecipesTable({ q }: { q: string }) {
  const rows = RECIPES.filter((r) => match(q, r.id, r.name)).map((r) => [
    r.id,
    r.name,
    r.ingredients
      .map((i) =>
        i.kind === "material"
          ? `${i.materialId}×${i.count}`
          : `${i.itemId}×${i.count}`,
      )
      .join(", "),
    r.result.kind === "equipment"
      ? `장비 ${r.result.itemId}`
      : `포션 ${r.result.potionId}×${r.result.quantity}`,
    r.description,
  ]);
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <CopyJsonButton data={RECIPES} />
      </div>
      <Table
        headers={["id", "이름", "재료", "결과", "설명"]}
        rows={rows}
      />
    </div>
  );
}

function QuestsTable({ q }: { q: string }) {
  const rows = QUESTS.filter((Q) => match(q, Q.id, Q.title, Q.regionId)).map(
    (Q) => [
      Q.id,
      Q.regionId,
      Q.title,
      questTargetSummary(Q.target),
      [
        Q.reward.gold ? `${Q.reward.gold}G` : null,
        Q.reward.fame ? `${Q.reward.fame}명성` : null,
        Q.reward.exp ? `${Q.reward.exp}EXP` : null,
        Q.reward.potions?.length ? `포션×${Q.reward.potions.length}` : null,
        Q.reward.items?.length ? `아이템×${Q.reward.items.length}` : null,
        Q.reward.recipes?.length ? `레시피×${Q.reward.recipes.length}` : null,
      ]
        .filter(Boolean)
        .join(" "),
      Q.repeatable ? "✓" : "—",
      Q.giverNpcId ?? "",
    ],
  );
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <CopyJsonButton data={QUESTS} />
      </div>
      <Table
        headers={["id", "지역", "타이틀", "타겟", "보상", "반복", "NPC"]}
        rows={rows}
      />
    </div>
  );
}

function NpcsTable({ q }: { q: string }) {
  const rows = NPCS.filter((n) => match(q, n.id, n.name, n.region)).map((n) => [
    n.id,
    n.name,
    n.region,
    n.role,
    n.description,
  ]);
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <CopyJsonButton data={NPCS} />
      </div>
      <Table
        headers={["id", "이름", "지역", "역할", "설명"]}
        rows={rows}
      />
    </div>
  );
}

function WorldTable() {
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            지역
          </h3>
          <CopyJsonButton data={WORLD_MAP.regions} />
        </div>
        <Table
          headers={["id", "이름", "biome", "추천 Lv", "적", "태그"]}
          rows={WORLD_MAP.regions.map((r) => [
            r.id,
            r.name,
            r.biome,
            r.recommendedLevel ?? "—",
            r.enemies.join(", ") || "—",
            (r.tags ?? []).join(", ") || "—",
          ])}
        />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            엣지
          </h3>
          <CopyJsonButton data={WORLD_MAP.edges} />
        </div>
        <Table
          headers={["from", "to", "조건"]}
          rows={WORLD_MAP.edges.map((e) => [
            e.from,
            e.to,
            describeRequirement(e.requires),
          ])}
        />
      </div>
    </div>
  );
}

function LevelingTable() {
  const rows = getLevelTable().map((r) => [r.level, r.required, r.cumulative]);
  return (
    <div className="space-y-2">
      <Table
        headers={["Lv", "다음까지 EXP", "누적 EXP"]}
        rows={rows}
      />
    </div>
  );
}

function StatsTable() {
  const rows = STAT_KEYS.map((k) => [
    k,
    STAT_LABELS[k],
    STAT_CONVERSIONS[k],
  ]);
  return <Table headers={["key", "라벨", "환산"]} rows={rows} />;
}
