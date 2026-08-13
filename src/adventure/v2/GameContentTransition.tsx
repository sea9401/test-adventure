"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const HUNT_FLOOR_PATH = /^\/battle\/dungeon\/\d+$/;
const useClientLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function isHuntListToFloorNavigation(
  previousPathname: string | null,
  pathname: string,
): boolean {
  return (
    previousPathname === "/battle/dungeon" && HUNT_FLOOR_PATH.test(pathname)
  );
}

export function GameContentTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const [animatedPathname, setAnimatedPathname] = useState<string | null>(null);

  useClientLayoutEffect(() => {
    if (previousPathname.current === pathname) return;
    setAnimatedPathname(
      isHuntListToFloorNavigation(previousPathname.current, pathname)
        ? pathname
        : null,
    );
    previousPathname.current = pathname;
  }, [pathname]);

  return (
    <div className={animatedPathname === pathname ? "ui-hunt-floor-enter" : ""}>
      {children}
    </div>
  );
}
