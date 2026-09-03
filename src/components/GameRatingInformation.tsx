import Image from "next/image";
import { GAME_RATING } from "@/lib/gameRating";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";

type GameRatingInformationProps = {
  compact?: boolean;
};

const REQUIRED_FIELDS = [
  ["게임명", GAME_RATING.title],
  ["상호", GAME_RATING.applicant],
  ["이용등급", GAME_RATING.rating],
  ["등급분류번호", GAME_RATING.classificationNumber],
  ["제작연월일", GAME_RATING.productionDate],
  ["게임제작업 등록번호", GAME_RATING.producerRegistrationNumber],
  ["게임배급업 등록번호", GAME_RATING.distributorRegistrationNumber],
] as const;

export function GameRatingInformation({ compact = false }: GameRatingInformationProps) {
  return (
    <section className={`${SURFACE_CARD} space-y-5 p-5 sm:p-6`} aria-labelledby="game-rating-title">
      <div className="flex items-start gap-4">
        <Image
          src={GAME_RATING.ratingImage}
          alt="12세이용가"
          width={78}
          height={90}
          className="h-[90px] w-[78px] shrink-0"
          unoptimized
          priority
        />
        <div className="min-w-0 space-y-1">
          <h1 id="game-rating-title" className="text-xl font-bold sm:text-2xl">
            게임 등급정보
          </h1>
          <p className="text-lg font-semibold text-amber-700 dark:text-amber-300">
            {GAME_RATING.rating}
          </p>
          <p className="font-semibold text-red-700 dark:text-red-300">
            {GAME_RATING.restrictionNotice}
          </p>
        </div>
      </div>

      <dl className={`${SURFACE_INSET} divide-y divide-zinc-200 px-4 dark:divide-zinc-700`}>
        {REQUIRED_FIELDS.map(([label, value]) => (
          <div key={label} className="grid gap-1 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-3">
            <dt className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">{label}</dt>
            <dd className="break-words text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <div className={`${SURFACE_INSET} flex items-center gap-4 p-4`}>
        <Image
          src={GAME_RATING.descriptorImage}
          alt="내용정보: 폭력성"
          width={61}
          height={70}
          className="h-[70px] w-[61px] shrink-0"
          unoptimized
        />
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">내용정보</p>
          <p className="text-lg font-bold">{GAME_RATING.descriptor}</p>
          {!compact && <p className="mt-1 text-sm">{GAME_RATING.descriptorReason}</p>}
        </div>
      </div>

      {!compact && (
        <div className="space-y-3 text-sm leading-6">
          <div>
            <h2 className="font-bold">플랫폼 / 장르</h2>
            <p>{GAME_RATING.platform} / {GAME_RATING.genre}</p>
          </div>
          <div>
            <h2 className="font-bold">등급결정일</h2>
            <p>{GAME_RATING.decisionDate}</p>
          </div>
          <div>
            <h2 className="font-bold">최초 공개일</h2>
            <p>{GAME_RATING.firstPublicDate}</p>
          </div>
          <div>
            <h2 className="font-bold">등급결정사유</h2>
            <p>{GAME_RATING.summary}</p>
            <p>{GAME_RATING.descriptorReason}</p>
          </div>
          <a
            href={GAME_RATING.decisionSearchUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center font-semibold text-amber-700 underline underline-offset-4 dark:text-amber-300"
          >
            게임콘텐츠등급분류위원회에서 결정 내용 확인
          </a>
        </div>
      )}
    </section>
  );
}
