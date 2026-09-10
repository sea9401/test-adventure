type ResponseFetcher = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

const GAME_STATE_URL = "/api/v2/me/state";
const GAME_STATE_CORE_URL = `${GAME_STATE_URL}?view=core`;

function canShareRequest(init?: RequestInit): boolean {
  const method = init?.method?.toUpperCase() ?? "GET";
  return method === "GET" && !init?.signal;
}

export function createInFlightResponseFetcher(fetcher: ResponseFetcher) {
  const inFlight = new Map<string, Promise<Response>>();

  return async (input: string, init?: RequestInit): Promise<Response> => {
    if (!canShareRequest(init)) {
      return fetcher(input, init);
    }

    let pending = inFlight.get(input);
    if (!pending) {
      pending = fetcher(input, init);
      inFlight.set(input, pending);
      const clear = () => {
        if (inFlight.get(input) === pending) inFlight.delete(input);
      };
      void pending.then(clear, clear);
    }
    return (await pending).clone();
  };
}

export function createGameStateFetchCoordinator(fetcher: ResponseFetcher) {
  const inFlight = new Map<string, Promise<Response>>();

  const sharedGet = async (
    input: string,
    init?: RequestInit,
  ): Promise<Response> => {
    if (!canShareRequest(init)) return fetcher(input, init);

    let pending = inFlight.get(input);
    if (!pending) {
      pending = fetcher(input, init);
      inFlight.set(input, pending);
      const clear = () => {
        if (inFlight.get(input) === pending) inFlight.delete(input);
      };
      void pending.then(clear, clear);
    }
    return (await pending).clone();
  };

  return {
    invalidate() {
      inFlight.clear();
    },
    fetchFull(init?: RequestInit) {
      return sharedGet(GAME_STATE_URL, init);
    },
    async fetchCore(init?: RequestInit) {
      if (!canShareRequest(init)) return fetcher(GAME_STATE_CORE_URL, init);

      // Parent provider와 자식 화면 effect가 같은 commit에서 시작될 때 자식의
      // full 조회가 등록될 한 microtask를 양보한다.
      await Promise.resolve();
      const full = inFlight.get(GAME_STATE_URL);
      if (full) return (await full).clone();
      return sharedGet(GAME_STATE_CORE_URL, init);
    },
  };
}

const gameStateFetchCoordinator = createGameStateFetchCoordinator(
  (input, init) => fetch(input, init),
);

export function fetchGameState(init?: RequestInit) {
  return gameStateFetchCoordinator.fetchFull(init);
}

export function fetchCoreGameState(init?: RequestInit) {
  return gameStateFetchCoordinator.fetchCore(init);
}

export function invalidateGameStateRequests() {
  gameStateFetchCoordinator.invalidate();
}
