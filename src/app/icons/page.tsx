"use client";

import { useMemo, useState } from "react";
import {
  ArrowClockwise,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Axe,
  Backpack,
  Bag,
  Barbell,
  Bell,
  BookOpen,
  Bridge,
  Campfire,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  CastleTurret,
  Check,
  CheckCircle,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Coins,
  Compass,
  CookingPot,
  Crosshair,
  Crown,
  Diamond,
  Drop,
  Envelope,
  Fire,
  Fish,
  Flask,
  FlowerLotus,
  FlowerTulip,
  Footprints,
  ForkKnife,
  GameController,
  Gear,
  Hammer,
  HandFist,
  Handshake,
  Heart,
  Heartbeat,
  House,
  Info,
  Knife,
  Leaf,
  Lightning,
  Lock,
  LockOpen,
  MagicWand,
  MagnifyingGlass,
  MapPin,
  MapTrifold,
  Medal,
  MedalMilitary,
  MoonStars,
  Mountains,
  Package,
  Path,
  Pause,
  PawPrint,
  Plant,
  Play,
  Question,
  Scales,
  Scroll,
  Shield,
  ShieldCheck,
  ShieldChevron,
  ShieldSlash,
  Shovel,
  Skull,
  Snowflake,
  Sparkle,
  Star,
  Storefront,
  Sun,
  SunHorizon,
  Sword,
  Target,
  Tent,
  TreasureChest,
  Tree,
  Trophy,
  User,
  Users,
  Warehouse,
  Waves,
  Wind,
  X,
  XCircle,
  type Icon,
} from "@phosphor-icons/react";
import { TextInput } from "@/components/ui/TextInput";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";

const WEIGHTS = ["thin", "light", "regular", "bold", "fill", "duotone"] as const;
type Weight = (typeof WEIGHTS)[number];

type IconEntry = { name: string; Component: Icon };

const sections: { title: string; description: string; icons: IconEntry[] }[] = [
  {
    title: "전투/장비",
    description: "직업, 공격, 방어, 전투 결과",
    icons: [
      { name: "Sword", Component: Sword },
      { name: "Axe", Component: Axe },
      { name: "Knife", Component: Knife },
      { name: "Hammer", Component: Hammer },
      { name: "HandFist", Component: HandFist },
      { name: "MagicWand", Component: MagicWand },
      { name: "Shield", Component: Shield },
      { name: "ShieldCheck", Component: ShieldCheck },
      { name: "ShieldChevron", Component: ShieldChevron },
      { name: "ShieldSlash", Component: ShieldSlash },
      { name: "Crosshair", Component: Crosshair },
      { name: "Target", Component: Target },
      { name: "Skull", Component: Skull },
      { name: "Heartbeat", Component: Heartbeat },
      { name: "Barbell", Component: Barbell },
    ],
  },
  {
    title: "캐릭터/업적",
    description: "플레이어, 파티, 성장, 랭킹",
    icons: [
      { name: "User", Component: User },
      { name: "Users", Component: Users },
      { name: "Heart", Component: Heart },
      { name: "Lightning", Component: Lightning },
      { name: "Star", Component: Star },
      { name: "Sparkle", Component: Sparkle },
      { name: "Crown", Component: Crown },
      { name: "Medal", Component: Medal },
      { name: "MedalMilitary", Component: MedalMilitary },
      { name: "Trophy", Component: Trophy },
      { name: "PawPrint", Component: PawPrint },
    ],
  },
  {
    title: "탐험/장소",
    description: "지역, 이동, 야영, 건물",
    icons: [
      { name: "House", Component: House },
      { name: "Tree", Component: Tree },
      { name: "Mountains", Component: Mountains },
      { name: "Compass", Component: Compass },
      { name: "MapPin", Component: MapPin },
      { name: "MapTrifold", Component: MapTrifold },
      { name: "Path", Component: Path },
      { name: "Footprints", Component: Footprints },
      { name: "Bridge", Component: Bridge },
      { name: "Tent", Component: Tent },
      { name: "Campfire", Component: Campfire },
      { name: "CastleTurret", Component: CastleTurret },
    ],
  },
  {
    title: "생활/자원",
    description: "채집, 생산, 거래, 보관",
    icons: [
      { name: "Axe", Component: Axe },
      { name: "Shovel", Component: Shovel },
      { name: "Hammer", Component: Hammer },
      { name: "Plant", Component: Plant },
      { name: "Leaf", Component: Leaf },
      { name: "FlowerTulip", Component: FlowerTulip },
      { name: "FlowerLotus", Component: FlowerLotus },
      { name: "Fish", Component: Fish },
      { name: "CookingPot", Component: CookingPot },
      { name: "ForkKnife", Component: ForkKnife },
      { name: "Flask", Component: Flask },
      { name: "Coins", Component: Coins },
      { name: "Diamond", Component: Diamond },
      { name: "Bag", Component: Bag },
      { name: "Backpack", Component: Backpack },
      { name: "Package", Component: Package },
      { name: "TreasureChest", Component: TreasureChest },
      { name: "Warehouse", Component: Warehouse },
      { name: "Storefront", Component: Storefront },
      { name: "Handshake", Component: Handshake },
      { name: "Scales", Component: Scales },
    ],
  },
  {
    title: "날씨/속성",
    description: "물때, 환경 효과, 원소",
    icons: [
      { name: "Sun", Component: Sun },
      { name: "SunHorizon", Component: SunHorizon },
      { name: "MoonStars", Component: MoonStars },
      { name: "Cloud", Component: Cloud },
      { name: "CloudSun", Component: CloudSun },
      { name: "CloudMoon", Component: CloudMoon },
      { name: "CloudRain", Component: CloudRain },
      { name: "CloudSnow", Component: CloudSnow },
      { name: "CloudFog", Component: CloudFog },
      { name: "CloudLightning", Component: CloudLightning },
      { name: "Fire", Component: Fire },
      { name: "Snowflake", Component: Snowflake },
      { name: "Wind", Component: Wind },
      { name: "Waves", Component: Waves },
      { name: "Drop", Component: Drop },
    ],
  },
  {
    title: "UI/액션",
    description: "탐색, 확인, 상태, 시스템",
    icons: [
      { name: "Play", Component: Play },
      { name: "Pause", Component: Pause },
      { name: "ArrowLeft", Component: ArrowLeft },
      { name: "ArrowRight", Component: ArrowRight },
      { name: "ArrowUp", Component: ArrowUp },
      { name: "ArrowDown", Component: ArrowDown },
      { name: "ArrowClockwise", Component: ArrowClockwise },
      { name: "CaretLeft", Component: CaretLeft },
      { name: "CaretRight", Component: CaretRight },
      { name: "CaretUp", Component: CaretUp },
      { name: "CaretDown", Component: CaretDown },
      { name: "Check", Component: Check },
      { name: "CheckCircle", Component: CheckCircle },
      { name: "X", Component: X },
      { name: "XCircle", Component: XCircle },
      { name: "MagnifyingGlass", Component: MagnifyingGlass },
      { name: "Lock", Component: Lock },
      { name: "LockOpen", Component: LockOpen },
      { name: "Bell", Component: Bell },
      { name: "Envelope", Component: Envelope },
      { name: "Scroll", Component: Scroll },
      { name: "BookOpen", Component: BookOpen },
      { name: "Gear", Component: Gear },
      { name: "Info", Component: Info },
      { name: "Question", Component: Question },
      { name: "GameController", Component: GameController },
    ],
  },
];

export default function IconsPage() {
  const [weight, setWeight] = useState<Weight>("duotone");
  const [query, setQuery] = useState("");

  const filteredSections = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return sections;

    return sections
      .map((section) => ({
        ...section,
        icons: section.icons.filter(({ name }) =>
          name.toLocaleLowerCase().includes(normalized),
        ),
      }))
      .filter((section) => section.icons.length > 0);
  }, [query]);

  const visibleCount = filteredSections.reduce(
    (sum, section) => sum + section.icons.length,
    0,
  );

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6">
      <section className={`${SURFACE_CARD} space-y-4 p-4 sm:p-5`}>
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Phosphor 게임 아이콘 갤러리</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            실제 게임 화면에 쓰기 좋은 후보를 분야별로 모았습니다. 이름으로 검색하고
            weight를 바꿔 비교할 수 있습니다.
          </p>
        </header>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-xs">
            <MagnifyingGlass
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              size={16}
            />
            <span className="sr-only">아이콘 이름 검색</span>
            <TextInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="예: shield, cloud, map"
              className="w-full pl-9"
            />
          </label>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            현재 {visibleCount}개 표시
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {WEIGHTS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => setWeight(candidate)}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                weight === candidate
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {candidate}
            </button>
          ))}
        </div>
      </section>

      {filteredSections.length > 0 ? (
        filteredSections.map((section) => (
          <section key={section.title} className={`${SURFACE_CARD} p-4`}>
            <div className="mb-3">
              <h2 className="font-semibold">{section.title}</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {section.description}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {section.icons.map(({ name, Component }) => (
                <div
                  key={`${section.title}-${name}`}
                  className={`${SURFACE_INSET} flex min-w-0 flex-col items-center gap-1.5 p-3`}
                >
                  <Component size={32} weight={weight} />
                  <span className="w-full truncate text-center text-xs text-zinc-600 dark:text-zinc-300">
                    {name}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))
      ) : (
        <section className={`${SURFACE_CARD} p-8 text-center`}>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            일치하는 아이콘이 없습니다.
          </p>
        </section>
      )}
    </main>
  );
}
