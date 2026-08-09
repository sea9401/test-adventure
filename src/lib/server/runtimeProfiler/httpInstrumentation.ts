import { Server } from "node:http";
import type { ProfilerAggregator } from "./aggregate";
import { classifyRequestPath } from "./routeClassifier";
import {
  createRequestProfile,
  runWithRequestProfile,
} from "./requestContext";

const HTTP_INSTRUMENTED = Symbol.for(
  "adventure.runtimeProfiler.httpInstrumented",
);

type RequestLike = {
  method?: string;
  url?: string;
  socket?: { bytesWritten?: number };
};

type ResponseLike = {
  statusCode?: number;
  writableFinished?: boolean;
  socket?: { bytesWritten?: number } | null;
  once(event: "finish" | "close", listener: () => void): unknown;
};

type ServerPrototypeLike = {
  emit(eventName: string | symbol, ...args: unknown[]): boolean;
  [HTTP_INSTRUMENTED]?: boolean;
};

type HttpInstrumentationOptions = {
  serverPrototype?: ServerPrototypeLike;
  nowNs?: () => bigint;
  onError?: (error: unknown) => void;
};

function bytesWritten(socket: RequestLike["socket"]): number {
  const value = socket?.bytesWritten;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function installHttpRequestInstrumentation(
  aggregator: ProfilerAggregator,
  options: HttpInstrumentationOptions = {},
): boolean {
  const serverPrototype =
    options.serverPrototype ??
    (Server.prototype as unknown as ServerPrototypeLike);
  if (serverPrototype[HTTP_INSTRUMENTED]) return false;

  const originalEmit = serverPrototype.emit;
  const nowNs = options.nowNs ?? process.hrtime.bigint;

  serverPrototype.emit = function instrumentedEmit(
    eventName: string | symbol,
    ...args: unknown[]
  ): boolean {
    if (eventName !== "request") {
      return originalEmit.call(this, eventName, ...args);
    }

    let requestDispatched = false;
    try {
      const request = args[0] as RequestLike | undefined;
      const response = args[1] as ResponseLike | undefined;
      if (!request || !response || typeof response.once !== "function") {
        return originalEmit.call(this, eventName, ...args);
      }

      const profile = createRequestProfile({
        feature: classifyRequestPath(request.url ?? "/"),
        method: request.method?.toUpperCase() ?? "UNKNOWN",
        startedAtNs: nowNs(),
        socketBytesAtStart: bytesWritten(request.socket),
      });
      let recorded = false;
      const finish = (aborted: boolean): void => {
        if (recorded) return;
        recorded = true;
        try {
          const durationMs =
            Number(nowNs() - profile.startedAtNs) / 1_000_000;
          const responseByteCount = Math.max(
            0,
            bytesWritten(response.socket ?? request.socket) -
              profile.socketBytesAtStart,
          );
          aggregator.recordRequest({
            feature: profile.feature,
            method: profile.method,
            statusCode: response.statusCode ?? 0,
            durationMs,
            responseBytes: responseByteCount,
            database: profile.database,
            aborted,
          });
        } catch (error) {
          options.onError?.(error);
        }
      };

      response.once("finish", () => finish(false));
      response.once("close", () => finish(response.writableFinished !== true));
      requestDispatched = true;
      return runWithRequestProfile(profile, () =>
        originalEmit.call(this, eventName, ...args),
      );
    } catch (error) {
      if (requestDispatched) throw error;
      options.onError?.(error);
      return originalEmit.call(this, eventName, ...args);
    }
  };
  serverPrototype[HTTP_INSTRUMENTED] = true;
  return true;
}
