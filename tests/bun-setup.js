/**
 * Bun Test Runner Setup
 * Configures happy-dom for Bun's native test runner
 * This is separate from tests/setup.js which is for vitest
 */

import { Browser } from 'happy-dom';

// Create a browser instance and get a window
const browser = new Browser();
const page = browser.newPage();
const windowInstance = page.mainFrame.window;

// Expose happy-dom globals to the test environment
globalThis.window = windowInstance;
globalThis.document = windowInstance.document;
globalThis.navigator = windowInstance.navigator;
globalThis.location = windowInstance.location;
globalThis.localStorage = windowInstance.localStorage;
globalThis.sessionStorage = windowInstance.sessionStorage;
globalThis.customElements = windowInstance.customElements;
globalThis.HTMLElement = windowInstance.HTMLElement;
globalThis.Element = windowInstance.Element;
globalThis.Node = windowInstance.Node;
globalThis.Event = windowInstance.Event;
globalThis.EventTarget = windowInstance.EventTarget;
globalThis.fetch = windowInstance.fetch;
globalThis.Headers = windowInstance.Headers;
globalThis.Request = windowInstance.Request;
globalThis.Response = windowInstance.Response;
globalThis.Text = windowInstance.Text;
globalThis.Comment = windowInstance.Comment;
globalThis.DocumentFragment = windowInstance.DocumentFragment;

// Verify globals are available
const missingGlobals = [];
if (typeof window === 'undefined') missingGlobals.push('window');
if (typeof document === 'undefined') missingGlobals.push('document');
if (typeof navigator === 'undefined') missingGlobals.push('navigator');

if (missingGlobals.length > 0) {
  console.warn(`⚠️ Happy-DOM setup incomplete - missing: ${missingGlobals.join(', ')}`);
} else {
  console.log('✅ Happy-DOM globals registered successfully');
}
