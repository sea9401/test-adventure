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

/** 스태미나를 직접 사용하는 전투 콘텐츠에서만 공용 바를 노출한다. 홈은 편집 위젯으로 제공한다. */
export function shouldShowStaminaBar(pathname: string): boolean {
  return STAMINA_BAR_ROUTE_ROOTS.some((routeRoot) =>
    isRouteOrDescendant(pathname, routeRoot),
  );
}
