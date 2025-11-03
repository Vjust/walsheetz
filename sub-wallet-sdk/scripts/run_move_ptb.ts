import { suiClientPTB } from '../src/wrappers/suiCli.js';

async function main() {
  const [, , ...rest] = process.argv;
  if (rest.length === 0) {
    console.error('Usage: run_move_ptb.ts <path-to-ptb.json>');
    process.exit(1);
  }

  const [ptbPath] = rest;
  try {
    const output = await suiClientPTB(ptbPath);
    console.log(output);
  } catch (err) {
    console.error('Failed to execute PTB via Sui CLI');
    console.error(err);
    process.exit(1);
  }
}

void main();
