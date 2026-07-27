"use client";

import { useEffect, useRef, useState } from "react";
import {
  getProfileBorderVariant,
  type ProfileBorderId,
} from "@/adventure/data/v2/museunCosmetics";

const PROFILE_PARTICLE_SLOTS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

const PROFILE_PARTICLE_CLASSES = {
  prismatic: PROFILE_PARTICLE_SLOTS.map(
    (slot) => `ui-prismatic-glint ui-profile-particle-slot--${slot}`,
  ),
  infernal: PROFILE_PARTICLE_SLOTS.map(
    (slot) => `ui-infernal-ember ui-infernal-ember--${slot}`,
  ),
  oceanic: PROFILE_PARTICLE_SLOTS.map(
    (slot) => `ui-oceanic-bubble ui-oceanic-bubble--${slot}`,
  ),
  verdant: PROFILE_PARTICLE_SLOTS.map(
    (slot) => `ui-verdant-leaf ui-verdant-leaf--fall-${slot}`,
  ),
  obsidian: PROFILE_PARTICLE_SLOTS.map(
    (slot) => `ui-obsidian-cinder ui-profile-particle-slot--${slot}`,
  ),
  frozen: PROFILE_PARTICLE_SLOTS.map(
    (slot) => `ui-frozen-crystal ui-profile-particle-slot--${slot}`,
  ),
  storm: PROFILE_PARTICLE_SLOTS.map(
    (slot) => `ui-storm-spark ui-profile-particle-slot--${slot}`,
  ),
  rose: PROFILE_PARTICLE_SLOTS.map(
    (slot) => `ui-rose-petal ui-rose-petal--${slot}`,
  ),
  royal: PROFILE_PARTICLE_SLOTS.map(
    (slot) => `ui-royal-mote ui-profile-particle-slot--${slot}`,
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
