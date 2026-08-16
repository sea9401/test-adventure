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

export function gameContentTransitionClass(
  previousPathname: string | null,
  pathname: string,
): string {
  if (previousPathname == null || previousPathname === pathname) return "";
  return isHuntListToFloorNavigation(previousPathname, pathname)
    ? "ui-hunt-floor-enter"
    : "ui-route-content-enter";
}

export function GameContentTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const [transition, setTransition] = useState<{
    pathname: string;
    className: string;
  } | null>(null);

  useClientLayoutEffect(() => {
    if (previousPathname.current === pathname) return;
    setTransition({
      pathname,
      className: gameContentTransitionClass(
        previousPathname.current,
        pathname,
      ),
    });
    previousPathname.current = pathname;
  }, [pathname]);

  const transitionClass =
    transition?.pathname === pathname ? transition.className : "";

  return (
    <div className={transitionClass}>
      {children}
    </div>
  );
}
