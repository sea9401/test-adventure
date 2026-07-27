"use client";

import { useEffect, useRef, useState } from "react";
import {
  getProfileBorderVariant,
  type ProfileBorderId,
} from "@/adventure/data/v2/museunCosmetics";

const PROFILE_PARTICLE_SLOTS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
const STORM_RAIN_SLOTS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n"];
const FROZEN_DECORATION_CLASSES = [
  "ui-frozen-frost ui-frozen-frost--a",
  "ui-frozen-frost ui-frozen-frost--b",
  ...PROFILE_PARTICLE_SLOTS.map(
    (slot) => `ui-frozen-crystal ui-profile-particle-slot--${slot}`,
  ),
];
const STORM_DECORATION_CLASSES = [
  "ui-storm-lightning ui-storm-lightning--a",
  "ui-storm-lightning ui-storm-lightning--b",
  ...STORM_RAIN_SLOTS.map((slot) => `ui-storm-rain ui-storm-rain--${slot}`),
];
const CELESTIAL_DECORATION_CLASSES = [
  "ui-celestial-halo",
  "ui-celestial-star-map",
  "ui-celestial-comet ui-celestial-comet--a",
  "ui-celestial-comet ui-celestial-comet--b",
];

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
  celestial: CELESTIAL_DECORATION_CLASSES,
  obsidian: PROFILE_PARTICLE_SLOTS.map(
    (slot) => `ui-obsidian-cinder ui-profile-particle-slot--${slot}`,
  ),
  frozen: FROZEN_DECORATION_CLASSES,
  storm: STORM_DECORATION_CLASSES,
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
