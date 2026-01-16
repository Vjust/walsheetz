const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

const baseIcons = {
  success: '[PASS]',
  fail: '[FAIL]',
  warning: '[WARN]',
  info: '[INFO]',
  debug: '[DEBUG]',
  test: '[TEST]',
  suite: '[SUITE]',
  setup: '[SETUP]',
  execute: '[RUN]',
  result: '[RESULT]',
  time: '[TIME]',
  separator: '-',
};

export class BaseTestLogger {
  constructor(options = {}) {
    this.useColors = options.colors !== false && process.env.FORCE_COLOR !== '0';
    this.useTimestamps = options.timestamps !== false;
    this.testStartTimes = new Map();
  }

  color(text, colorName) {
    if (!this.useColors) return text;
    return `${colors[colorName] || colors.reset}${text}${colors.reset}`;
  }

  timestamp() {
    if (!this.useTimestamps) return '';
    const now = new Date();
    return this.color(`[${now.toLocaleTimeString()}.${now.getMilliseconds().toString().padStart(3, '0')}]`, 'gray');
  }

  formatDuration(ms) {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  separator(char = '-', colorName = 'gray') {
    console.log(this.color(char.repeat(50), colorName));
  }

  suiteStart(suiteName) {
    console.log('');
    this.separator('-', 'cyan');
    console.log(`${this.timestamp()} ${baseIcons.suite} ${this.color(`Test Suite: ${suiteName}`, 'bright')}`);
    this.separator('-', 'cyan');
  }

  suiteEnd(suiteName, stats = {}) {
    console.log('');
    console.log(`${this.timestamp()} ${baseIcons.result} Summary: ${stats.passed || 0} passed, ${stats.failed || 0} failed, ${stats.total || 0} total`);
    if (stats.duration) {
      console.log(`${this.timestamp()} ${baseIcons.time} Total time: ${this.formatDuration(stats.duration)}`);
    }
    console.log('');
  }

  testStart(testName) {
    const testId = `${Date.now()}-${Math.random()}`;
    this.testStartTimes.set(testId, Date.now());
    console.log('');
    console.log(`${this.timestamp()} ${baseIcons.test} ${this.color(testName, 'cyan')}`);
    return testId;
  }

  testPass(testName, testId) {
    const duration = testId && this.testStartTimes.has(testId)
      ? Date.now() - this.testStartTimes.get(testId)
      : 0;
    if (testId) this.testStartTimes.delete(testId);
    console.log(`${this.timestamp()} ${baseIcons.success} ${this.color('PASS', 'green')} ${this.color(`(${this.formatDuration(duration)})`, 'gray')}`);
  }

  testFail(testName, error, context = {}, testId) {
    const duration = testId && this.testStartTimes.has(testId)
      ? Date.now() - this.testStartTimes.get(testId)
      : 0;
    if (testId) this.testStartTimes.delete(testId);

    console.log(`${this.timestamp()} ${baseIcons.fail} ${this.color('FAIL:', 'red')} ${testName}`);
    console.log(`${this.timestamp()}   ${this.color('Error:', 'red')} ${error.message || error}`);

    if (error.stack) {
      const stack = error.stack.split('\n').slice(1, 4).join('\n');
      console.log(this.color(stack, 'dim'));
    }

    if (Object.keys(context).length > 0) {
      console.log(`${this.timestamp()}   ${this.color('Context:', 'gray')} ${JSON.stringify(context, null, 2)}`);
    }
  }

  setup(message) {
    console.log(`${this.timestamp()} ${baseIcons.setup} ${this.color('Setup:', 'blue')} ${message}`);
  }

  execute(message) {
    console.log(`${this.timestamp()} ${baseIcons.execute} ${this.color('Executing:', 'magenta')} ${message}`);
  }

  result(message, data = null) {
    const msg = data ? `${message} ${this.color(JSON.stringify(data), 'gray')}` : message;
    console.log(`${this.timestamp()} ${baseIcons.result} ${this.color('Result:', 'cyan')} ${msg}`);
  }

  assertion(condition, message) {
    const icon = condition ? baseIcons.success : baseIcons.fail;
    const colorName = condition ? 'green' : 'red';
    console.log(`${this.timestamp()} ${icon} ${this.color(message, colorName)}`);
  }

  warn(message) {
    console.log(`${this.timestamp()} ${baseIcons.warning} ${this.color(message, 'yellow')}`);
  }

  info(message) {
    console.log(`${this.timestamp()} ${baseIcons.info} ${this.color(message, 'cyan')}`);
  }

  debug(message, data = null) {
    const msg = data ? `${message} ${JSON.stringify(data)}` : message;
    console.log(`${this.timestamp()} ${baseIcons.debug} ${this.color(msg, 'gray')}`);
  }

  success(message) {
    console.log(`${this.timestamp()} ${baseIcons.success} ${this.color(message, 'green')}`);
  }
}

export { colors, baseIcons };
