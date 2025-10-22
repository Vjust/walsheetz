/**
 * Visual Testing Helpers
 * Utilities for screenshots, videos, and visual regression testing
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { e2eLogger } from './E2ETestLogger.js';

/**
 * Ensure directory exists
 */
function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Take a screenshot of the page or element
 * @param {Page} page - Playwright page object
 * @param {string} name - Screenshot name
 * @param {Object} options - Screenshot options
 * @returns {Promise<string>} Screenshot path
 */
export async function takeScreenshot(page, name, options = {}) {
  const {
    fullPage = false,
    selector = null,
    dir = 'tests/e2e/screenshots',
    timestamp = true
  } = options;

  // Create screenshots directory if it doesn't exist
  ensureDir(dir);

  // Generate filename
  const timestampStr = timestamp ? `-${Date.now()}` : '';
  const filename = `${name}${timestampStr}.png`;
  const filepath = join(dir, filename);

  e2eLogger.info(`Taking screenshot: ${name}`, {
    fullPage,
    selector,
    filepath
  });

  try {
    if (selector) {
      // Screenshot specific element
      const element = await page.locator(selector).first();
      await element.screenshot({ path: filepath });
    } else {
      // Screenshot full page or viewport
      await page.screenshot({ path: filepath, fullPage });
    }

    e2eLogger.screenshot(filepath);

    return filepath;
  } catch (error) {
    e2eLogger.warn(`Failed to take screenshot: ${error.message}`);
    throw error;
  }
}

/**
 * Take a screenshot on test failure
 * @param {Page} page - Playwright page object
 * @param {string} testName - Test name
 * @returns {Promise<string>} Screenshot path
 */
export async function screenshotOnFailure(page, testName) {
  const sanitized = testName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  return await takeScreenshot(page, `failure-${sanitized}`, {
    fullPage: true,
    dir: 'tests/e2e/screenshots/failures'
  });
}

/**
 * Take a series of screenshots at intervals
 * @param {Page} page - Playwright page object
 * @param {string} baseName - Base name for screenshots
 * @param {number} count - Number of screenshots
 * @param {number} interval - Interval between screenshots (ms)
 * @returns {Promise<string[]>} Array of screenshot paths
 */
export async function takeScreenshotSeries(page, baseName, count = 5, interval = 1000) {
  e2eLogger.info(`Taking screenshot series: ${baseName}`, { count, interval });

  const screenshots = [];

  for (let i = 0; i < count; i++) {
    const path = await takeScreenshot(page, `${baseName}-${i + 1}`, {
      timestamp: false,
      dir: `tests/e2e/screenshots/series/${baseName}`
    });

    screenshots.push(path);

    if (i < count - 1) {
      await page.waitForTimeout(interval);
    }
  }

  e2eLogger.success(`Screenshot series complete: ${screenshots.length} images`);

  return screenshots;
}

/**
 * Start video recording
 * @param {Page} page - Playwright page object
 * @param {string} name - Video name
 * @returns {Promise<Object>} Video recording context
 */
export async function startVideoRecording(page, name) {
  e2eLogger.info(`Starting video recording: ${name}`);

  const context = page.context();
  const videoPath = join('tests/e2e/videos', `${name}-${Date.now()}.webm`);

  // Ensure video directory exists
  ensureDir('tests/e2e/videos');

  return {
    name,
    startTime: Date.now(),
    context,
    page
  };
}

/**
 * Stop video recording
 * @param {Object} recording - Recording context from startVideoRecording
 * @returns {Promise<string>} Video path
 */
export async function stopVideoRecording(recording) {
  const duration = Date.now() - recording.startTime;

  e2eLogger.info(`Stopping video recording: ${recording.name}`, {
    duration: `${(duration / 1000).toFixed(2)}s`
  });

  try {
    await recording.page.close();
    const video = recording.page.video();

    if (video) {
      const videoPath = await video.path();
      e2eLogger.video(videoPath);
      return videoPath;
    }

    return null;
  } catch (error) {
    e2eLogger.warn(`Failed to stop video recording: ${error.message}`);
    return null;
  }
}

/**
 * Compare two screenshots and generate diff image
 * @param {string} baseline - Path to baseline image
 * @param {string} current - Path to current image
 * @param {string} diff - Path to save diff image
 * @param {Object} options - Comparison options
 * @returns {Promise<Object>} Comparison result
 */
export async function compareScreenshots(baseline, current, diff, options = {}) {
  const {
    threshold = 0.1,
    includeAA = false
  } = options;

  e2eLogger.info('Comparing screenshots', {
    baseline,
    current,
    diff,
    threshold
  });

  try {
    // Check if baseline exists
    if (!existsSync(baseline)) {
      e2eLogger.warn('Baseline image does not exist - creating new baseline');

      // Copy current as new baseline
      const baselineData = readFileSync(current);
      ensureDir(dirname(baseline));
      writeFileSync(baseline, baselineData);

      return {
        match: true,
        isNewBaseline: true,
        diffPixels: 0,
        diffPercentage: 0
      };
    }

    // Load images
    const baselineImg = PNG.sync.read(readFileSync(baseline));
    const currentImg = PNG.sync.read(readFileSync(current));

    // Check dimensions match
    if (baselineImg.width !== currentImg.width || baselineImg.height !== currentImg.height) {
      e2eLogger.warn('Image dimensions do not match', {
        baseline: `${baselineImg.width}x${baselineImg.height}`,
        current: `${currentImg.width}x${currentImg.height}`
      });

      return {
        match: false,
        error: 'Dimensions mismatch',
        diffPixels: -1,
        diffPercentage: -1
      };
    }

    // Create diff image
    const { width, height } = baselineImg;
    const diffImg = new PNG({ width, height });

    // Compare images
    const diffPixels = pixelmatch(
      baselineImg.data,
      currentImg.data,
      diffImg.data,
      width,
      height,
      {
        threshold,
        includeAA
      }
    );

    const totalPixels = width * height;
    const diffPercentage = (diffPixels / totalPixels) * 100;

    // Save diff image
    ensureDir(dirname(diff));
    writeFileSync(diff, PNG.sync.write(diffImg));

    const match = diffPixels === 0;

    if (match) {
      e2eLogger.success('Screenshots match perfectly');
    } else {
      e2eLogger.warn('Screenshots differ', {
        diffPixels,
        diffPercentage: `${diffPercentage.toFixed(2)}%`,
        diffImage: diff
      });
    }

    return {
      match,
      diffPixels,
      diffPercentage,
      totalPixels,
      diffImage: diff
    };

  } catch (error) {
    e2eLogger.warn(`Screenshot comparison failed: ${error.message}`);
    throw error;
  }
}

/**
 * Visual regression test
 * @param {Page} page - Playwright page object
 * @param {string} name - Test name
 * @param {Object} options - Options
 * @returns {Promise<Object>} Regression test result
 */
export async function visualRegressionTest(page, name, options = {}) {
  const {
    selector = null,
    fullPage = false,
    threshold = 0.1,
    updateBaseline = process.env.UPDATE_SNAPSHOTS === 'true'
  } = options;

  const sanitized = name.replace(/[^a-z0-9]/gi, '-').toLowerCase();

  e2eLogger.info(`Running visual regression test: ${name}`, {
    updateBaseline,
    threshold
  });

  // Paths
  const baselineDir = 'tests/e2e/screenshots/baselines';
  const currentDir = 'tests/e2e/screenshots/current';
  const diffDir = 'tests/e2e/screenshots/diffs';

  const baselinePath = join(baselineDir, `${sanitized}.png`);
  const currentPath = join(currentDir, `${sanitized}.png`);
  const diffPath = join(diffDir, `${sanitized}.png`);

  // Take current screenshot
  const current = await takeScreenshot(page, sanitized, {
    selector,
    fullPage,
    dir: currentDir,
    timestamp: false
  });

  // If updating baselines, copy current to baseline
  if (updateBaseline) {
    e2eLogger.info('Updating baseline image');
    ensureDir(baselineDir);
    const currentData = readFileSync(current);
    writeFileSync(baselinePath, currentData);

    return {
      pass: true,
      baselineUpdated: true,
      baseline: baselinePath
    };
  }

  // Compare with baseline
  const comparison = await compareScreenshots(baselinePath, currentPath, diffPath, {
    threshold
  });

  return {
    pass: comparison.match || comparison.isNewBaseline,
    ...comparison,
    baseline: baselinePath,
    current: currentPath,
    diff: diffPath
  };
}

/**
 * Capture element screenshot for comparison
 * @param {Page} page - Playwright page object
 * @param {string} selector - Element selector
 * @param {string} name - Screenshot name
 * @returns {Promise<string>} Screenshot path
 */
export async function captureElement(page, selector, name) {
  e2eLogger.action('screenshot', `Capture element: ${selector}`);

  return await takeScreenshot(page, name, {
    selector,
    dir: 'tests/e2e/screenshots/elements'
  });
}

/**
 * Wait for visual stability (no changes for specified duration)
 * @param {Page} page - Playwright page object
 * @param {number} duration - Duration to wait (ms)
 * @param {number} checkInterval - Interval between checks (ms)
 * @returns {Promise<boolean>} True if stable
 */
export async function waitForVisualStability(page, duration = 1000, checkInterval = 100) {
  e2eLogger.info('Waiting for visual stability', { duration, checkInterval });

  let previousHash = null;
  let stableFor = 0;

  const startTime = Date.now();
  const maxWait = 10000; // 10 second timeout

  while (stableFor < duration) {
    // Check if we've waited too long
    if (Date.now() - startTime > maxWait) {
      e2eLogger.warn('Visual stability timeout - page may still be changing');
      return false;
    }

    // Take screenshot and compute hash
    const screenshot = await page.screenshot();
    const hash = screenshot.toString('base64').substring(0, 100);

    if (previousHash === hash) {
      stableFor += checkInterval;
    } else {
      stableFor = 0;
      previousHash = hash;
    }

    await page.waitForTimeout(checkInterval);
  }

  e2eLogger.success('Visual stability achieved');
  return true;
}

/**
 * Annotate screenshot with text/shapes
 * @param {string} imagePath - Path to image
 * @param {Array} annotations - Array of annotation objects
 * @returns {Promise<string>} Path to annotated image
 */
export async function annotateScreenshot(imagePath, annotations) {
  e2eLogger.info('Annotating screenshot', {
    imagePath,
    annotationCount: annotations.length
  });

  // Note: This would require a library like 'sharp' or 'canvas'
  // For now, just return the original path
  // In a real implementation, you'd draw on the image

  e2eLogger.warn('Screenshot annotation not yet implemented');

  return imagePath;
}

/**
 * Create side-by-side comparison image
 * @param {string} image1Path - First image path
 * @param {string} image2Path - Second image path
 * @param {string} outputPath - Output image path
 * @returns {Promise<string>} Path to comparison image
 */
export async function createComparisonImage(image1Path, image2Path, outputPath) {
  e2eLogger.info('Creating comparison image', {
    image1: image1Path,
    image2: image2Path,
    output: outputPath
  });

  try {
    const img1 = PNG.sync.read(readFileSync(image1Path));
    const img2 = PNG.sync.read(readFileSync(image2Path));

    const maxHeight = Math.max(img1.height, img2.height);
    const totalWidth = img1.width + img2.width;

    // Create new image with both images side by side
    const comparison = new PNG({ width: totalWidth, height: maxHeight });

    // Copy first image
    PNG.bitblt(img1, comparison, 0, 0, img1.width, img1.height, 0, 0);

    // Copy second image
    PNG.bitblt(img2, comparison, 0, 0, img2.width, img2.height, img1.width, 0);

    // Save
    ensureDir(dirname(outputPath));
    writeFileSync(outputPath, PNG.sync.write(comparison));

    e2eLogger.success('Comparison image created', { path: outputPath });

    return outputPath;
  } catch (error) {
    e2eLogger.warn(`Failed to create comparison image: ${error.message}`);
    throw error;
  }
}

/**
 * Take screenshot with network activity indicator
 * @param {Page} page - Playwright page object
 * @param {string} name - Screenshot name
 * @param {boolean} waitForIdle - Wait for network idle
 * @returns {Promise<string>} Screenshot path
 */
export async function screenshotWithNetworkWait(page, name, waitForIdle = true) {
  if (waitForIdle) {
    e2eLogger.info('Waiting for network idle before screenshot');
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
      e2eLogger.warn('Network did not reach idle state');
    });
  }

  return await takeScreenshot(page, name, { fullPage: true });
}

export default {
  takeScreenshot,
  screenshotOnFailure,
  takeScreenshotSeries,
  startVideoRecording,
  stopVideoRecording,
  compareScreenshots,
  visualRegressionTest,
  captureElement,
  waitForVisualStability,
  annotateScreenshot,
  createComparisonImage,
  screenshotWithNetworkWait
};
