# Walrus SDK Examples

Example applications and code snippets demonstrating @dreamlit/walrus SDK usage.

## Overview

This directory will contain example applications and usage patterns for the Walrus SDK, including browser applications, Node.js scripts, and CLI tools.

## Planned Examples

### Browser Examples
- **Simple Storage App** - Basic blob storage and retrieval
- **File Upload** - Upload files to Walrus with progress tracking
- **Image Gallery** - Store and display images from Walrus
- **Data Sync** - Sync application data to Walrus

### Node.js Examples
- **CLI Tool** - Command-line tool for Walrus operations
- **Batch Upload** - Batch upload multiple files
- **API Server** - Express server with Walrus integration
- **Data Migration** - Migrate data from other storage to Walrus

### Advanced Examples
- **With Compression** - Automatic compression for large data
- **With Encryption** - Encrypt data before storage
- **Health Monitoring** - Monitor Walrus endpoint health
- **Retry Logic** - Handle failures with automatic retry

## Quick Start

### Browser Example

```javascript
import { BrowserWalrusService } from '@dreamlit/walrus/browser';

const service = new BrowserWalrusService();

// Store data
const result = await service.storeBlob({
  message: 'Hello Walrus!'
}, {
  epochs: 5
});

console.log('Stored at:', result.blobId);

// Retrieve data
const data = await service.readBlob(result.blobId);
console.log('Retrieved:', data);
```

### Node.js Example

```javascript
import { nodeWalrusService } from '@dreamlit/walrus/node';

// Store from file
import fs from 'fs';

const data = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
const result = await nodeWalrusService.storeBlob(data, { epochs: 5 });

fs.writeFileSync('./blobId.txt', result.blobId);
console.log('Stored at:', result.blobId);
```

## Contributing

To add an example:

1. Create a new directory with descriptive name
2. Include README.md with description and usage
3. Provide complete, runnable code
4. Include package.json if needed
5. Document any prerequisites

## Related Documentation

- [../src/browser/](../src/browser/) - Browser API documentation
- [../src/node/](../src/node/) - Node.js API documentation
- [../src/client/](../src/client/) - Core client documentation
- [../README.md](../README.md) - Package overview

## Coming Soon

Full example applications demonstrating:
- Real-world integration patterns
- Best practices
- Performance optimization
- Error handling strategies
- Production deployment
