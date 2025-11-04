/**
 * Log Configuration Module
 * Provides environment-aware log level control and component-specific filtering
 */

export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4
};

/**
 * Parse query parameters for debug overrides
 * Supports: ?debug=true or ?debug=COMPONENT_NAME or ?debug=COMP1,COMP2
 */
function parseDebugQueryParam() {
  if (typeof window === 'undefined' || typeof URLSearchParams === 'undefined') {
    return null;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const debugParam = params.get('debug');

    if (!debugParam) {
      return null;
    }

    // ?debug=true - enable all debug logging
    if (debugParam === 'true' || debugParam === '1') {
      return { enabled: true, components: [] };
    }

    // ?debug=COMPONENT or ?debug=COMP1,COMP2
    const components = debugParam.split(',').map(c => c.trim()).filter(Boolean);
    return { enabled: true, components };
  } catch (error) {
    return null;
  }
}

/**
 * Get debug components from environment variable
 * Supports: VITE_DEBUG_COMPONENTS=BLOCKCHAIN_ADAPTER,STORAGE_SERVICE
 */
function getDebugComponentsFromEnv() {
  const envComponents = import.meta.env?.VITE_DEBUG_COMPONENTS;
  if (!envComponents) {
    return [];
  }
  return envComponents.split(',').map(c => c.trim()).filter(Boolean);
}

class LogConfig {
  constructor() {
    // Determine default log level based on environment
    const isDevelopment = import.meta.env?.MODE === 'development';
    const isProduction = import.meta.env?.PROD === true;

    // Default: WARN in dev, ERROR in production
    const defaultLevel = isProduction ? LogLevel.ERROR : LogLevel.WARN;

    // Read from environment variable VITE_LOG_LEVEL
    const envLogLevel = import.meta.env?.VITE_LOG_LEVEL?.toUpperCase();
    this.globalLogLevel = envLogLevel && LogLevel[envLogLevel] !== undefined
      ? LogLevel[envLogLevel]
      : defaultLevel;

    // Parse query parameter overrides
    this.debugQuery = parseDebugQueryParam();

    // Get component-specific debug flags from env
    this.envDebugComponents = getDebugComponentsFromEnv();

    // Merge query and env components
    const queryComponents = this.debugQuery?.components || [];
    this.debugComponents = new Set([...this.envDebugComponents, ...queryComponents]);

    // If query param is ?debug=true, enable debug globally
    this.debugAllComponents = this.debugQuery?.enabled && this.debugQuery.components.length === 0;

    // Log configuration on initialization (only in dev)
    if (isDevelopment && typeof console !== 'undefined') {
      console.log('🔧 LogConfig initialized:', {
        globalLevel: Object.keys(LogLevel).find(k => LogLevel[k] === this.globalLogLevel),
        debugAllComponents: this.debugAllComponents,
        debugComponents: Array.from(this.debugComponents),
        queryOverride: this.debugQuery,
        envComponents: this.envDebugComponents
      });
    }
  }

  /**
   * Check if a specific log level should be logged
   * @param {number} level - LogLevel to check
   * @returns {boolean}
   */
  shouldLog(level) {
    return level >= this.globalLogLevel;
  }

  /**
   * Check if debug logging is enabled for a specific component
   * @param {string} component - Component name (e.g., 'BLOCKCHAIN_ADAPTER')
   * @returns {boolean}
   */
  isDebugEnabled(component) {
    // If debug all is enabled, return true
    if (this.debugAllComponents) {
      return true;
    }

    // Check if this component is in the debug list
    return this.debugComponents.has(component);
  }

  /**
   * Get current global log level
   * @returns {number}
   */
  getGlobalLogLevel() {
    return this.globalLogLevel;
  }

  /**
   * Dynamically update global log level
   * @param {number} level - New log level
   */
  setGlobalLogLevel(level) {
    if (LogLevel[Object.keys(LogLevel).find(k => LogLevel[k] === level)]) {
      this.globalLogLevel = level;
      if (typeof console !== 'undefined') {
        console.log('🔧 LogConfig: Global log level changed to',
          Object.keys(LogLevel).find(k => LogLevel[k] === level));
      }
    }
  }

  /**
   * Enable debug logging for specific components
   * @param {...string} components - Component names to enable
   */
  enableDebugForComponents(...components) {
    components.forEach(c => this.debugComponents.add(c));
    if (typeof console !== 'undefined') {
      console.log('🔧 LogConfig: Debug enabled for components', components);
    }
  }

  /**
   * Disable debug logging for specific components
   * @param {...string} components - Component names to disable
   */
  disableDebugForComponents(...components) {
    components.forEach(c => this.debugComponents.delete(c));
    if (typeof console !== 'undefined') {
      console.log('🔧 LogConfig: Debug disabled for components', components);
    }
  }

  /**
   * Enable debug for all components
   */
  enableDebugForAll() {
    this.debugAllComponents = true;
    if (typeof console !== 'undefined') {
      console.log('🔧 LogConfig: Debug enabled for ALL components');
    }
  }

  /**
   * Disable debug for all components
   */
  disableDebugForAll() {
    this.debugAllComponents = false;
    this.debugComponents.clear();
    if (typeof console !== 'undefined') {
      console.log('🔧 LogConfig: Debug disabled for ALL components');
    }
  }

  /**
   * Get current configuration as object
   * @returns {object}
   */
  getConfig() {
    return {
      globalLogLevel: this.globalLogLevel,
      globalLogLevelName: Object.keys(LogLevel).find(k => LogLevel[k] === this.globalLogLevel),
      debugAllComponents: this.debugAllComponents,
      debugComponents: Array.from(this.debugComponents),
      queryOverride: this.debugQuery,
      envComponents: this.envDebugComponents
    };
  }
}

// Export singleton instance
export const logConfig = new LogConfig();

// Export for testing and advanced usage
export { LogConfig };

// Global access for debugging in browser console
if (typeof window !== 'undefined') {
  window.walSheetzLogConfig = logConfig;
}
