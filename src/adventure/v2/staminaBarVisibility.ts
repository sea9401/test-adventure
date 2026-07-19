const STAMINA_BAR_ROUTE_ROOTS = [
  "/battle/dungeon",
  "/battle/coop",
  "/battle/mastery-tower",
  "/battle/arena",
  "/battle/storm-expedition",
] as const;

function isRouteOrDescendant(pathname: string, routeRoot: string): boolean {
  return pathname === routeRoot || pathname.startsWith(`${routeRoot}/`);
}

/** 모험 탭과 스태미나를 사용하는 전투 콘텐츠에서만 공용 바를 노출한다. */
export function shouldShowStaminaBar(pathname: string): boolean {
  return (
    pathname === "/" ||
    STAMINA_BAR_ROUTE_ROOTS.some((routeRoot) =>
      isRouteOrDescendant(pathname, routeRoot),
    )
  );
}
