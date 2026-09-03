import "server-only";

import { cookies } from "next/headers";
import {
  AGE_ELIGIBILITY_COOKIE,
  AGE_ELIGIBILITY_MAX_AGE_SECONDS,
  createAgeEligibilityToken,
  MINIMUM_SERVICE_AGE,
  verifyAgeEligibilityToken,
} from "@/lib/ageEligibility";

export {
  AGE_ELIGIBILITY_COOKIE,
  AGE_ELIGIBILITY_MAX_AGE_SECONDS,
  createAgeEligibilityToken,
  MINIMUM_SERVICE_AGE,
  verifyAgeEligibilityToken,
};

export async function hasValidAgeEligibilityCookie(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAgeEligibilityToken(
    cookieStore.get(AGE_ELIGIBILITY_COOKIE)?.value,
    process.env.AUTH_SECRET,
  );
}
