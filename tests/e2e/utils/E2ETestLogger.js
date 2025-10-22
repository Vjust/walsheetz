/**
 * E2E Test Logger
 * Provides extensive, colorized logging for E2E tests with screenshots and performance metrics
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Background colors
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m'
};

const icons = {
  success: '✅',
  fail: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  test: '🧪',
  suite: '📦',
  action: '🖱️',
  keyboard: '⌨️',
  screenshot: '📸',
  video: '🎥',
  clock: '⏱️',
  setup: '🔧',
  execute: '🚀',
  result: '📊',
  browser: '🌐',
  accessibility: '♿',
  contrast: '🎨',
  focus: '🎯',
  aria: '🏷️',
  performance: '⚡',
  navigation: '🧭'
};

class E2ETestLogger {
  constructor() {
    this.useColors = process.env.FORCE_COLOR === '1' || process.env.E2E_LOG_COLORS !== 'false';
    this.useTimestamps = process.env.E2E_LOG_TIMESTAMPS !== 'false';
    this.logLevel = process.env.E2E_LOG_LEVEL || 'verbose';
    this.testStartTimes = new Map();
    this.screenshotCount = 0;
    this.currentSuite = null;
  }

  /**
   * Apply color to text
   */
  color(text, colorName) {
    if (!this.useColors) return text;
    const colorCode = colors[colorName] || colors.reset;
    return `${colorCode}${text}${colors.reset}`;
  }

  /**
   * Get formatted timestamp
   */
  timestamp() {
    if (!this.useTimestamps) return '';
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
    return this.color(`[${time}]`, 'gray');
  }

  /**
   * Format duration in milliseconds
   */
  formatDuration(ms) {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  /**
   * Log separator
   */
  separator(char = '━', color = 'cyan') {
    console.log(this.color(char.repeat(50), color));
  }

  /**
   * Suite start
   */
  suiteStart(suiteName) {
    this.currentSuite = suiteName;
    console.log('');
    this.separator('━', 'cyan');
    console.log(`${this.timestamp()} ${icons.suite} ${this.color(`Test Suite: ${suiteName}`, 'bright')}`);
    this.separator('━', 'cyan');
  }

  /**
   * Suite end
   */
  suiteEnd(suiteName, stats = {}) {
    console.log('');
    console.log(`${this.timestamp()} ${icons.result} ${this.color('Summary:', 'white')} ${stats.passed || 0} passed, ${stats.failed || 0} failed, ${stats.total || 0} total`);
    if (stats.duration) {
      console.log(`${this.timestamp()} ${icons.clock} ${this.color('Total time:', 'gray')} ${this.formatDuration(stats.duration)}`);
    }
    console.log('');
    this.separator('━', 'cyan');
  }

  /**
   * Test start
   */
  testStart(testName) {
    const testId = `${Date.now()}-${Math.random()}`;
    this.testStartTimes.set(testId, Date.now());

    console.log('');
    console.log(`${this.timestamp()} ${icons.test} ${this.color(testName, 'cyan')}`);
    console.log(`${this.timestamp()}   ${icons.clock} ${this.color('Start:', 'gray')} ${new Date().toISOString()}`);

    return testId;
  }

  /**
   * Test pass
   */
  testPass(testName, testId) {
    const duration = testId && this.testStartTimes.has(testId)
      ? Date.now() - this.testStartTimes.get(testId)
      : 0;

    if (testId) this.testStartTimes.delete(testId);

    console.log(`${this.timestamp()}   ${icons.clock} ${this.color('Duration:', 'gray')} ${this.formatDuration(duration)}`);
    console.log(`${this.timestamp()} ${icons.success} ${this.color('PASS', 'green')} ${this.color(`(${this.formatDuration(duration)})`, 'gray')}`);
    console.log(`${this.timestamp()}  ${this.color(' ', 'white')}`);
  }

  /**
   * Test fail
   */
  testFail(testName, error, context = {}, testId) {
    const duration = testId && this.testStartTimes.has(testId)
      ? Date.now() - this.testStartTimes.get(testId)
      : 0;

    if (testId) this.testStartTimes.delete(testId);

    console.log(`${this.timestamp()} ${icons.fail} ${this.color('FAIL:', 'red', 'bright')} ${testName}`);
    console.log(`${this.timestamp()}   ${icons.warning} ${this.color('Error:', 'red')} ${error.message || error}`);

    if (error.stack) {
      const stack = error.stack.split('\n').slice(1, 4).join('\n');
      console.log(`${this.timestamp()}     ${this.color('Stack:', 'gray')}`);
      console.log(this.color(stack, 'dim'));
    }

    if (Object.keys(context).length > 0) {
      console.log(`${this.timestamp()}     ${this.color('Context:', 'gray')}`);
      console.log(this.color(`      ${JSON.stringify(context, null, 2)}`, 'dim'));
    }

    console.log(`${this.timestamp()}   ${icons.clock} ${this.color('Duration:', 'gray')} ${this.formatDuration(duration)}`);
  }

  /**
   * Setup phase
   */
  setup(message, data = null) {
    console.log(`${this.timestamp()}   ${icons.setup} ${this.color('Setup:', 'blue')} ${message}`);
    if (data) {
      console.log(`${this.timestamp()}     ${this.color(JSON.stringify(data), 'dim')}`);
    }
  }

  /**
   * Action (user interaction)
   */
  action(type, message, data = null) {
    const icon = type === 'keyboard' ? icons.keyboard : icons.action;
    console.log(`${this.timestamp()}   ${icon} ${this.color('Action:', 'magenta')} ${message}`);
    if (data) {
      console.log(`${this.timestamp()}     ${this.color(JSON.stringify(data), 'dim')}`);
    }
  }

  /**
   * Result/verification
   */
  result(message, data = null) {
    console.log(`${this.timestamp()}   ${icons.result} ${this.color('Result:', 'cyan')} ${message}`);
    if (data) {
      console.log(`${this.timestamp()}     ${this.color(JSON.stringify(data, null, 2), 'dim')}`);
    }
  }

  /**
   * Assertion
   */
  assertion(condition, message) {
    const icon = condition ? '✓' : '✗';
    const color = condition ? 'green' : 'red';
    console.log(`${this.timestamp()}     ${this.color(icon, color)} ${this.color(message, condition ? 'green' : 'red')}`);
  }

  /**
   * Screenshot
   */
  screenshot(path) {
    this.screenshotCount++;
    console.log(`${this.timestamp()}   ${icons.screenshot} ${this.color('Screenshot:', 'yellow')} ${path}`);
  }

  /**
   * Video
   */
  video(path) {
    console.log(`${this.timestamp()}   ${icons.video} ${this.color('Video:', 'yellow')} ${path}`);
  }

  /**
   * Performance metric
   */
  performance(metric, value, unit = 'ms') {
    console.log(`${this.timestamp()}   ${icons.performance} ${this.color('Performance:', 'yellow')} ${metric} = ${value}${unit}`);
  }

  /**
   * Navigation
   */
  navigation(url) {
    console.log(`${this.timestamp()}   ${icons.navigation} ${this.color('Navigate:', 'blue')} ${url}`);
  }

  /**
   * Browser info
   */
  browser(info) {
    console.log(`${this.timestamp()}   ${icons.browser} ${this.color('Browser:', 'blue')} ${info}`);
  }

  /**
   * Accessibility violation
   */
  a11yViolation(violation) {
    console.log(`${this.timestamp()}   ${icons.accessibility} ${this.color('A11y Violation:', 'red')} ${violation.impact || 'unknown'} - ${violation.id}`);
    console.log(`${this.timestamp()}     ${this.color('Description:', 'gray')} ${violation.description || 'No description'}`);
    console.log(`${this.timestamp()}     ${this.color('Help:', 'gray')} ${violation.helpUrl || 'No help URL'}`);
    if (violation.nodes && violation.nodes.length > 0) {
      console.log(`${this.timestamp()}     ${this.color('Affected elements:', 'gray')} ${violation.nodes.length}`);
      violation.nodes.slice(0, 3).forEach((node, i) => {
        console.log(`${this.timestamp()}       ${i + 1}. ${node.html || node.target}`);
      });
    }
  }

  /**
   * Accessibility pass
   */
  a11yPass(message, count = 0) {
    console.log(`${this.timestamp()}   ${icons.accessibility} ${this.color('A11y Check:', 'green')} ${message}`);
    if (count > 0) {
      console.log(`${this.timestamp()}     ${this.color(`${count} checks passed`, 'green')}`);
    }
  }

  /**
   * Color contrast
   */
  contrast(element, ratio, required) {
    const pass = ratio >= required;
    const icon = pass ? icons.success : icons.fail;
    const color = pass ? 'green' : 'red';
    console.log(`${this.timestamp()}   ${icons.contrast} ${this.color('Contrast:', color)} ${element} = ${ratio.toFixed(2)}:1 (required: ${required}:1) ${icon}`);
  }

  /**
   * Focus indicator
   */
  focus(element, visible) {
    const icon = visible ? icons.success : icons.fail;
    const color = visible ? 'green' : 'red';
    console.log(`${this.timestamp()}   ${icons.focus} ${this.color('Focus:', color)} ${element} ${visible ? 'visible' : 'not visible'} ${icon}`);
  }

  /**
   * ARIA attribute
   */
  aria(element, attribute, value, expected = null) {
    const match = expected ? value === expected : true;
    const icon = match ? icons.success : icons.fail;
    const color = match ? 'green' : 'red';
    console.log(`${this.timestamp()}   ${icons.aria} ${this.color('ARIA:', color)} ${element} ${attribute}="${value}" ${icon}`);
  }

  /**
   * Info message
   */
  info(message, data = null) {
    console.log(`${this.timestamp()}   ${icons.info} ${this.color(message, 'white')}`);
    if (data) {
      console.log(`${this.timestamp()}     ${this.color(JSON.stringify(data, null, 2), 'dim')}`);
    }
  }

  /**
   * Warning
   */
  warn(message) {
    console.log(`${this.timestamp()}   ${icons.warning} ${this.color('Warning:', 'yellow')} ${message}`);
  }

  /**
   * Success
   */
  success(message) {
    console.log(`${this.timestamp()}   ${icons.success} ${this.color(message, 'green')}`);
  }

  /**
   * Debug
   */
  debug(message, data = null) {
    if (this.logLevel === 'debug' || this.logLevel === 'verbose') {
      console.log(`${this.timestamp()}   ${this.color('DEBUG:', 'gray')} ${message}`);
      if (data) {
        console.log(`${this.timestamp()}     ${this.color(JSON.stringify(data, null, 2), 'dim')}`);
      }
    }
  }
}

// Export singleton instance
export const e2eLogger = new E2ETestLogger();

export default e2eLogger;
