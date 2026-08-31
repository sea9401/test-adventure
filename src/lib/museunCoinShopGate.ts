export type MuseunCoinShopSessionUser = {
  id?: string | null;
  email?: string | null;
};

function normalizedCsv(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** DB에 접근할 수 없는 Proxy에서도 출시 전 상점의 HTTP 404 경계를 지킨다. */
export function canPassMuseunCoinShopProxy(
  user: MuseunCoinShopSessionUser | null | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN === "true") return true;
  if (!user) return false;

  const userId = user.id?.trim().toLowerCase();
  if (
    userId &&
    normalizedCsv(env.MUSEUN_COIN_SHOP_REVIEW_USER_IDS).has(userId)
  ) {
    return true;
  }

  const email = user.email?.trim().toLowerCase();
  return !!email && normalizedCsv(env.ADMIN_EMAILS).has(email);
}
