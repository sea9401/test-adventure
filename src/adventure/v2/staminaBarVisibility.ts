// 상단 바에 스태미나가 늘 보이므로 화면 안 큰 바는 계속 소모하는 사냥터에서만 둔다.
//   회복 속도·최대치까지 남은 시간은 상단 바 스태미나를 누르면 열리는 창에서 본다.
const STAMINA_BAR_ROUTE_ROOTS = ["/battle/dungeon"] as const;

function isRouteOrDescendant(pathname: string, routeRoot: string): boolean {
  return pathname === routeRoot || pathname.startsWith(`${routeRoot}/`);
}

/** 사냥터에서만 화면 안 스태미나 바를 노출한다. 홈은 편집 위젯으로 제공한다. */
export function shouldShowStaminaBar(pathname: string): boolean {
  return STAMINA_BAR_ROUTE_ROOTS.some((routeRoot) =>
    isRouteOrDescendant(pathname, routeRoot),
  );
}
