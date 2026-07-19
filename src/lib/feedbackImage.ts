export const FEEDBACK_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const FEEDBACK_IMAGE_MAX_DIMENSION = 4096;
export const FEEDBACK_IMAGE_OUTPUT_MAX_DIMENSION = 1600;
export const FEEDBACK_IMAGE_STORAGE_PREFIX = "feedback-images";

const FEEDBACK_IMAGE_OBJECT_KEY =
  /^feedback-images\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.webp$/;

export function normalizeFeedbackImageObjectKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return FEEDBACK_IMAGE_OBJECT_KEY.test(trimmed) ? trimmed : null;
}
