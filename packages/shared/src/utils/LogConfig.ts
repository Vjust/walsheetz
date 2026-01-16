/**
 * Log Configuration Module
 * Provides environment-aware log level control and component-specific filtering
 */

export const LogLevel: Record<string, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4,
};

interface DebugQuery {
  enabled: boolean;
  components: string[];
}

interface LogConfigState {
  globalLogLevel: number;
  globalLogLevelName: string | undefined;
  debugAllComponents: boolean;
  debugComponents: string[];
  queryOverride: DebugQuery | null;
  envComponents: string[];
}

declare global {
  interface Window {
    walSheetzLogConfig: LogConfig;
  }
}

function parseDebugQueryParam(): DebugQuery | null {
  if (typeof window === 'undefined' || typeof URLSearchParams === 'undefined') {
    return null;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const debugParam = params.get('debug');

    if (!debugParam) return null;

    if (debugParam === 'true' || debugParam === '1') {
      return { enabled: true, components: [] };
    }

    const components = debugParam
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    return { enabled: true, components };
  } catch {
    return null;
  }
}

function getDebugComponentsFromEnv(): string[] {
  const envComponents = (import.meta as { env?: { VITE_DEBUG_COMPONENTS?: string } }).env
    ?.VITE_DEBUG_COMPONENTS;
  if (!envComponents) return [];
  return envComponents
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

class LogConfig {
  private globalLogLevel: number;
  private debugQuery: DebugQuery | null;
  private envDebugComponents: string[];
  private debugComponents: Set<string>;
  private debugAllComponents: boolean;

  constructor() {
    const meta = import.meta as {
      env?: { MODE?: string; PROD?: boolean; VITE_LOG_LEVEL?: string };
    };
    const isProduction = meta.env?.PROD === true;

    const defaultLevel = isProduction ? LogLevel.ERROR : LogLevel.WARN;
    const envLogLevel = meta.env?.VITE_LOG_LEVEL?.toUpperCase();
    this.globalLogLevel =
      envLogLevel && LogLevel[envLogLevel] !== undefined ? LogLevel[envLogLevel] : defaultLevel;

    this.debugQuery = parseDebugQueryParam();
    this.envDebugComponents = getDebugComponentsFromEnv();

    const queryComponents = this.debugQuery?.components || [];
    this.debugComponents = new Set([...this.envDebugComponents, ...queryComponents]);
    this.debugAllComponents = !!(
      this.debugQuery?.enabled && this.debugQuery.components.length === 0
    );

    const isDevelopment = meta.env?.MODE === 'development';
    if (isDevelopment && typeof console !== 'undefined') {
      console.log('LogConfig initialized:', {
        globalLevel: Object.keys(LogLevel).find((k) => LogLevel[k] === this.globalLogLevel),
        debugAllComponents: this.debugAllComponents,
        debugComponents: Array.from(this.debugComponents),
      });
    }
  }

  shouldLog(level: number): boolean {
    return level >= this.globalLogLevel;
  }

  isDebugEnabled(component: string): boolean {
    if (this.debugAllComponents) return true;
    return this.debugComponents.has(component);
  }

  getGlobalLogLevel(): number {
    return this.globalLogLevel;
  }

  setGlobalLogLevel(level: number): void {
    const levelName = Object.keys(LogLevel).find((k) => LogLevel[k] === level);
    if (levelName) {
      this.globalLogLevel = level;
      if (typeof console !== 'undefined') {
        console.log('LogConfig: Global log level changed to', levelName);
      }
    }
  }

  enableDebugForComponents(...components: string[]): void {
    components.forEach((c) => this.debugComponents.add(c));
    if (typeof console !== 'undefined') {
      console.log('LogConfig: Debug enabled for components', components);
    }
  }

  disableDebugForComponents(...components: string[]): void {
    components.forEach((c) => this.debugComponents.delete(c));
    if (typeof console !== 'undefined') {
      console.log('LogConfig: Debug disabled for components', components);
    }
  }

  enableDebugForAll(): void {
    this.debugAllComponents = true;
    if (typeof console !== 'undefined') {
      console.log('LogConfig: Debug enabled for ALL components');
    }
  }

  disableDebugForAll(): void {
    this.debugAllComponents = false;
    this.debugComponents.clear();
    if (typeof console !== 'undefined') {
      console.log('LogConfig: Debug disabled for ALL components');
    }
  }

  getConfig(): LogConfigState {
    return {
      globalLogLevel: this.globalLogLevel,
      globalLogLevelName: Object.keys(LogLevel).find((k) => LogLevel[k] === this.globalLogLevel),
      debugAllComponents: this.debugAllComponents,
      debugComponents: Array.from(this.debugComponents),
      queryOverride: this.debugQuery,
      envComponents: this.envDebugComponents,
    };
  }
}

export const logConfig = new LogConfig();
export { LogConfig };

// Expose globally for debugging (DEV only)
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  window.walSheetzLogConfig = logConfig;
}
