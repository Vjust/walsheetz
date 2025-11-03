import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface SuiCliRunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface SuiMoveCallOptions {
  packageId: string;
  module: string;
  func: string;
  args?: string[];
  typeArgs?: string[];
  gasBudget?: number | bigint;
  signer?: string;
  profile?: string;
  json?: boolean;
  extraFlags?: string[];
  runOptions?: SuiCliRunOptions;
}

export async function runSuiCli(args: string[], options: SuiCliRunOptions = {}): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('sui', args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    maxBuffer: 10 * 1024 * 1024,
  });
}

export async function suiMoveCall(options: SuiMoveCallOptions): Promise<string> {
  const {
    packageId,
    module,
    func,
    args = [],
    typeArgs = [],
    gasBudget,
    signer,
    profile,
    json = true,
    extraFlags = [],
    runOptions,
  } = options;

  const cliArgs = ['client', 'call', '--package', packageId, '--module', module, '--function', func];

  for (const arg of args) {
    cliArgs.push('--args', arg);
  }

  for (const typeArg of typeArgs) {
    cliArgs.push('--type-args', typeArg);
  }

  if (typeof gasBudget !== 'undefined') {
    cliArgs.push('--gas-budget', String(gasBudget));
  }

  if (signer) {
    cliArgs.push('--signer', signer);
  }

  if (profile) {
    cliArgs.push('--profile', profile);
  }

  if (json) {
    cliArgs.push('--json');
  }

  cliArgs.push(...extraFlags);

  const { stdout } = await runSuiCli(cliArgs, runOptions);
  return stdout.trim();
}

export async function suiClientPTB(ptbPath: string, options: SuiCliRunOptions = {}): Promise<string> {
  const { stdout } = await runSuiCli(['client', 'ptb', '--file', ptbPath, '--json'], options);
  return stdout.trim();
}
