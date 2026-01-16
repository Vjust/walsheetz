import { z } from 'zod';
import { CellSchema } from './cell';
import { SpreadsheetMetadataSchema } from './metadata';

export const SheetConfigSchema = z
  .object({
    name: z.string().optional(),
    index: z.number().optional(),
    order: z.number().optional(),
    hide: z.number().optional(),
    row: z.number().optional(),
    column: z.number().optional(),
  })
  .passthrough();

export const SpreadsheetDataSchema = z.object({
  version: z.number().int().nonnegative().default(1),
  timestamp: z.number().int().nonnegative().default(() => Date.now()),
  spreadsheetId: z.string().optional(),
  metadata: SpreadsheetMetadataSchema.optional(),
  cells: z.record(z.string(), CellSchema).default({}),
  sheets: z.array(SheetConfigSchema).optional(),
});

export type SpreadsheetData = z.infer<typeof SpreadsheetDataSchema>;
export type SheetConfig = z.infer<typeof SheetConfigSchema>;
