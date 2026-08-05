"use client";

import { useCallback, useRef, useState } from "react";
import {
  useRemoteSave,
  useSavedValue,
} from "@/lib/storage/SaveProvider";
import {
  STORY_FLAGS_STORAGE_KEY,
  readStoryFlagsState,
  type StoryFlagsState,
} from "./storage";

// SaveProvider 의 initial 데이터는 로그인 직후 서버 스냅샷이다. 클라이언트 라우팅으로
// 화면만 언마운트·재마운트하면 그 스냅샷은 갱신되지 않으므로, 현재 RemoteSave 세션별로
// 가장 최근 플래그를 보관한다. 새 로그인/새로고침은 RemoteSave 객체도 새로 생겨 섞이지 않는다.
const storyFlagsBySaveSession = new WeakMap<object, StoryFlagsState>();

export function readStoryFlagsForSaveSession(
  saveSession: object,
  initial: unknown,
): StoryFlagsState {
  const cached = storyFlagsBySaveSession.get(saveSession);
  if (cached) return cached;
  const parsed = readStoryFlagsState(initial);
  storyFlagsBySaveSession.set(saveSession, parsed);
  return parsed;
}

export function rememberStoryFlagsForSaveSession(
  saveSession: object,
  state: StoryFlagsState,
): void {
  storyFlagsBySaveSession.set(saveSession, state);
}

export function useStoryFlags() {
  const initial = useSavedValue(STORY_FLAGS_STORAGE_KEY);
  const remote = useRemoteSave();
  const [state, setReactState] = useState<StoryFlagsState>(() =>
    readStoryFlagsForSaveSession(remote, initial),
  );
  const stateRef = useRef(state);

  const updateState = useCallback(
    (update: (previous: StoryFlagsState) => StoryFlagsState) => {
      const previous = stateRef.current;
      const next = update(previous);
      if (next === previous) return;
      stateRef.current = next;
      rememberStoryFlagsForSaveSession(remote, next);
      remote.patch(STORY_FLAGS_STORAGE_KEY, next);
      setReactState(next);
    },
    [remote],
  );

  const has = useCallback(
    (id: string) => state.flags.includes(id),
    [state.flags],
  );

  const set = useCallback((id: string) => {
    updateState((prev) =>
      prev.flags.includes(id) ? prev : { flags: [...prev.flags, id] },
    );
  }, [updateState]);

  const remove = useCallback((id: string) => {
    updateState((prev) =>
      prev.flags.includes(id)
        ? { flags: prev.flags.filter((f) => f !== id) }
        : prev,
    );
  }, [updateState]);

  // prefix 로 시작하는 모든 플래그 제거 — 튜토리얼 "다시 보기" 같은 일괄 reset 용.
  const removeWithPrefix = useCallback((prefix: string) => {
    updateState((prev) => {
      const next = prev.flags.filter((f) => !f.startsWith(prefix));
      return next.length === prev.flags.length ? prev : { flags: next };
    });
  }, [updateState]);

  // 서버 권위 액션 (NPC 대화 보상 등) 의 응답으로 받은 storyFlags.v2 통째 교체.
  const replaceFromSaved = useCallback((raw: unknown) => {
    updateState(() => readStoryFlagsState(raw));
  }, [updateState]);

  return { state, has, set, remove, removeWithPrefix, replaceFromSaved };
}
