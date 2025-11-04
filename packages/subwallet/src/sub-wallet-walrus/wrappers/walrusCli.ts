import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface WalrusCliRunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export async function runWalrusCli(args: string[], options: WalrusCliRunOptions = {}): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('walrus', args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    maxBuffer: 10 * 1024 * 1024,
  });
}

export async function walrusPublisherStore(filePath: string, epochs = 1, options: WalrusCliRunOptions = {}): Promise<string> {
  const { stdout } = await runWalrusCli(['store', filePath, '--epochs', String(epochs), '--json'], options);
  return stdout.trim();
}

export async function walrusPublisherUploadDir(dirPath: string, epochs = 1, concurrency = 8, options: WalrusCliRunOptions = {}): Promise<string> {
  const { stdout } = await runWalrusCli([
    'send-dir',
    dirPath,
    '--epochs',
    String(epochs),
    '--concurrency',
    String(concurrency),
    '--json',
  ], options);
  return stdout.trim();
}
