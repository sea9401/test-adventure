import { SURFACE_INSET } from "@/components/ui/surfaces";
import type { DangerousFishingFeedback } from "./dangerousFishingFeedback";

const TONE_CLASS: Record<DangerousFishingFeedback["tone"], string> = {
  info: "border-sky-300 text-sky-800 dark:border-sky-800 dark:text-sky-200",
  success:
    "border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-200",
  warning:
    "border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-200",
  danger:
    "border-rose-300 text-rose-800 dark:border-rose-800 dark:text-rose-200",
};

export function DangerousFishingFeedbackCard({
  feedback,
}: {
  feedback: DangerousFishingFeedback;
}) {
  return (
    <div
      aria-live="polite"
      className={`${SURFACE_INSET} ${TONE_CLASS[feedback.tone]} space-y-1 border-2 p-3`}
    >
      <p className="text-sm font-bold">{feedback.title}</p>
      <p className="text-xs leading-5">{feedback.detail}</p>
    </div>
  );
}
