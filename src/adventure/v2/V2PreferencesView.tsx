"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  CaretRight,
  Check,
  Eye,
  EyeSlash,
  FileText,
  ImageSquare,
  Moon,
  Sun,
  TerminalWindow,
  UserMinus,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { PushNotificationSettings } from "@/components/PushNotificationSettings";
import { BlockedUsersPanel } from "@/components/safety/BlockedUsersPanel";
import { useGameState } from "./GameStateProvider";
import { useAdventureDashboard } from "./AdventureDashboardProvider";
import { AdventureActivitySettings } from "./AdventureActivitySettings";
import { AdventureHomeLayoutSettings } from "./AdventureHomeLayoutSettings";
import {
  DEFAULT_ADVENTURE_HOME_HIDDEN_WIDGET_IDS,
  DEFAULT_ADVENTURE_HOME_WIDGET_ORDER,
  type AdventureHomePreferences,
} from "./adventureDashboard";
import {
  BACKGROUND_HIDDEN_MODE_CLASS,
  DISCREET_MODE_CLASS,
  DISPLAY_MODE_STORAGE_KEY,
  TERMINAL_MODE_CLASS,
  storedValueForDisplayMode,
  type DisplayMode,
} from "./discreetMode";

const DeleteAccountModal = dynamic(
  () =>
    import("@/components/DeleteAccountModal").then((module) => ({
      default: module.DeleteAccountModal,
    })),
  { ssr: false },
);

type Theme = "light" | "dark";

const DISPLAY_OPTIONS = [
  {
    id: "default",
    label: "기본 모드",
    detail: "장면 배경과 화려한 장식을 모두 표시합니다.",
    Icon: Eye,
  },
  {
    id: "background-hidden",
    label: "배경 숨김",
    detail: "장면 배경만 숨기고 프로필과 닉네임 장식은 유지합니다.",
    Icon: ImageSquare,
  },
  {
    id: "discreet",
    label: "은신 모드",
    detail: "장면 배경과 화려한 장식을 모두 숨깁니다.",
    Icon: EyeSlash,
  },
  {
    id: "terminal",
    label: "터미널 모드",
    detail: "검은 화면과 모노스페이스 글꼴로 게임 화면을 업무 도구처럼 단순화합니다.",
    Icon: TerminalWindow,
  },
] as const satisfies readonly {
  id: DisplayMode;
  label: string;
  detail: string;
  Icon: typeof Eye;
}[];

export function V2PreferencesView() {
  const router = useRouter();
  const { accountName } = useGameState();
  const { snapshot, updatePreferences } = useAdventureDashboard();
  const [theme, setTheme] = useState<Theme>("dark");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("default");
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationSaveError, setNotificationSaveError] = useState(false);
  const [homeSaveError, setHomeSaveError] = useState(false);
  const activityNotificationsEnabled =
    snapshot?.preferences.activityNotificationsEnabled ?? true;

  useEffect(() => {
    const root = document.documentElement;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(root.classList.contains("dark") ? "dark" : "light");
    setDisplayMode(
      root.classList.contains(TERMINAL_MODE_CLASS)
        ? "terminal"
        : root.classList.contains(DISCREET_MODE_CLASS)
          ? "discreet"
          : root.classList.contains(BACKGROUND_HIDDEN_MODE_CLASS)
            ? "background-hidden"
            : "default",
    );
  }, []);

  const changeTheme = (next: Theme) => {
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("theme", next);
    } catch {}
  };

  const changeDisplayMode = (next: DisplayMode) => {
    setDisplayMode(next);
    document.documentElement.classList.toggle(
      BACKGROUND_HIDDEN_MODE_CLASS,
      next === "background-hidden",
    );
    document.documentElement.classList.toggle(
      DISCREET_MODE_CLASS,
      next === "discreet",
    );
    document.documentElement.classList.toggle(
      TERMINAL_MODE_CLASS,
      next === "terminal",
    );
    try {
      const storedValue = storedValueForDisplayMode(next);
      if (storedValue) {
        localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, storedValue);
      } else {
        localStorage.removeItem(DISPLAY_MODE_STORAGE_KEY);
      }
    } catch {}
  };

  const toggleActivityNotifications = async () => {
    if (!snapshot || notificationSaving) return;
    setNotificationSaving(true);
    setNotificationSaveError(false);
    try {
      await updatePreferences({
        activityNotificationsEnabled: !activityNotificationsEnabled,
      });
    } catch {
      setNotificationSaveError(true);
    } finally {
      setNotificationSaving(false);
    }
  };

  const persistHomePreferences = (patch: Partial<AdventureHomePreferences>) => {
    setHomeSaveError(false);
    void updatePreferences(patch).catch(() => setHomeSaveError(true));
  };

  return (
    <PageShell>
      <SubViewHeader title="환경 설정" onBack={() => router.push("/")} />

      {homeSaveError && (
        <StatusBanner tone="error" role="status">
          홈 설정을 저장하지 못해 이전 상태로 되돌렸습니다.
        </StatusBanner>
      )}

      {snapshot && (
        <>
          <AdventureHomeLayoutSettings
            order={snapshot.preferences.widgetOrder}
            hidden={snapshot.preferences.hiddenWidgetIds}
            onOrderChange={(widgetOrder) =>
              persistHomePreferences({ widgetOrder })
            }
            onHiddenChange={(hiddenWidgetIds) =>
              persistHomePreferences({ hiddenWidgetIds })
            }
            onReset={() =>
              persistHomePreferences({
                widgetOrder: [...DEFAULT_ADVENTURE_HOME_WIDGET_ORDER],
                hiddenWidgetIds: [
                  ...DEFAULT_ADVENTURE_HOME_HIDDEN_WIDGET_IDS,
                ],
              })
            }
          />
          <AdventureActivitySettings
            activities={snapshot.activities}
            onToggle={(id, enabled) =>
              persistHomePreferences({
                activityEnabled: {
                  ...snapshot.preferences.activityEnabled,
                  [id]: enabled,
                },
              })
            }
          />
        </>
      )}

      <Card as="section" padding="md" className="space-y-3">
        <div>
          <h2 className="text-sm font-bold">화면 테마</h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            화면의 기본 명암을 선택합니다. 변경 사항은 이 브라우저에 저장됩니다.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { id: "light", label: "라이트 모드", Icon: Sun },
              { id: "dark", label: "다크 모드", Icon: Moon },
            ] as const
          ).map((option) => {
            const selected = theme === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => changeTheme(option.id)}
                aria-pressed={selected}
                className={`${SURFACE_INSET} flex min-h-20 flex-col items-center justify-center gap-2 p-3 text-sm font-semibold transition-colors hover:border-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                  selected
                    ? "ring-2 ring-amber-500 text-amber-700 dark:text-amber-300"
                    : "text-zinc-700 dark:text-zinc-300"
                }`}
              >
                <option.Icon size={24} weight={selected ? "fill" : "duotone"} />
                <span className="flex items-center gap-1">
                  {option.label}
                  {selected && <Check size={14} weight="bold" aria-hidden />}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card as="section" padding="md" className="space-y-3">
        <div>
          <h2 className="text-sm font-bold">알림</h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            게임 화면의 콘텐츠 알림과 기기별 푸시 알림 수신 여부를 선택합니다.
          </p>
        </div>
        <div className={`${SURFACE_INSET} flex items-start gap-3 p-3`}>
          <Bell
            size={24}
            weight={activityNotificationsEnabled ? "fill" : "duotone"}
            className={`mt-0.5 shrink-0 ${
              activityNotificationsEnabled
                ? "text-amber-600 dark:text-amber-300"
                : "text-zinc-500 dark:text-zinc-400"
            }`}
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              콘텐츠 알림 표시
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              전투·마을·생활 등 상단 메뉴와 하위 콘텐츠에 노란 알림 점을 표시합니다.
            </p>
            <button
              type="button"
              aria-label="콘텐츠 알림 표시"
              aria-pressed={activityNotificationsEnabled}
              disabled={!snapshot || notificationSaving}
              onClick={toggleActivityNotifications}
              className={`mt-3 min-h-9 rounded-md border px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                activityNotificationsEnabled
                  ? "border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950"
                  : "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              }`}
            >
              {notificationSaving
                ? "저장 중…"
                : activityNotificationsEnabled
                  ? "표시 켜짐"
                  : "표시 꺼짐"}
            </button>
            {notificationSaveError && (
              <p role="status" className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                콘텐츠 알림 설정을 저장하지 못했습니다. 다시 시도해 주세요.
              </p>
            )}
          </div>
        </div>
        <PushNotificationSettings />
      </Card>

      <Card as="section" padding="md" className="space-y-3">
        <div>
          <h2 className="text-sm font-bold">배경 및 표시</h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            게임 기능은 그대로 두고 배경과 꾸미기 효과의 표시만 바꿉니다.
          </p>
        </div>
        <div className="space-y-2">
          {DISPLAY_OPTIONS.map((option) => {
            const selected = displayMode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => changeDisplayMode(option.id)}
                aria-pressed={selected}
                className={`${SURFACE_INSET} flex w-full items-center gap-3 p-3 text-left transition-colors hover:border-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                  selected
                    ? "ring-2 ring-amber-500 text-amber-700 dark:text-amber-300"
                    : "text-zinc-700 dark:text-zinc-300"
                }`}
              >
                <option.Icon
                  size={24}
                  weight={selected ? "fill" : "duotone"}
                  className="shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {option.detail}
                  </span>
                </span>
                {selected && <Check size={18} weight="bold" className="shrink-0" aria-hidden />}
              </button>
            );
          })}
        </div>
      </Card>

      <Card as="section" padding="md" className="space-y-3">
        <div>
          <h2 className="text-sm font-bold">계정 및 안내</h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            서비스 정책을 확인하거나 계정 탈퇴를 진행할 수 있습니다.
          </p>
        </div>
        <Link
          href="/privacy"
          className={`${SURFACE_INSET} flex items-center gap-3 p-3 text-zinc-700 transition-colors hover:border-amber-400 dark:text-zinc-300`}
        >
          <FileText size={24} weight="duotone" className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">정책·약관</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              이용약관, 개인정보처리방침, 운영정책과 오픈소스 고지를 확인합니다.
            </span>
          </span>
          <CaretRight size={18} weight="bold" className="shrink-0" aria-hidden />
        </Link>
        <BlockedUsersPanel />
        <div className={`${SURFACE_INSET} p-3`}>
          <div className="flex items-start gap-3">
            <UserMinus
              size={24}
              weight="duotone"
              className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400"
            />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                회원 탈퇴
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                계정과 모든 게임 데이터가 영구 삭제되며 복구할 수 없습니다.
              </p>
              <button
                type="button"
                onClick={() => setDeleteAccountOpen(true)}
                className="mt-3 rounded-md border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950"
              >
                회원 탈퇴 진행
              </button>
            </div>
          </div>
        </div>
      </Card>

      {deleteAccountOpen && (
        <DeleteAccountModal
          gameName={accountName}
          onClose={() => setDeleteAccountOpen(false)}
        />
      )}
    </PageShell>
  );
}
