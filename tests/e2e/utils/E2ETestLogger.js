import { BaseTestLogger, baseIcons } from '../../utils/BaseTestLogger.js';

const e2eIcons = {
  ...baseIcons,
  action: '[CLICK]',
  keyboard: '[KEY]',
  screenshot: '[SHOT]',
  video: '[VIDEO]',
  browser: '[BROWSER]',
  accessibility: '[A11Y]',
  contrast: '[CONTRAST]',
  focus: '[FOCUS]',
  aria: '[ARIA]',
  performance: '[PERF]',
  navigation: '[NAV]',
};

class E2ETestLogger extends BaseTestLogger {
  constructor(options = {}) {
    super(options);
    this.logLevel = process.env.E2E_LOG_LEVEL || 'verbose';
    this.screenshotCount = 0;
  }

  action(type, message, data = null) {
    const icon = type === 'keyboard' ? e2eIcons.keyboard : e2eIcons.action;
    console.log(`${this.timestamp()} ${icon} ${this.color('Action:', 'magenta')} ${message}`);
    if (data) console.log(`  ${this.color(JSON.stringify(data), 'dim')}`);
  }

  screenshot(path) {
    this.screenshotCount++;
    console.log(`${this.timestamp()} ${e2eIcons.screenshot} ${this.color('Screenshot:', 'yellow')} ${path}`);
  }

  video(path) {
    console.log(`${this.timestamp()} ${e2eIcons.video} ${this.color('Video:', 'yellow')} ${path}`);
  }

  performance(metric, value, unit = 'ms') {
    console.log(`${this.timestamp()} ${e2eIcons.performance} ${this.color('Performance:', 'yellow')} ${metric} = ${value}${unit}`);
  }

  navigation(url) {
    console.log(`${this.timestamp()} ${e2eIcons.navigation} ${this.color('Navigate:', 'blue')} ${url}`);
  }

  browser(info) {
    console.log(`${this.timestamp()} ${e2eIcons.browser} ${this.color('Browser:', 'blue')} ${info}`);
  }

  a11yViolation(violation) {
    console.log(`${this.timestamp()} ${e2eIcons.accessibility} ${this.color('A11y Violation:', 'red')} ${violation.impact || 'unknown'} - ${violation.id}`);
    if (violation.description) console.log(`  ${this.color('Description:', 'gray')} ${violation.description}`);
    if (violation.helpUrl) console.log(`  ${this.color('Help:', 'gray')} ${violation.helpUrl}`);
    if (violation.nodes?.length > 0) {
      console.log(`  ${this.color('Affected:', 'gray')} ${violation.nodes.length} elements`);
    }
  }

  a11yPass(message, count = 0) {
    console.log(`${this.timestamp()} ${e2eIcons.accessibility} ${this.color('A11y Check:', 'green')} ${message}`);
    if (count > 0) console.log(`  ${this.color(`${count} checks passed`, 'green')}`);
  }

  contrast(element, ratio, required) {
    const pass = ratio >= required;
    const icon = pass ? baseIcons.success : baseIcons.fail;
    const colorName = pass ? 'green' : 'red';
    console.log(`${this.timestamp()} ${e2eIcons.contrast} ${this.color('Contrast:', colorName)} ${element} = ${ratio.toFixed(2)}:1 (required: ${required}:1) ${icon}`);
  }

  focus(element, visible) {
    const icon = visible ? baseIcons.success : baseIcons.fail;
    const colorName = visible ? 'green' : 'red';
    console.log(`${this.timestamp()} ${e2eIcons.focus} ${this.color('Focus:', colorName)} ${element} ${visible ? 'visible' : 'not visible'} ${icon}`);
  }

  aria(element, attribute, value, expected = null) {
    const match = expected ? value === expected : true;
    const icon = match ? baseIcons.success : baseIcons.fail;
    const colorName = match ? 'green' : 'red';
    console.log(`${this.timestamp()} ${e2eIcons.aria} ${this.color('ARIA:', colorName)} ${element} ${attribute}="${value}" ${icon}`);
  }
}

export const e2eLogger = new E2ETestLogger();
export default e2eLogger;
