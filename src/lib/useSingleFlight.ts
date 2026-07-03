import { useCallback, useRef } from "react";

// 같은 클라이언트 액션이 React state 반영 전에 연속 실행되는 것을 막는 작은 guard.
// 반환된 release 는 반드시 finally 에서 호출한다.
export function useSingleFlightGuard() {
  const inFlightRef = useRef(false);

  return useCallback((): (() => void) | null => {
    if (inFlightRef.current) return null;
    inFlightRef.current = true;
    return () => {
      inFlightRef.current = false;
    };
  }, []);
}
