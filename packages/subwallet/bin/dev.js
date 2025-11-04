#!/usr/bin/env node

// Development CLI entry point
// This file runs the TypeScript source files directly using ts-node

import { execute } from '@oclif/core'

await execute({ development: true, dir: import.meta.url })
