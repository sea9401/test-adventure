import { forwardRef } from "react";
import type { IconProps } from "@phosphor-icons/react";

function strokeWidthForWeight(weight: IconProps["weight"]): number {
  if (weight === "thin") return 6;
  if (weight === "light") return 9;
  if (weight === "bold") return 16;
  return 12;
}

export const RingIcon = forwardRef<SVGSVGElement, IconProps>(function RingIcon(
  {
    alt,
    color = "currentColor",
    size = "1em",
    weight = "regular",
    mirrored = false,
    ...props
  },
  ref,
) {
  const strokeWidth = strokeWidthForWeight(weight);
  const filled = weight === "fill";

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="none"
      color={color}
      transform={mirrored ? "scale(-1, 1)" : undefined}
      aria-hidden={alt ? undefined : true}
      {...props}
    >
      {alt ? <title>{alt}</title> : null}
      <circle
        cx="128"
        cy="162"
        r="62"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
      {!filled ? (
        <circle
          cx="128"
          cy="162"
          r="38"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          opacity={weight === "duotone" ? 0.35 : 1}
        />
      ) : null}
      <path
        d="m88 73 22-35h36l22 35-40 43Z"
        fill="currentColor"
        fillOpacity={filled ? 1 : weight === "duotone" ? 0.28 : 0}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path
        d="m91 75 37-20 37 20M110 38l18 17 18-17"
        stroke={filled ? "white" : "currentColor"}
        strokeWidth={Math.max(5, strokeWidth - 4)}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={filled ? 0.7 : 1}
      />
    </svg>
  );
});

export const NecklaceIcon = forwardRef<SVGSVGElement, IconProps>(
  function NecklaceIcon(
    {
      alt,
      color = "currentColor",
      size = "1em",
      weight = "regular",
      mirrored = false,
      ...props
    },
    ref,
  ) {
    const strokeWidth = strokeWidthForWeight(weight);
    const filled = weight === "fill";

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 256 256"
        width={size}
        height={size}
        fill="none"
        color={color}
        transform={mirrored ? "scale(-1, 1)" : undefined}
        aria-hidden={alt ? undefined : true}
        {...props}
      >
        {alt ? <title>{alt}</title> : null}
        <path
          d="M45 42c5 78 32 119 83 133 51-14 78-55 83-133"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <path
          d="M128 151 91 194l37 42 37-42Z"
          fill="currentColor"
          fillOpacity={filled ? 1 : weight === "duotone" ? 0.28 : 0}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
        <path
          d="m94 194 34-18 34 18M128 176v55"
          stroke={filled ? "white" : "currentColor"}
          strokeWidth={Math.max(5, strokeWidth - 4)}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={filled ? 0.7 : 1}
        />
      </svg>
    );
  },
);
