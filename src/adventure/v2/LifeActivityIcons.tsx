import type { SVGProps } from "react";
import type { WorldActivityKind } from "@/adventure/data/v2/worldRumors";

type LifeActivityIconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  kind: WorldActivityKind;
  title?: string;
};

const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 3,
} as const;

function FishingActivityGlyph() {
  return (
    <>
      <path d="M16 45c5-4 10-4 15 0s10 4 17 0" {...strokeProps} />
      <path d="M17 52c5-3 10-3 15 0s10 3 15 0" {...strokeProps} />
      <path d="M35 13v20c0 6-4 9-8 9-3 0-5-2-5-5" {...strokeProps} />
      <path d="m35 13 8 5" {...strokeProps} />
      <circle cx="22" cy="34" r="3" fill="currentColor" />
      <path d="M42 29c4-3 8-2 10 1-3 3-7 4-10 1l-3 2v-6l3 2Z" fill="currentColor" opacity="0.82" />
    </>
  );
}

function WoodcuttingActivityGlyph() {
  return (
    <>
      <path d="M19 43h22M23 49h14" {...strokeProps} />
      <path d="M31 15 20 33h8l-6 9h18l-6-9h8L31 15Z" fill="currentColor" opacity="0.2" />
      <path d="M31 15 20 33h8l-6 9h18l-6-9h8L31 15Z" {...strokeProps} />
      <path d="M31 42v9" {...strokeProps} />
      <path d="m43 15 8 8-18 18" {...strokeProps} />
      <path d="m44 14 8 8-1 5-12-12 5-1Z" fill="currentColor" opacity="0.82" />
    </>
  );
}

function MiningActivityGlyph() {
  return (
    <>
      <path d="m15 48 9-17 7 8 6-14 12 23H15Z" fill="currentColor" opacity="0.18" />
      <path d="m15 48 9-17 7 8 6-14 12 23" {...strokeProps} />
      <path d="M24 49h26" {...strokeProps} />
      <path d="M18 22c9-8 21-8 30 0" {...strokeProps} />
      <path d="m33 15 8 8-19 25" {...strokeProps} />
      <path d="m43 35 3-6 3 6-3 5-3-5Z" fill="currentColor" opacity="0.82" />
      <path d="m15 37 3-5 3 5-3 4-3-4Z" fill="currentColor" opacity="0.65" />
    </>
  );
}

export function LifeActivityIcon({
  kind,
  title,
  ...props
}: LifeActivityIconProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      data-life-activity-icon={kind}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {kind === "fishing" ? (
        <FishingActivityGlyph />
      ) : kind === "woodcutting" ? (
        <WoodcuttingActivityGlyph />
      ) : (
        <MiningActivityGlyph />
      )}
    </svg>
  );
}
