# WalSheetz Configuration Guide

This document describes the configuration options available in WalSheetz and how to customize them for your deployment.

## Configuration Files

WalSheetz uses two configuration mechanisms:

1. **Runtime Config** (`/app-config.json`) - Dynamic configuration loaded at runtime, allows updates without code changes
2. **Static Config** (`blockchain/config.js`) - Build-time configuration with defaults and fallbacks

## Table of Contents

- [Walrus Blob Size Limits](#walrus-blob-size-limits)
- [Network Configuration](#network-configuration)
- [Storage Features](#storage-features)
- [Gas Management](#gas-management)
- [Troubleshooting](#troubleshooting)

---

## Walrus Blob Size Limits

### Overview

WalSheetz validates data size after encoding and compression to ensure blobs fit within Walrus network limits. These limits are configurable per network.

### Configuration Options

#### `maxBlobSizeBytes` (Default: 268,435,456 = 256 MB)

Maximum size in bytes for the original (uncompressed) encoded data.

**Location in app-config.json:**
```json
{
  "networks": {
    "testnet": {
      "walrus": {
        "maxBlobSizeBytes": 268435456
      }
    }
  }
}
```

**Location in blockchain/config.js:**
```javascript
walrus: {
  testnet: {
    maxBlobSizeBytes: 256 * 1024 * 1024
  }
}
```

#### `maxCompressedBlobSizeBytes` (Default: 268,435,456 = 256 MB)

Maximum size in bytes for compressed data when compression is applied.

**Location in app-config.json:**
```json
{
  "networks": {
    "testnet": {
      "walrus": {
        "maxCompressedBlobSizeBytes": 268435456
      }
    }
  }
}
```

**Location in blockchain/config.js:**
```javascript
walrus: {
  testnet: {
    maxCompressedBlobSizeBytes: 256 * 1024 * 1024
  }
}
```

### Validation Flow

1. **Structure Validation** - `validateDataForWalrus()` checks data structure, JSON serializability, and required fields
2. **Encoding** - Data is encoded to binary JSON format using `encodeSpreadsheetData()`
3. **Compression** (optional) - If data exceeds compression threshold, it's compressed with gzip
4. **Size Validation** - Both original and compressed sizes are checked against configured limits
5. **Upload** - Data is sent to Walrus if all validations pass

```
┌─────────────────────┐
│  Structure Check    │  ← validateDataForWalrus()
│  (no size limit)    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Encode to Binary  │  ← encodeSpreadsheetData()
│   + Compress        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Size Validation    │  ← Check originalSize & compressedSize
│  (post-encoding)    │     against config limits
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Upload to Walrus   │
└─────────────────────┘
```

### When to Adjust Limits

#### Increase Limits When:
- Working with very large spreadsheets (>100MB)
- Storing extensive historical data or cell content
- Walrus network capacity increases beyond 256 MB
- Testing edge cases or stress scenarios

#### Decrease Limits When:
- Network conditions require smaller payloads
- Implementing stricter data governance policies
- Protecting against accidental large uploads
- Rate limiting or quota management needed

### Error Messages

When data exceeds configured limits, you'll see detailed error messages:

**Original size exceeded:**
```
Data too large: original size 314572800 bytes exceeds limit of 268435456 bytes (256 MB)
```

**Compressed size exceeded:**
```
Compressed data too large: 270532608 bytes exceeds limit of 268435456 bytes (256 MB)
```

Error responses include detailed metadata:
- `originalSize`: Size before compression
- `compressedSize`: Size after compression (if applicable)
- `isCompressed`: Boolean indicating if compression was applied
- `compressionRatio`: Ratio of original to compressed size
- `maxOriginalSize`: Configured limit for original data
- `maxCompressedSize`: Configured limit for compressed data

---

## Network Configuration

### Switching Networks

WalSheetz supports multiple networks (testnet, mainnet). Each network has its own configuration.

**To switch networks:**

1. Via URL parameter: `?network=mainnet`
2. Via localStorage: Set `walSheetz_network` to desired network
3. Via hostname: URLs containing `mainnet` or `devnet` auto-select that network

**Default:** testnet

### Network-Specific Settings

Each network configuration includes:
- RPC endpoints
- Package IDs (smart contract addresses)
- Walrus service URLs
- Blob size limits
- Feature flags

Example:
```json
{
  "networks": {
    "testnet": {
      "rpcUrl": "https://fullnode.testnet.sui.io:443",
      "packageId": "0xe7f621...",
      "walrus": {
        "maxBlobSizeBytes": 268435456,
        "maxCompressedBlobSizeBytes": 268435456,
        "publisherUrl": "https://publisher.walrus-testnet.walrus.space",
        "aggregatorUrl": "https://aggregator.walrus-testnet.walrus.space"
      }
    }
  }
}
```

---

## Storage Features

### Compression

Data compression reduces storage costs and network transfer time.

**Configuration:**
```json
{
  "features": {
    "storage": {
      "compression": {
        "enabled": true,
        "threshold": 16384,
        "algorithm": "gzip"
      }
    }
  }
}
```

- `enabled`: Enable/disable compression (default: true)
- `threshold`: Minimum size in bytes before compression is applied (default: 16KB)
- `algorithm`: Compression algorithm (currently only `gzip` supported)

### Auto-Save

Automatically save spreadsheet changes at regular intervals.

**Configuration:**
```json
{
  "features": {
    "autoSave": {
      "enabled": true,
      "intervalMs": 5000
    }
  }
}
```

- `enabled`: Enable/disable auto-save (default: true)
- `intervalMs`: Interval between auto-saves in milliseconds (default: 5000 = 5 seconds)

---

## Gas Management

### Gas Buffer

Add a buffer percentage to gas estimates for safer transaction execution.

**Configuration:**
```json
{
  "features": {
    "gasManagement": {
      "bufferPercent": 25
    }
  }
}
```

- `bufferPercent`: Percentage to add to gas estimates (default: 25%)

---

## Troubleshooting

### Large Workbook Upload Failures

**Problem:** Uploads fail with "Data too large" error even though data appears reasonable.

**Solutions:**
1. Check if compression is enabled in storage features
2. Increase `maxBlobSizeBytes` if working with legitimate large datasets
3. Verify data doesn't contain excessive metadata or formatting
4. Review console logs for actual sizes: `originalSize`, `compressedSize`

**Example diagnostic log:**
```
[BrowserWalrusService] Size validation passed: {
  originalSize: 226492416,        // 216 MB raw
  maxOriginalSize: 268435456,     // 256 MB limit
  isCompressed: true,
  compressedSize: 45298483,       // 43 MB compressed
  maxCompressedSize: 268435456,   // 256 MB limit
  compressionRatio: 5.0           // 5:1 compression
}
```

### Compression Not Working

**Problem:** Data isn't being compressed even when enabled.

**Check:**
1. Verify compression feature is enabled: `features.storage.compression.enabled`
2. Check if data size exceeds compression threshold (default: 16KB)
3. Ensure browser supports `CompressionStream` API
4. Review console logs for compression messages

### Configuration Not Taking Effect

**Problem:** Configuration changes aren't reflected in the application.

**Solutions:**
1. Clear browser cache and reload
2. Check browser console for config load errors
3. Verify JSON syntax in `app-config.json`
4. Ensure ConfigLoader is using correct endpoint (check Network tab)
5. Check config cache timeout (default: 30 seconds)

### Network Connectivity Issues

**Problem:** Cannot connect to Walrus services.

**Check:**
1. Verify network URLs in configuration are correct
2. Test endpoints directly: `curl https://publisher.walrus-testnet.walrus.space/v1/api`
3. Check if proxy is configured correctly in development
4. Review CORS settings if running in browser
5. Check health status in console logs

---

## Configuration Best Practices

1. **Test changes on testnet first** before deploying to mainnet
2. **Document custom configurations** in your deployment notes
3. **Monitor error logs** after configuration changes
4. **Keep configurations in version control** (except secrets)
5. **Use environment variables** for sensitive or environment-specific values
6. **Set conservative limits initially** and increase as needed
7. **Enable compression** to reduce costs and improve performance

---

## Related Documentation

- [Storage Architecture](./bridge-server-enhancements.md)
- [Rate Limiting](./rate-limiting-implementation.md)
- [Testing Guide](./TESTING.md)
- [Test Mode](./test-mode.md)

---

## Support

For questions or issues related to configuration:
- Check console logs for detailed error messages
- Review this documentation for configuration options
- Open an issue on the GitHub repository with configuration details and error logs
