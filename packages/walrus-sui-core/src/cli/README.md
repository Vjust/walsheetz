# CLI Module

Command-line interface tools and utilities for @dreamlit/walrus-sui-core.

## Overview

This module provides CLI-compatible utilities and tools for interacting with Walrus and Sui from the command line.

## Structure

Currently a placeholder for future CLI tooling. CLI functionality is primarily provided through the Node.js entry point.

## Usage

Use the Node.js entry point for CLI applications:

```javascript
#!/usr/bin/env node
import { NodeWalrusService, suiService } from '@dreamlit/walrus-sui-core/node';

// CLI logic here
```

## Future Enhancements

Planned CLI tools:
- Blob upload/download commands
- Transaction builders
- Wallet management
- Contract interaction utilities
- Batch operations

## Example CLI Pattern

```javascript
#!/usr/bin/env node
import { NodeWalrusService } from '@dreamlit/walrus-sui-core/node';
import { Command } from 'commander';

const program = new Command();
const walrus = new NodeWalrusService();

program
  .command('store <file>')
  .description('Store file to Walrus')
  .action(async (file) => {
    const data = await fs.readFile(file);
    const result = await walrus.storeBlob(data);
    console.log('Blob ID:', result.blobId);
  });

program.parse();
```

## Related Modules

- [../node/](../node/) - Node.js services for CLI
- [../blockchain/](../blockchain/) - Blockchain operations

## Notes

- CLI tools use Node.js entry point
- Direct endpoint access (no proxy)
- Suitable for automation and scripting
- Can be extended with commander or yargs
