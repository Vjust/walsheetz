import { BaseTestLogger, colors, baseIcons } from './BaseTestLogger.js';

const unitIcons = {
  ...baseIcons,
  mock: '[MOCK]',
  assertion: '[ASSERT]',
  location: '[LOC]',
  book: '[STACK]',
  bulb: '[TIP]',
  phone: '[CALLS]',
  docker: '[ENV]',
};

class TestLogger extends BaseTestLogger {
  constructor(options = {}) {
    super(options);
    this.logMockCalls = options.logMockCalls !== false || process.env.LOG_MOCK_CALLS === 'true';
    this.logAssertions = options.logAssertions !== false || process.env.LOG_ASSERTIONS === 'true';
    this.indentLevel = 0;
  }

  indent() {
    return '  '.repeat(this.indentLevel);
  }

  suiteStart(suiteName) {
    console.log('');
    this.separator('-', 'cyan');
    console.log(`${this.timestamp()} ${this.indent()}${unitIcons.suite} ${this.color(`Test Suite: ${suiteName}`, 'bright')}`);
    this.separator('-', 'cyan');
    this.indentLevel++;
  }

  suiteEnd(suiteName, stats) {
    this.indentLevel--;
    super.suiteEnd(suiteName, stats);
  }

  testStart(testName) {
    const testId = super.testStart(testName);
    this.indentLevel++;
    return testId;
  }

  testPass(testName, testId) {
    this.indentLevel--;
    super.testPass(testName, testId);
  }

  testFail(testName, error, context = {}, testId) {
    this.indentLevel--;
    super.testFail(testName, error, context, testId);
  }

  mockCall(mockName, args, returnValue) {
    if (!this.logMockCalls) return;
    console.log(`${this.timestamp()} ${this.indent()}${unitIcons.mock} ${this.color(mockName, 'yellow')}`);
    console.log(`${this.indent()}  Args: ${JSON.stringify(args)}`);
    console.log(`${this.indent()}  Returns: ${JSON.stringify(returnValue)}`);
  }

  mockCallsSummary(mockCalls) {
    if (!this.logMockCalls || !mockCalls || Object.keys(mockCalls).length === 0) return;
    console.log(`${this.timestamp()} ${unitIcons.phone} Mock Calls Summary:`);
    Object.entries(mockCalls).forEach(([name, calls]) => {
      console.log(`  ${this.color(name, 'yellow')}: ${calls.length} calls`);
    });
  }

  suggestion(message) {
    console.log(`${this.timestamp()} ${unitIcons.bulb} ${this.color(`Suggestion: ${message}`, 'cyan')}`);
  }

  docker(message) {
    console.log(`${this.timestamp()} ${unitIcons.docker} ${this.color(message, 'blue')}`);
  }
}

export const testLogger = new TestLogger();
export default TestLogger;
