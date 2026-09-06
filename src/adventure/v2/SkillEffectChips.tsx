"use client";

import { SURFACE_INSET } from "@/components/ui/surfaces";
import { buildSkillCardModel } from "./skillCardModel";

function EffectTags({ texts }: { texts: readonly string[] }) {
  if (texts.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {texts.map((text, index) => (
        <span key={index} className="rounded-md bg-zinc-100 px-2 py-1 text-xs leading-relaxed text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          {text}
        </span>
      ))}
    </div>
  );
}

// 학습·장착 공통 요약. details가 있으므로 부모 버튼 밖에 배치한다.
export function SkillEffectChips({ skillId }: { skillId: string }) {
  const model = buildSkillCardModel(skillId);
  if (!model) return null;
  const hasDetails = model.details.length > 0 || model.pvp.length > 0 || model.synergy;
  return (
    <div className="mt-2 min-w-0 space-y-2 text-sm leading-relaxed">
      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {[model.kind, ...model.meta].join(" · ")}
      </p>
      <p className="break-words text-zinc-700 dark:text-zinc-200">
        {model.summary}
      </p>
      <EffectTags texts={model.resources} />
      <EffectTags texts={model.highlights} />
      {model.synergy && (
        <div className={`${SURFACE_INSET} space-y-1.5 p-2.5`}>
          <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
            {model.synergy.name}{" "}
            <span className="font-normal text-zinc-500 dark:text-zinc-400">· 일반 전투 기준</span>
          </p>
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            {model.synergy.condition}
          </p>
          <EffectTags texts={model.synergy.effects} />
        </div>
      )}
      {hasDetails && (
        <details className="group border-t border-zinc-200 pt-1 dark:border-zinc-700">
          <summary className="min-h-11 cursor-pointer content-center rounded-md py-2 text-xs font-medium text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:text-zinc-300">
            상세 계수·효과·PvP 보기
          </summary>
          <div className={`${SURFACE_INSET} space-y-2 p-2.5 text-xs text-zinc-700 dark:text-zinc-200`}>
            {model.details.length > 0 && (
              <ul className="space-y-1.5">
                {model.details.map((text, index) => <li key={index} className="break-words">{text}</li>)}
              </ul>
            )}
            {model.synergy && (
              <div>
                <p className="font-semibold">PvP {model.synergy.name}</p>
                <p className="mt-1">{model.synergy.pvp.join(" · ")}</p>
              </div>
            )}
            {model.pvp.length > 0 && (
              <div>
                <p className="font-semibold">PvP 차이</p>
                <ul className="mt-1 space-y-1.5">
                  {model.pvp.map((text, index) => <li key={index}>{text}</li>)}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
