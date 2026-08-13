import "server-only";

import { eq } from "drizzle-orm";
import { rawDb } from "@/db";
import { users } from "@/db/schema";

const MAX_EMAIL_LENGTH = 320;
const LOOPBACK_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

type LocalDevAutoLoginEnv = {
  [key: string]: string | undefined;
  LOCAL_DEV_AUTO_LOGIN_USER_EMAIL?: string;
};

export type LocalDevAutoLoginConfig = {
  userEmail: string;
};

export type LocalDevAccountUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
};

type FindUserByEmail = (
  email: string,
) => Promise<LocalDevAccountUser | null>;

function isValidEmail(value: string): boolean {
  return (
    value.length <= MAX_EMAIL_LENGTH &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
  );
}

export function readLocalDevAutoLoginConfig(
  env: LocalDevAutoLoginEnv = process.env,
  nodeEnv = process.env.NODE_ENV,
): LocalDevAutoLoginConfig | null {
  if (nodeEnv !== "development") return null;

  const userEmail = env.LOCAL_DEV_AUTO_LOGIN_USER_EMAIL?.trim() ?? "";
  if (!isValidEmail(userEmail)) return null;
  return { userEmail };
}

function hostnameFromHostHeader(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(`http://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function hostnameFromOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isLoopbackAuthRequest(
  request: Pick<Request, "headers">,
): boolean {
  const host = hostnameFromHostHeader(request.headers.get("host"));
  if (!host || !LOOPBACK_HOSTNAMES.has(host)) return false;

  const originHeader = request.headers.get("origin");
  if (!originHeader) return true;
  const origin = hostnameFromOrigin(originHeader);
  return origin !== null && LOOPBACK_HOSTNAMES.has(origin);
}

async function findExistingUserByEmail(
  email: string,
): Promise<LocalDevAccountUser | null> {
  const [user] = await rawDb()
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return user ?? null;
}

export async function authenticateLocalDevAccount(
  request: Pick<Request, "headers">,
  options: {
    env?: LocalDevAutoLoginEnv;
    nodeEnv?: string;
    findUserByEmail?: FindUserByEmail;
  } = {},
): Promise<LocalDevAccountUser | null> {
  const config = readLocalDevAutoLoginConfig(options.env, options.nodeEnv);
  if (!config || !isLoopbackAuthRequest(request)) return null;

  const findUserByEmail = options.findUserByEmail ?? findExistingUserByEmail;
  return findUserByEmail(config.userEmail);
}
