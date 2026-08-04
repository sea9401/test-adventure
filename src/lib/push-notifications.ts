export type GamePushMessage = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

export type BrowserPushSubscription = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export function isBrowserPushSubscription(
  value: unknown,
): value is BrowserPushSubscription {
  if (!value || typeof value !== "object") return false;
  const source = value as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  return (
    typeof source.endpoint === "string" &&
    source.endpoint.startsWith("https://") &&
    source.endpoint.length <= 4_096 &&
    !!source.keys &&
    typeof source.keys.p256dh === "string" &&
    source.keys.p256dh.length > 0 &&
    source.keys.p256dh.length <= 512 &&
    typeof source.keys.auth === "string" &&
    source.keys.auth.length > 0 &&
    source.keys.auth.length <= 512
  );
}
