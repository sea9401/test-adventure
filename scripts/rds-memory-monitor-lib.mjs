export function decideRdsMonitorAction({
  reading,
  previous,
  thresholdBytes,
  nowMs,
  cooldownMs,
}) {
  const previousStatus = ["ok", "alert", "monitor_error"].includes(
    previous?.status,
  )
    ? previous.status
    : "ok";
  const previousAlertedAtMs = Number.isFinite(previous?.alertedAtMs)
    ? previous.alertedAtMs
    : 0;

  if (reading.kind === "error") {
    const notify =
      previousStatus !== "monitor_error" ||
      nowMs - previousAlertedAtMs >= cooldownMs;
    return {
      kind: "monitor_error",
      notify,
      notifyRecovery: false,
      detail: reading.detail,
      nextState: {
        status: "monitor_error",
        alertedAtMs: notify ? nowMs : previousAlertedAtMs,
      },
    };
  }

  if (reading.bytes < thresholdBytes) {
    const notify =
      previousStatus !== "alert" || nowMs - previousAlertedAtMs >= cooldownMs;
    return {
      kind: "low_memory",
      notify,
      notifyRecovery: false,
      freeableBytes: reading.bytes,
      nextState: {
        status: "alert",
        alertedAtMs: notify ? nowMs : previousAlertedAtMs,
      },
    };
  }

  return {
    kind: "ok",
    notify: false,
    notifyRecovery: previousStatus === "alert" || previousStatus === "monitor_error",
    freeableBytes: reading.bytes,
    nextState: { status: "ok", alertedAtMs: 0 },
  };
}
