"use client";

import { useCallback, useState } from "react";
import { useSavedValue } from "@/lib/storage/SaveProvider";
import { useRemotePatch } from "@/lib/storage/useRemotePatch";
import {
  STORY_FLAGS_STORAGE_KEY,
  readStoryFlagsState,
  type StoryFlagsState,
} from "./storage";

export function useStoryFlags() {
  const initial = useSavedValue(STORY_FLAGS_STORAGE_KEY);
  const [state, setState] = useState<StoryFlagsState>(() =>
    readStoryFlagsState(initial),
  );
  useRemotePatch(STORY_FLAGS_STORAGE_KEY, state);

  const has = useCallback(
    (id: string) => state.flags.includes(id),
    [state.flags],
  );

  const set = useCallback((id: string) => {
    setState((prev) =>
      prev.flags.includes(id) ? prev : { flags: [...prev.flags, id] },
    );
  }, []);

  const remove = useCallback((id: string) => {
    setState((prev) =>
      prev.flags.includes(id)
        ? { flags: prev.flags.filter((f) => f !== id) }
        : prev,
    );
  }, []);

  // prefix 로 시작하는 모든 플래그 제거 — 튜토리얼 "다시 보기" 같은 일괄 reset 용.
  const removeWithPrefix = useCallback((prefix: string) => {
    setState((prev) => {
      const next = prev.flags.filter((f) => !f.startsWith(prefix));
      return next.length === prev.flags.length ? prev : { flags: next };
    });
  }, []);

  // 서버 권위 액션 (NPC 대화 보상 등) 의 응답으로 받은 storyFlags.v2 통째 교체.
  const replaceFromSaved = useCallback((raw: unknown) => {
    setState(readStoryFlagsState(raw));
  }, []);

  return { state, has, set, remove, removeWithPrefix, replaceFromSaved };
}
