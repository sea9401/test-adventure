"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

const SLIDE_INTERVAL_MS = 6_000;

export const LANDING_SLIDES = [
  {
    src: "/images/ui/village.webp",
    label: "시작 마을",
    position: "center 48%",
  },
  { src: "/images/ui/battle.webp", label: "전투", position: "center" },
  { src: "/images/ui/fishing.webp", label: "낚시터", position: "center" },
  { src: "/images/ui/guild.webp", label: "길드", position: "center" },
  { src: "/images/ui/hunt.webp", label: "사냥터", position: "center" },
] as const;

export function nextAvailableSlideIndex(
  currentIndex: number,
  failedIndexes: ReadonlySet<number>,
): number {
  for (let offset = 1; offset <= LANDING_SLIDES.length; offset += 1) {
    const candidate = (currentIndex + offset) % LANDING_SLIDES.length;
    if (!failedIndexes.has(candidate)) return candidate;
  }
  return currentIndex;
}

export function LandingBackgroundSlideshow() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [cycleVersion, setCycleVersion] = useState(0);
  const failedIndexesRef = useRef(new Set<number>());

  useEffect(() => {
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleNext = () => {
      if (timer) clearTimeout(timer);
      if (motionPreference.matches || document.visibilityState === "hidden") {
        return;
      }
      timer = setTimeout(() => {
        setActiveIndex((current) =>
          nextAvailableSlideIndex(current, failedIndexesRef.current),
        );
      }, SLIDE_INTERVAL_MS);
    };

    const handleMotionChange = () => {
      if (motionPreference.matches) setActiveIndex(0);
      scheduleNext();
    };
    const handleVisibilityChange = () => scheduleNext();

    scheduleNext();
    motionPreference.addEventListener("change", handleMotionChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timer) clearTimeout(timer);
      motionPreference.removeEventListener("change", handleMotionChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeIndex, cycleVersion]);

  const activeSlide = LANDING_SLIDES[activeIndex];

  return (
    <section
      aria-label="게임 이미지 슬라이드"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div aria-hidden className="absolute inset-0 bg-zinc-950">
        {LANDING_SLIDES.map((slide, index) => (
          <div
            key={slide.src}
            className={`absolute inset-0 transition-opacity duration-1000 motion-reduce:transition-none ${
              index === activeIndex ? "opacity-100" : "opacity-0"
            }`}
            style={
              {
                "--landing-desktop-position": slide.position,
              } as CSSProperties
            }
          >
            <Image
              data-landing-image-layer="mobile-backdrop"
              src={slide.src}
              alt=""
              fill
              sizes="100vw"
              className="scale-110 object-cover brightness-[0.35] blur-xl sm:hidden"
              style={{ objectPosition: slide.position }}
            />
            <Image
              data-landing-image-layer="scene"
              src={slide.src}
              alt=""
              fill
              sizes="100vw"
              preload={index === 0}
              onError={() => {
                failedIndexesRef.current.add(index);
                if (index === activeIndex) {
                  setActiveIndex((current) =>
                    nextAvailableSlideIndex(current, failedIndexesRef.current),
                  );
                }
              }}
              className="object-contain object-top sm:object-cover sm:[object-position:var(--landing-desktop-position)]"
            />
          </div>
        ))}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/75 to-black/25" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/75" />
      </div>

      <div className="absolute right-5 bottom-6 text-right text-zinc-100 sm:right-10 sm:bottom-9">
        <strong className="block text-sm font-semibold drop-shadow-lg sm:text-base">
          {activeSlide.label}
        </strong>
        <span className="mt-1 block text-[11px] text-zinc-300 drop-shadow-lg sm:text-xs">
          게임에서 사용하는 지역 이미지
        </span>
        <div className="pointer-events-auto mt-1 flex justify-end">
          {LANDING_SLIDES.map((slide, index) => {
            const active = index === activeIndex;
            return (
              <button
                key={slide.src}
                type="button"
                aria-label={`${slide.label} 이미지 보기`}
                aria-current={active ? "true" : undefined}
                onClick={() => {
                  setActiveIndex(index);
                  setCycleVersion((version) => version + 1);
                }}
                className="group flex h-8 w-8 items-center justify-center"
              >
                <span
                  aria-hidden
                  className={`h-2 rounded-full shadow-sm transition-[width,background-color] motion-reduce:transition-none ${
                    active
                      ? "w-6 bg-amber-200"
                      : "w-2 bg-white/50 group-hover:bg-white/80"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
