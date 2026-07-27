import { recordAbuseEventSoon } from "./abuseLog";
import { recordOpsSignal } from "./opsAlert";

export const SAME_IP_PRESENCE_ACCOUNT_THRESHOLD = 2;
export const SAME_IP_PRESENCE_CONTINUOUS_MS = 30 * 60_000;
export const SAME_IP_PRESENCE_HEARTBEAT_GAP_MS = 90_000;
export const SAME_IP_PRESENCE_ALERT_COOLDOWN_MS = 6 * 60 * 60_000;

type PresenceIdentity = {
  userId: string;
  name: string;
  firstSeenAt: number;
  lastSeenAt: number;
};

type PresenceBucket = {
  users: Map<string, PresenceIdentity>;
  lastSeenAt: number;
  alertedSignature: string | null;
  alertedAt: number;
};

export type PersistentSameIpPresence = {
  ip: string;
  users: PresenceIdentity[];
  continuousMs: number;
};

const presenceByIp = new Map<string, PresenceBucket>();
let nextCleanupAt = 0;

export function observeSameIpPresence(args: {
  ip: string;
  userId: string;
  name: string;
  now?: number;
}): PersistentSameIpPresence | null {
  const now = args.now ?? Date.now();
  cleanupInactiveBuckets(now);
  const current = presenceByIp.get(args.ip);
  const bucket: PresenceBucket = current ?? {
    users: new Map(),
    lastSeenAt: now,
    alertedSignature: null,
    alertedAt: 0,
  };
  for (const [userId, user] of bucket.users) {
    if (now < user.lastSeenAt || now - user.lastSeenAt > SAME_IP_PRESENCE_HEARTBEAT_GAP_MS) {
      bucket.users.delete(userId);
    }
  }
  const previous = bucket.users.get(args.userId);
  const continuous =
    previous &&
    now >= previous.lastSeenAt &&
    now - previous.lastSeenAt <= SAME_IP_PRESENCE_HEARTBEAT_GAP_MS;
  bucket.users.set(args.userId, {
    userId: args.userId,
    name: args.name.slice(0, 80),
    firstSeenAt: continuous ? previous.firstSeenAt : now,
    lastSeenAt: now,
  });
  bucket.lastSeenAt = now;
  presenceByIp.set(args.ip, bucket);

  const activeUsers = [...bucket.users.values()].sort((a, b) =>
    a.userId.localeCompare(b.userId),
  );
  if (activeUsers.length < SAME_IP_PRESENCE_ACCOUNT_THRESHOLD) return null;
  const sharedSince = Math.max(...activeUsers.map((user) => user.firstSeenAt));
  const continuousMs = now - sharedSince;
  if (continuousMs < SAME_IP_PRESENCE_CONTINUOUS_MS) return null;
  const signature = activeUsers.map((user) => user.userId).join(":");
  const sameRecentAlert =
    bucket.alertedSignature === signature &&
    now - bucket.alertedAt < SAME_IP_PRESENCE_ALERT_COOLDOWN_MS;
  if (sameRecentAlert) return null;
  bucket.alertedSignature = signature;
  bucket.alertedAt = now;
  return { ip: args.ip, users: activeUsers, continuousMs };
}

export function recordSameIpPresenceSoon(args: {
  ip: string;
  userId: string;
  name: string;
  now?: number;
}) {
  const alert = observeSameIpPresence(args);
  if (!alert) return;
  const identities = alert.users.map((user) => ({
    userId: user.userId,
    name: user.name,
  }));
  console.warn("[abuse-monitor] persistent same-IP accounts", {
    ip: alert.ip,
    accounts: identities,
    continuousMs: alert.continuousMs,
  });
  recordAbuseEventSoon({
    userId: args.userId,
    ip: alert.ip,
    action: "presence:heartbeat",
    reason: "persistent_same_ip_accounts",
    detail: {
      accountCount: identities.length,
      accounts: identities,
      continuousMinutes: Math.floor(alert.continuousMs / 60_000),
    },
  });
  recordOpsSignal({
    key: `abuse:persistent-same-ip:${alert.ip}:${identities.map((user) => user.userId).join(":")}`,
    alertType: "abuse.persistent_same_ip",
    label: "동일 IP 30분 지속 접속",
    threshold: 1,
    windowMs: SAME_IP_PRESENCE_ALERT_COOLDOWN_MS,
    detail: {
      channel: "abuse",
      ip: alert.ip,
      accountCount: identities.length,
      accounts: identities,
      continuousMinutes: Math.floor(alert.continuousMs / 60_000),
    },
  });
}

function cleanupInactiveBuckets(now: number) {
  if (now < nextCleanupAt) return;
  nextCleanupAt = now + 10 * 60_000;
  for (const [ip, bucket] of presenceByIp) {
    if (now < bucket.lastSeenAt || now - bucket.lastSeenAt > SAME_IP_PRESENCE_ALERT_COOLDOWN_MS) {
      presenceByIp.delete(ip);
    }
  }
}

export function resetSameIpPresenceForTests() {
  presenceByIp.clear();
  nextCleanupAt = 0;
}
