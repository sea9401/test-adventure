"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

export function JobRoadmapScroller({ children }: { children: ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: number; x: number; left: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const move = (direction: -1 | 1) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({
      left: direction * Math.max(320, scroller.clientWidth * 0.75),
      behavior: "smooth",
    });
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || event.button !== 0) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      left: scroller.scrollLeft,
    };
    scroller.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const scroller = scrollerRef.current;
    if (!drag || !scroller || drag.id !== event.pointerId) return;
    scroller.scrollLeft = drag.left - (event.clientX - drag.x);
    event.preventDefault();
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    if (
      scroller &&
      dragRef.current?.id === event.pointerId &&
      scroller.hasPointerCapture(event.pointerId)
    ) {
      scroller.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <div className="manual-job-roadmap-wrap">
      <div className="manual-job-roadmap-controls" aria-hidden={false}>
        <button
          type="button"
          className="manual-job-roadmap-button"
          aria-label="왼쪽으로 이동"
          onClick={() => move(-1)}
        >
          <CaretLeft size={15} weight="bold" />
        </button>
        <button
          type="button"
          className="manual-job-roadmap-button"
          aria-label="오른쪽으로 이동"
          onClick={() => move(1)}
        >
          <CaretRight size={15} weight="bold" />
        </button>
      </div>
      <div
        ref={scrollerRef}
        className={`manual-job-roadmap rounded-md border border-zinc-200 bg-zinc-950 p-4 dark:border-zinc-800 ${
          dragging ? "is-dragging" : ""
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      >
        {children}
      </div>
    </div>
  );
}
