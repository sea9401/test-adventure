import type { Metadata, Viewport } from "next";
import {
  BACKGROUND_HIDDEN_MODE_CLASS,
  BACKGROUND_HIDDEN_MODE_STORED_VALUE,
  DISCREET_MODE_CLASS,
  DISCREET_MODE_STORED_VALUE,
  DISPLAY_MODE_STORAGE_KEY,
  TERMINAL_MODE_CLASS,
  TERMINAL_MODE_STORED_VALUE,
} from "@/adventure/v2/discreetMode";
import { Geist, Geist_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { StaleBuildAutoReload } from "@/components/StaleBuildAutoReload";
import { VersionCheck } from "@/components/VersionCheck";
import { AdminImpersonationBanner } from "@/components/AdminImpersonationBanner";
import { AppLaunchSplash } from "@/components/AppLaunchSplash";
import { GameRatingLaunchNotice } from "@/components/GameRatingLaunchNotice";
import { GameDialogHost } from "@/components/ui/GameDialogHost";
import {
  GAME_RATING_NOTICE_SEEN_CLASS,
  GAME_RATING_NOTICE_SESSION_KEY,
} from "@/lib/gameRating";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_NAME = "무슨무슨게임";
const SITE_DESC = "브라우저로 즐기는 어드벤처 RPG";
const SOCIAL_PREVIEW_IMAGE = "/og-question-20260723.jpg";

export const metadata: Metadata = {
  metadataBase: new URL("https://msmsge.com"),
  title: SITE_NAME,
  description: SITE_DESC,
  applicationName: SITE_NAME,
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "무슨게임",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  verification: {
    other: {
      "naver-site-verification":
        "896570a7353224074d09a91ac516e37a556f2da3",
    },
  },
  // 링크 공유 시 미리보기 카드 (카카오톡·슬랙·디스코드·X 등)
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESC,
    url: "/",
    locale: "ko_KR",
    images: [
      {
        url: SOCIAL_PREVIEW_IMAGE,
        width: 1200,
        height: 630,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESC,
    images: [SOCIAL_PREVIEW_IMAGE],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(!t)t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;
const displayModeInit = `(function(){try{var m=localStorage.getItem(${JSON.stringify(DISPLAY_MODE_STORAGE_KEY)});if(m===${JSON.stringify(TERMINAL_MODE_STORED_VALUE)})document.documentElement.classList.add(${JSON.stringify(TERMINAL_MODE_CLASS)});else if(m===${JSON.stringify(DISCREET_MODE_STORED_VALUE)})document.documentElement.classList.add(${JSON.stringify(DISCREET_MODE_CLASS)});else if(m===${JSON.stringify(BACKGROUND_HIDDEN_MODE_STORED_VALUE)})document.documentElement.classList.add(${JSON.stringify(BACKGROUND_HIDDEN_MODE_CLASS)});}catch(e){}})();`;
const gameRatingNoticeInit = `(function(){try{if(sessionStorage.getItem(${JSON.stringify(GAME_RATING_NOTICE_SESSION_KEY)})==='1')document.documentElement.classList.add(${JSON.stringify(GAME_RATING_NOTICE_SEEN_CLASS)});}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SessionProvider>
      <html
        lang="ko"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeInit }} />
          <script dangerouslySetInnerHTML={{ __html: displayModeInit }} />
          <script dangerouslySetInnerHTML={{ __html: gameRatingNoticeInit }} />
        </head>
        <body className="min-h-full flex flex-col font-sans">
          <AppLaunchSplash />
          <GameRatingLaunchNotice />
          <AdminImpersonationBanner />
          <StaleBuildAutoReload />
          <ServiceWorkerRegistrar />
          <VersionCheck />
          {children}
          <GameDialogHost />
        </body>
      </html>
    </SessionProvider>
  );
}
