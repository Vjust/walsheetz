#!/usr/bin/env node

// Production CLI entry point
// This file runs the compiled TypeScript from dist/

import { execute } from '@oclif/core'

await execute({ development: false, dir: import.meta.url })
