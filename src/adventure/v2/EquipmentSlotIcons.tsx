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

// 활 — 오른쪽으로 휜 활대, 곧은 시위, 오른쪽을 향해 메긴 화살.
export const BowIcon = forwardRef<SVGSVGElement, IconProps>(function BowIcon(
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
  const strokeWidth = strokeWidthForWeight(weight) + 4;

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
        d="M88 28C200 60 200 196 88 228"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M88 28v200"
        stroke="currentColor"
        strokeWidth={strokeWidth - 8}
        strokeLinecap="round"
        opacity={weight === "duotone" ? 0.45 : 1}
      />
      <path
        d="M36 128h196M196 92l36 36-36 36"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});

// 단검 — 대검(Sword)보다 짧고 끝이 뾰족한 날, 가드와 짧은 손잡이. 대검과 같은 대각선 방향.
export const DaggerIcon = forwardRef<SVGSVGElement, IconProps>(
  function DaggerIcon(
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
    const strokeWidth = strokeWidthForWeight(weight) + 4;
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
        <g transform="rotate(45 128 128)">
          <path
            d="M100 140V72l28-56 28 56v68Z"
            fill="currentColor"
            fillOpacity={filled ? 1 : weight === "duotone" ? 0.2 : 0}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
          <path
            d="M72 148h112"
            stroke="currentColor"
            strokeWidth={strokeWidth + 4}
            strokeLinecap="round"
          />
          <rect
            x="114"
            y="158"
            width="28"
            height="62"
            rx="10"
            fill="currentColor"
            fillOpacity={filled ? 1 : weight === "duotone" ? 0.2 : 0}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </g>
      </svg>
    );
  },
);
