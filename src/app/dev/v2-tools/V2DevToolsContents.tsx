"use client";

import { useState, type ReactNode } from "react";
import {
  V2_MATERIALS,
  type V2MaterialId,
} from "@/adventure/data/v2/dungeonDrops";
import {
  V2_EQUIPMENT,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";

// ⚠️ DEV 전용 지급 도구 UI. /api/v2/dev/grant + /api/v2/dev/grant-equipment 호출.
// 로그인된 본인 캐릭터의 character.v2 / training.v2 / inventory.v2 / equipment.v2 갱신.
// 게임 탭(/dev/v2-game)을 옆에 띄워두고 여기서 지급 → 게임 탭 새로고침해 확인.
//
// 지울 땐 이 폴더 + src/app/api/v2/dev/grant 만 지우면 됨 (게임 코드 의존 0).

type Msg = { ok: boolean; text: string } | null;

const MATERIAL_IDS = Object.keys(V2_MATERIALS) as V2MaterialId[];
const EQUIPMENT_IDS = Object.keys(V2_EQUIPMENT) as V2EquipmentId[];

export function V2DevToolsContents() {
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  const [exp, setExp] = useState("10000");
  const [level, setLevel] = useState("");
  const [gold, setGold] = useState("100000");
  const [hpCharges, setHpCharges] = useState("1000");
  const [mpCharges, setMpCharges] = useState("1000");
  const [matId, setMatId] = useState<V2MaterialId>(MATERIAL_IDS[0]);
  const [matQty, setMatQty] = useState("10");
  const [equipId, setEquipId] = useState<V2EquipmentId>(EQUIPMENT_IDS[0]);

  async function post(url: string, payload: unknown, label: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await res.json().catch(() => null)) as
        | Record<string, unknown>
        | null;
      if (!res.ok || !j || j.ok !== true) {
        setMsg({
          ok: false,
          text: `✗ ${label} 실패: ${(j?.error as string) ?? `http ${res.status}`}`,
        });
        return;
      }
      setMsg({ ok: true, text: `✓ ${label} 완료` });
    } catch (e) {
      setMsg({ ok: false, text: `✗ ${label}: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  const num = (s: string) => {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };

  return (
    <main className="mx-auto max-w-[640px] space-y-5 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <h1 className="text-lg font-bold">v2 지급 도구 (DEV)</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          로그인된 본인 캐릭터에 즉시 지급한다. 게임 탭을 옆에 띄워두고 지급 후
          새로고침해 확인하면 된다. 운영(prod)에는 노출되지 않는다.
        </p>
      </header>

      {msg && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            msg.ok
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
          }`}
        >
          {msg.text}
        </div>
      )}

      <Section title="기본 자원">
        <Row label="EXP">
          <NumInput value={exp} onChange={setExp} />
          <Btn
            disabled={busy}
            onClick={() =>
              post("/api/v2/dev/grant", { exp: num(exp) }, "EXP 부여")
            }
          >
            부여
          </Btn>
        </Row>
        <Row label="레벨 지정">
          <NumInput value={level} onChange={setLevel} placeholder="예: 50" />
          <Btn
            disabled={busy || !level}
            onClick={() =>
              post("/api/v2/dev/grant", { setLevel: num(level) }, "레벨 지정")
            }
          >
            적용
          </Btn>
        </Row>
        <Row label="골드">
          <NumInput value={gold} onChange={setGold} />
          <Btn
            disabled={busy}
            onClick={() =>
              post("/api/v2/dev/grant", { gold: num(gold) }, "골드 부여")
            }
          >
            부여
          </Btn>
        </Row>
      </Section>

      <Section title="충전약">
        <Row label="HP 충전약">
          <NumInput value={hpCharges} onChange={setHpCharges} />
          <Btn
            disabled={busy}
            onClick={() =>
              post(
                "/api/v2/dev/grant",
                { hpCharges: num(hpCharges) },
                "HP 충전약 부여",
              )
            }
          >
            부여
          </Btn>
        </Row>
        <Row label="MP 충전약">
          <NumInput value={mpCharges} onChange={setMpCharges} />
          <Btn
            disabled={busy}
            onClick={() =>
              post(
                "/api/v2/dev/grant",
                { mpCharges: num(mpCharges) },
                "MP 충전약 부여",
              )
            }
          >
            부여
          </Btn>
        </Row>
      </Section>

      <Section title="재료">
        <Row label="재료">
          <Select
            value={matId}
            onChange={(v) => setMatId(v as V2MaterialId)}
            options={MATERIAL_IDS.map((id) => ({
              value: id,
              label: V2_MATERIALS[id].name,
            }))}
          />
          <NumInput value={matQty} onChange={setMatQty} />
          <Btn
            disabled={busy}
            onClick={() =>
              post(
                "/api/v2/dev/grant",
                { materials: { [matId]: num(matQty) } },
                "재료 부여",
              )
            }
          >
            부여
          </Btn>
        </Row>
      </Section>

      <Section title="장비">
        <Row label="장비">
          <Select
            value={equipId}
            onChange={(v) => setEquipId(v as V2EquipmentId)}
            options={EQUIPMENT_IDS.map((id) => ({
              value: id,
              label: `${V2_EQUIPMENT[id].name} (T${V2_EQUIPMENT[id].tier})`,
            }))}
          />
          <Btn
            disabled={busy}
            onClick={() =>
              post(
                "/api/v2/dev/grant-equipment",
                { equipmentId: equipId },
                "장비 지급",
              )
            }
          >
            지급
          </Btn>
        </Row>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          보유 목록에 추가된다. 장착은 게임 탭의 장비 화면에서.
        </p>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-sm text-zinc-600 dark:text-zinc-400">
        {label}
      </span>
      {children}
    </div>
  );
}

function NumInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-32 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm tabular-nums outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950"
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Btn({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 rounded-md border border-indigo-400 bg-indigo-500/10 px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-500 dark:text-indigo-300"
    >
      {children}
    </button>
  );
}
