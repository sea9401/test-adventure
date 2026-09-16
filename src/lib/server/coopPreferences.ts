import "server-only";
import { readSave, type DbExecutor } from "@/lib/server/savesKv";

export const COOP_PREFERENCES_KEY = "coop-preferences.v2";

export async function readCoopPreferences(ex: DbExecutor, userId: string) {
  const saved = await readSave<{ autoFreeSupport?: unknown } | null>(
    ex, userId, COOP_PREFERENCES_KEY, null,
  );
  return { autoFreeSupport: saved?.autoFreeSupport === true };
}
