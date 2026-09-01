import Link from "next/link";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import type {
  JobManualEntry,
  JobManualRelation,
  JobManualStatValue,
  JobManualVariant,
} from "../../jobManualModel";

function tierLabel(tier: number): string {
  return tier === 0 ? "루트" : `${tier}차`;
}

function RelationCard({
  title,
  emptyText,
  relations,
}: {
  title: string;
  emptyText: string;
  relations: JobManualRelation[];
}) {
  return (
    <section className={`${SURFACE_CARD} p-4`}>
      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{title}</h3>
      {relations.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {relations.map((relation) => (
            <li key={relation.id}>
              <Link
                href={`/manual/jobs/${relation.id}`}
                className={`${SURFACE_INSET} flex items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-zinc-800 hover:border-amber-500 dark:text-zinc-200`}
              >
                <span>{relation.name}</span>
                <span className="shrink-0 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                  {relation.requiredMastery == null
                    ? "전직 필요"
                    : `숙련도 ${relation.requiredMastery.toLocaleString("ko-KR")}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">{emptyText}</p>
      )}
    </section>
  );
}

function StatCard({
  title,
  emptyText,
  values,
  suffix,
}: {
  title: string;
  emptyText: string;
  values: JobManualStatValue[];
  suffix: string;
}) {
  return (
    <section className={`${SURFACE_CARD} p-4`}>
      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{title}</h3>
      {values.length > 0 ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {values.map((value) => (
            <div key={value.stat} className={`${SURFACE_INSET} px-3 py-2`}>
              <dt className="text-xs text-zinc-500 dark:text-zinc-400">{value.label}</dt>
              <dd className="mt-1 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                +{value.value} {suffix}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">{emptyText}</p>
      )}
    </section>
  );
}

function EffectList({ lines }: { lines: string[] }) {
  return (
    <ul className="space-y-1.5 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
      {lines.map((line, index) => (
        <li key={`${index}-${line}`} className="break-words">
          {line}
        </li>
      ))}
    </ul>
  );
}

function VariantRequirements({ variant }: { variant: JobManualVariant }) {
  return (
    <dl className="mb-3 grid gap-2 text-xs sm:grid-cols-2">
      <div>
        <dt className="font-semibold text-zinc-500 dark:text-zinc-400">
          필요 보유 스킬
        </dt>
        <dd className="mt-1 break-words text-zinc-800 dark:text-zinc-200">
          {variant.requiredLearnedSkillNames.join(" · ") || "없음"}
        </dd>
      </div>
      <div>
        <dt className="font-semibold text-zinc-500 dark:text-zinc-400">
          필요 장착 스킬
        </dt>
        <dd className="mt-1 break-words text-zinc-800 dark:text-zinc-200">
          {variant.requiredEquippedSkillNames.join(" · ") || "없음"}
        </dd>
      </div>
    </dl>
  );
}

export function JobManualContent({ entry }: { entry: JobManualEntry }) {
  return (
    <div>
      <Link
        href="/manual/jobs"
        className="inline-flex rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:border-amber-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
      >
        ← 전체 직업 도감
      </Link>

      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {tierLabel(entry.tier)}
        </span>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          {entry.classification.kindLabel}
        </span>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          {entry.classification.lineLabel}
        </span>
      </div>

      <section className={`${SURFACE_ACCENT} mt-5 p-4`}>
        <h2 className="text-sm font-bold text-amber-950 dark:text-amber-100">
          전직 조건
        </h2>
        <p className="mt-2 break-words text-sm leading-6 text-amber-950 dark:text-amber-100">
          {entry.unlockText}
        </p>
        {entry.additionalUnlockConditions.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-amber-950 dark:text-amber-100">
            {entry.additionalUnlockConditions.map((condition) => (
              <li key={condition}>추가 조건: {condition}</li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <RelationCard
          title="선행 필수 직업"
          emptyText="선행 직업 없음"
          relations={entry.prerequisites}
        />
        <RelationCard
          title="후행 가능 직업"
          emptyText="후행 직업 없음"
          relations={entry.nextJobs}
        />
      </div>

      <h2 className="mt-10 text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
        직업 성장
      </h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <StatCard
          title="직업 스탯 보너스"
          emptyText="고정 직업 보너스 없음"
          values={entry.jobBonuses}
          suffix=""
        />
        <StatCard
          title="수행 성장 프로필"
          emptyText="수행 성장치 없음"
          values={entry.cultivation}
          suffix="/회"
        />
      </div>

      <h2 className="mt-10 text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
        전체 스킬
      </h2>
      <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
        기본 효과와 발동 정보는 항상 표시하며, 주문식 변형과 장착 시너지는 펼쳐서
        확인할 수 있습니다.
      </p>
      <div className="mt-4 space-y-4">
        {entry.skills.map((skill) => (
          <article key={skill.id} className={`${SURFACE_CARD} p-4 sm:p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  {skill.name}
                </h3>
                <p className="mt-1 break-words text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  {skill.description}
                </p>
              </div>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                {skill.categoryLabel}
              </span>
            </div>

            <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
              <div className="flex gap-1"><dt>등급</dt><dd>{skill.tier}</dd></div>
              <div className="flex gap-1"><dt>주 능력치</dt><dd>{skill.statLabel}</dd></div>
              <div className="flex gap-1"><dt>SP</dt><dd>{skill.spCost}</dd></div>
              <div className="flex gap-1"><dt>학습 비용</dt><dd>{skill.learnCost.toLocaleString("ko-KR")}</dd></div>
              {skill.procChance != null && (
                <div className="flex gap-1"><dt>발동</dt><dd>{skill.procChance}%</dd></div>
              )}
              {skill.mpCost > 0 && (
                <div className="flex gap-1"><dt>MP</dt><dd>{skill.mpCost}</dd></div>
              )}
              {skill.cooldown > 0 && (
                <div className="flex gap-1"><dt>재사용</dt><dd>{skill.cooldown}행동</dd></div>
              )}
            </dl>

            <div className={`${SURFACE_INSET} mt-4 p-3`}>
              <h4 className="mb-2 text-xs font-bold text-zinc-800 dark:text-zinc-200">
                효과와 발동 규칙
              </h4>
              <EffectList lines={skill.effectLines} />
            </div>

            {skill.variants.length > 0 && (
              <div className="mt-4 space-y-2">
                <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  주문식 변형 {skill.variants.length}종
                </h4>
                {skill.variants.map((variant) => (
                  <details key={variant.name} className={`${SURFACE_INSET} p-3`}>
                    <summary className="cursor-pointer text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {variant.name}
                    </summary>
                    <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                      <VariantRequirements variant={variant} />
                      <EffectList lines={variant.effectLines} />
                    </div>
                  </details>
                ))}
              </div>
            )}

            {skill.synergies.length > 0 && (
              <div className="mt-4 space-y-2">
                <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  장착 시너지 {skill.synergies.length}종
                </h4>
                {skill.synergies.map((synergy, index) => (
                  <details
                    key={`${index}-${synergy.requiredSkillIds.join("-")}`}
                    className={`${SURFACE_INSET} p-3`}
                  >
                    <summary className="cursor-pointer text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {synergy.requiredSkillNames.join(" + ")} 장착 시너지
                    </summary>
                    <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                      <dl className="mb-3 text-xs">
                        <dt className="font-semibold text-zinc-500 dark:text-zinc-400">
                          필요 장착 스킬
                        </dt>
                        <dd className="mt-1 break-words text-zinc-800 dark:text-zinc-200">
                          {synergy.requiredSkillNames.join(" · ")}
                        </dd>
                      </dl>
                      <EffectList lines={synergy.effectLines} />
                    </div>
                  </details>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>

      <nav className={`${SURFACE_INSET} mt-8 p-4`} aria-label="직업 도감 이동">
        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          관련 직업
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[...entry.prerequisites, ...entry.nextJobs].map((relation) => (
            <Link
              key={relation.id}
              href={`/manual/jobs/${relation.id}`}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:border-amber-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
            >
              {relation.name}
            </Link>
          ))}
          <Link
            href="/manual/jobs"
            className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-400"
          >
            전체 직업 도감
          </Link>
        </div>
      </nav>
    </div>
  );
}
