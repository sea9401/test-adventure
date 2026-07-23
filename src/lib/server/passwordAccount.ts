import "server-only";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { rawDb } from "@/db";
import { passwordCredentials, users } from "@/db/schema";
import {
  hashPasswordAccountPassword,
  isValidPasswordAccountPassword,
  normalizePasswordAccountLoginId,
  verifyPasswordAccountPassword,
} from "@/lib/passwordCredentialCore.mjs";

export type PasswordAccountUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
};

let dummyHashPromise: Promise<string> | null = null;

function dummyHash(): Promise<string> {
  dummyHashPromise ??= hashPasswordAccountPassword(
    randomBytes(24).toString("base64url"),
  );
  return dummyHashPromise;
}

export async function authenticatePasswordAccount(
  loginIdInput: unknown,
  passwordInput: unknown,
): Promise<PasswordAccountUser | null> {
  const parsedLoginId = normalizePasswordAccountLoginId(loginIdInput);
  if (
    !parsedLoginId ||
    typeof passwordInput !== "string" ||
    !isValidPasswordAccountPassword(passwordInput)
  ) {
    return null;
  }

  const [row] = await rawDb()
    .select({
      userId: passwordCredentials.userId,
      passwordHash: passwordCredentials.passwordHash,
      disabledAt: passwordCredentials.disabledAt,
      email: users.email,
      name: users.name,
      image: users.image,
    })
    .from(passwordCredentials)
    .innerJoin(users, eq(users.id, passwordCredentials.userId))
    .where(
      eq(
        passwordCredentials.normalizedLoginId,
        parsedLoginId.normalizedLoginId,
      ),
    )
    .limit(1);

  const passwordHash = row?.passwordHash ?? (await dummyHash());
  const matches = await verifyPasswordAccountPassword(
    passwordInput,
    passwordHash,
  );
  if (!row || row.disabledAt || !matches) return null;

  return {
    id: row.userId,
    email: row.email,
    name: row.name,
    image: row.image,
  };
}
