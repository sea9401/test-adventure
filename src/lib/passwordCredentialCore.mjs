import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

export const PASSWORD_ACCOUNT_MIN_PASSWORD_LENGTH = 6;
export const PASSWORD_ACCOUNT_MAX_PASSWORD_LENGTH = 128;
export const PASSWORD_ACCOUNT_MIN_LOGIN_ID_LENGTH = 3;
export const PASSWORD_ACCOUNT_MAX_LOGIN_ID_LENGTH = 32;

const LOGIN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const SCRYPT_VERSION = "v1";
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const scrypt = promisify(scryptCallback);

/**
 * @param {unknown} value
 * @returns {{ loginId: string, normalizedLoginId: string } | null}
 */
export function normalizePasswordAccountLoginId(value) {
  if (typeof value !== "string") return null;
  const loginId = value.trim().normalize("NFKC");
  if (
    loginId.length < PASSWORD_ACCOUNT_MIN_LOGIN_ID_LENGTH ||
    loginId.length > PASSWORD_ACCOUNT_MAX_LOGIN_ID_LENGTH ||
    !LOGIN_ID_PATTERN.test(loginId)
  ) {
    return null;
  }
  return { loginId, normalizedLoginId: loginId.toLowerCase() };
}

/** @param {unknown} value */
export function isValidPasswordAccountPassword(value) {
  return (
    typeof value === "string" &&
    value.length >= PASSWORD_ACCOUNT_MIN_PASSWORD_LENGTH &&
    value.length <= PASSWORD_ACCOUNT_MAX_PASSWORD_LENGTH &&
    Buffer.byteLength(value, "utf8") <= 512
  );
}

/** @param {string} password */
export async function hashPasswordAccountPassword(password) {
  if (!isValidPasswordAccountPassword(password)) {
    throw new Error(
      `Password must be ${PASSWORD_ACCOUNT_MIN_PASSWORD_LENGTH}-${PASSWORD_ACCOUNT_MAX_PASSWORD_LENGTH} characters`,
    );
  }

  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAX_MEMORY,
  });
  return [
    "scrypt",
    SCRYPT_VERSION,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    Buffer.from(derivedKey).toString("base64url"),
  ].join("$");
}

/**
 * @param {string} password
 * @param {string} encodedHash
 */
export async function verifyPasswordAccountPassword(password, encodedHash) {
  if (!isValidPasswordAccountPassword(password)) return false;

  const [algorithm, version, n, r, p, saltValue, hashValue, extra] =
    encodedHash.split("$");
  if (
    extra !== undefined ||
    algorithm !== "scrypt" ||
    version !== SCRYPT_VERSION ||
    n !== String(SCRYPT_N) ||
    r !== String(SCRYPT_R) ||
    p !== String(SCRYPT_P) ||
    !saltValue ||
    !hashValue
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(saltValue, "base64url");
    const expected = Buffer.from(hashValue, "base64url");
    if (salt.length !== 16 || expected.length !== SCRYPT_KEY_LENGTH) return false;

    const actual = Buffer.from(
      await scrypt(password, salt, SCRYPT_KEY_LENGTH, {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        maxmem: SCRYPT_MAX_MEMORY,
      }),
    );
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
