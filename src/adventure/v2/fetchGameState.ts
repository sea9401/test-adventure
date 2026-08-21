type ResponseFetcher = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export function createInFlightResponseFetcher(fetcher: ResponseFetcher) {
  const inFlight = new Map<string, Promise<Response>>();

  return async (input: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method?.toUpperCase() ?? "GET";
    if (method !== "GET" || init?.signal) {
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

const fetchInFlightResponse = createInFlightResponseFetcher((input, init) =>
  fetch(input, init),
);

export function fetchGameState(init?: RequestInit) {
  return fetchInFlightResponse("/api/v2/me/state", init);
}
