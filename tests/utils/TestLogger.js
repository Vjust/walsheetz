/**
 * Test Logger Utility
 * Provides extensive, colorized logging for test execution and debugging
 */

// ANSI color codes
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
  bgBlue: '\x1b[44m',
};

// Icons
const icons = {
  success: '✅',
  fail: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  debug: '🔍',
  test: '🧪',
  mock: '🎭',
  assertion: '✓',
  time: '⏱️',
  rocket: '🚀',
  package: '📦',
  tool: '🔧',
  chart: '📊',
  location: '📍',
  explosion: '💥',
  book: '📚',
  bulb: '💡',
  phone: '📞',
  docker: '🐳',
  separator: '━',
};

class TestLogger {
  constructor(options = {}) {
    this.enableColors = options.colors !== false && (process.env.FORCE_COLOR || process.env.LOG_COLORS !== 'false');
    this.enableTimestamps = options.timestamps !== false || process.env.LOG_TIMESTAMPS === 'true';
    this.logMockCalls = options.logMockCalls !== false || process.env.LOG_MOCK_CALLS === 'true';
    this.logAssertions = options.logAssertions !== false || process.env.LOG_ASSERTIONS === 'true';
    this.indentLevel = 0;
    this.testStartTimes = new Map();
  }

  /**
   * Format text with color
   */
  color(text, colorName) {
    if (!this.enableColors) return text;
    return `${colors[colorName]}${text}${colors.reset}`;
  }

  /**
   * Get timestamp string
   */
  timestamp() {
    if (!this.enableTimestamps) return '';
    const now = new Date();
    return this.color(
      `[${now.toLocaleTimeString()}.${now.getMilliseconds().toString().padStart(3, '0')}]`,
      'gray'
    );
  }

  /**
   * Get indent string
   */
  indent() {
    return '  '.repeat(this.indentLevel);
  }

  /**
   * Log with icon and color
   */
  log(icon, message, color = 'white') {
    const ts = this.timestamp();
    const ind = this.indent();
    console.log(`${ts} ${ind}${icon} ${this.color(message, color)}`);
  }

  /**
   * Suite started
   */
  suiteStart(suiteName) {
    this.log('', '', 'white'); // Empty line
    const separator = icons.separator.repeat(40);
    console.log(this.color(separator, 'cyan'));
    this.log(icons.package, `Test Suite: ${suiteName}`, 'bright');
    console.log(this.color(separator, 'cyan'));
    this.indentLevel++;
  }

  /**
   * Suite finished
   */
  suiteEnd(suiteName, stats) {
    this.indentLevel--;
    this.log('', '', 'white'); // Empty line
    this.log(icons.chart, `Summary: ${stats.passed} passed, ${stats.failed} failed, ${stats.total} total`, 'white');
    this.log(icons.time, `Total time: ${stats.duration}ms`, 'gray');
    this.log('', '', 'white'); // Empty line
  }

  /**
   * Test started
   */
  testStart(testName) {
    const testId = `${Date.now()}-${Math.random()}`;
    this.testStartTimes.set(testName, Date.now());

    this.log(icons.test, `Test: ${testName}`, 'cyan');
    this.indentLevel++;
    this.log(icons.time, `Start: ${new Date().toISOString()}`, 'gray');

    return testId;
  }

  /**
   * Test passed
   */
  testPass(testName) {
    const duration = Date.now() - (this.testStartTimes.get(testName) || Date.now());
    this.testStartTimes.delete(testName);

    this.log(icons.time, `Duration: ${duration}ms`, 'gray');
    this.indentLevel--;
    this.log(icons.success, `PASS (${duration}ms)`, 'green');
    this.log('', '', 'white'); // Empty line
  }

  /**
   * Test failed
   */
  testFail(testName, error, context = {}) {
    const duration = Date.now() - (this.testStartTimes.get(testName) || Date.now());
    this.testStartTimes.delete(testName);

    this.indentLevel--;
    this.log(icons.fail, `FAIL: ${testName}`, 'red');
    this.indentLevel++;

    // Error location
    if (error.stack) {
      const stackLines = error.stack.split('\n');
      const locationMatch = stackLines[1]?.match(/\((.+):(\d+):(\d+)\)/);
      if (locationMatch) {
        this.log(icons.location, `Location: ${locationMatch[1]}:${locationMatch[2]}`, 'red');
      }
    }

    // Error message
    this.log(icons.explosion, `Error: ${error.message}`, 'red');
    this.log('', '', 'white');

    // Stack trace
    if (error.stack) {
      this.log(icons.book, 'Stack Trace:', 'yellow');
      this.indentLevel++;
      const stackLines = error.stack.split('\n').slice(1, 4); // First 3 lines
      stackLines.forEach(line => {
        console.log(`${this.indent()}${this.color(line.trim(), 'gray')}`);
      });
      this.indentLevel--;
      this.log('', '', 'white');
    }

    // Context
    if (Object.keys(context).length > 0) {
      this.log(icons.debug, 'Context:', 'yellow');
      this.indentLevel++;
      Object.entries(context).forEach(([key, value]) => {
        const valueStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
        console.log(`${this.indent()}${this.color(`- ${key}:`, 'yellow')} ${this.color(valueStr, 'white')}`);
      });
      this.indentLevel--;
    }

    this.indentLevel--;
    this.log('', '', 'white'); // Empty line
  }

  /**
   * Setup phase
   */
  setup(message) {
    this.log(icons.tool, `Setup: ${message}`, 'blue');
  }

  /**
   * Execution phase
   */
  execute(message, data = null) {
    const msg = data ? `${message} ${this.color(JSON.stringify(data), 'gray')}` : message;
    this.log(icons.rocket, `Executing: ${msg}`, 'magenta');
  }

  /**
   * Result
   */
  result(message, data = null) {
    const msg = data ? `${message} ${this.color(JSON.stringify(data), 'gray')}` : message;
    this.log(icons.chart, `Result: ${msg}`, 'cyan');
  }

  /**
   * Mock call
   */
  mockCall(mockName, args, returnValue) {
    if (!this.logMockCalls) return;

    this.indentLevel++;
    this.log(icons.mock, `Mock Call: ${this.color(mockName, 'yellow')}`, 'white');
    this.indentLevel++;
    console.log(`${this.indent()}${this.color('Args:', 'gray')} ${this.color(JSON.stringify(args), 'white')}`);
    console.log(`${this.indent()}${this.color('Returns:', 'gray')} ${this.color(JSON.stringify(returnValue), 'white')}`);
    this.indentLevel -= 2;
  }

  /**
   * Assertion
   */
  assertion(condition, message) {
    if (!this.logAssertions) return;

    if (condition) {
      this.log(icons.assertion, `Assertion passed: ${message}`, 'green');
    } else {
      this.log(icons.fail, `Assertion failed: ${message}`, 'red');
    }
  }

  /**
   * Warning
   */
  warn(message) {
    this.log(icons.warning, message, 'yellow');
  }

  /**
   * Info
   */
  info(message) {
    this.log(icons.info, message, 'cyan');
  }

  /**
   * Debug
   */
  debug(message, data = null) {
    const msg = data ? `${message} ${JSON.stringify(data)}` : message;
    this.log(icons.debug, msg, 'gray');
  }

  /**
   * Success
   */
  success(message) {
    this.log(icons.success, message, 'green');
  }

  /**
   * Mock calls summary
   */
  mockCallsSummary(mockCalls) {
    if (!this.logMockCalls || !mockCalls || Object.keys(mockCalls).length === 0) return;

    this.log(icons.phone, 'Mock Calls Summary:', 'yellow');
    this.indentLevel++;

    Object.entries(mockCalls).forEach(([mockName, calls]) => {
      console.log(`${this.indent()}${this.color(mockName, 'yellow')}:`);
      this.indentLevel++;
      calls.forEach((call, index) => {
        console.log(`${this.indent()}${this.color(`Call ${index + 1}:`, 'gray')} ${this.color(JSON.stringify(call.args), 'white')}`);
        console.log(`${this.indent()}${this.color('Returned:', 'gray')} ${this.color(JSON.stringify(call.returnValue), 'white')}`);
      });
      this.indentLevel--;
    });

    this.indentLevel--;
  }

  /**
   * Suggestion
   */
  suggestion(message) {
    this.log(icons.bulb, `Suggestion: ${message}`, 'cyan');
  }

  /**
   * Docker message
   */
  docker(message) {
    this.log(icons.docker, message, 'blue');
  }

  /**
   * Separator
   */
  separator() {
    console.log(this.color(icons.separator.repeat(50), 'gray'));
  }
}

// Export singleton
export const testLogger = new TestLogger();

// Export class for custom instances
export default TestLogger;
