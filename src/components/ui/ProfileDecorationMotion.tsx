"use client";

import { useEffect, useRef, useState } from "react";
import {
  getProfileBorderVariant,
  type ProfileBorderId,
} from "@/adventure/data/v2/museunCosmetics";

const PROFILE_PARTICLE_CLASSES = {
  infernal: ["a", "b", "c", "d", "e", "f", "g", "h"].map(
    (slot) => `ui-infernal-ember ui-infernal-ember--${slot}`,
  ),
  oceanic: ["a", "b", "c", "d", "e", "f", "g", "h"].map(
    (slot) => `ui-oceanic-bubble ui-oceanic-bubble--${slot}`,
  ),
  verdant: ["a", "b", "c", "d", "e", "f", "g", "h"].map(
    (slot) => `ui-verdant-leaf ui-verdant-leaf--fall-${slot}`,
  ),
  rose: ["a", "b", "c", "d", "e", "f", "g", "h"].map(
    (slot) => `ui-rose-petal ui-rose-petal--${slot}`,
  ),
} as const satisfies Partial<Record<ProfileBorderId, readonly string[]>>;

export function ProfileDecorationMotion({
  profileBorder,
}: {
  profileBorder: ProfileBorderId | null | undefined;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [isVisible, setIsVisible] = useState(true);
  const particleClasses = profileBorder
    ? PROFILE_PARTICLE_CLASSES[
        profileBorder as keyof typeof PROFILE_PARTICLE_CLASSES
      ]
    : undefined;
  const isAnimated = profileBorder
    ? getProfileBorderVariant(profileBorder)?.motion === "animated"
    : false;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry?.isIntersecting ?? false);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [isAnimated]);

  if (!profileBorder || !isAnimated) return null;

  return (
    <span
      ref={containerRef}
      className={`ui-profile-decoration-motion ui-profile-decoration-motion--${profileBorder}${isVisible ? "" : " ui-profile-decoration-motion--paused"}`}
      aria-hidden="true"
    >
      {particleClasses?.map((className) => (
        <span key={className} className={className} />
      ))}
    </span>
  );
}
