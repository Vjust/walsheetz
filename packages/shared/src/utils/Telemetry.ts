import { logger, LogComponent } from "./Logger.js";

const TelemetryLogLevel = {
  info: 'info',
  warn: 'warn',
  error: 'error'
};

export function recordTelemetry(event: string, metadata: Record<string, unknown> = {}, level = TelemetryLogLevel.info) {
  const payload = {
    event,
    timestamp: Date.now(),
    ...metadata
  };

  switch (level) {
    case TelemetryLogLevel.warn:
      logger.warn(LogComponent.PERFORMANCE, `telemetry_${event}`, 'Telemetry warning event', payload);
      break;
    case TelemetryLogLevel.error:
      logger.error(LogComponent.PERFORMANCE, `telemetry_${event}`, 'Telemetry error event', payload);
      break;
    default:
      logger.info(LogComponent.PERFORMANCE, `telemetry_${event}`, 'Telemetry event recorded', payload);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('telemetry:event', { detail: payload }));
  }

  return payload;
}

export { TelemetryLogLevel };