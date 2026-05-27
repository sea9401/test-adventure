import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { StaleBuildAutoReload } from "@/components/StaleBuildAutoReload";
import { VersionCheck } from "@/components/VersionCheck";
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

export const metadata: Metadata = {
  metadataBase: new URL("https://msmsge.com"),
  title: SITE_NAME,
  description: SITE_DESC,
  applicationName: SITE_NAME,
  appleWebApp: {
    capable: true,
    title: "무슨게임",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  // 링크 공유 시 미리보기 카드 (카카오톡·슬랙·디스코드·X 등)
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESC,
    url: "/",
    locale: "ko_KR",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESC,
    images: ["/og.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(!t)t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;

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
        </head>
        <body className="min-h-full flex flex-col font-sans">
          <StaleBuildAutoReload />
          <ServiceWorkerRegistrar />
          <VersionCheck />
          {children}
        </body>
      </html>
    </SessionProvider>
  );
}
