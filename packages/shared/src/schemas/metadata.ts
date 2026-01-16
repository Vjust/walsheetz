import { z } from 'zod';

export const SpreadsheetMetadataSchema = z.object({
  title: z.string().default('Untitled Spreadsheet'),
  createdAt: z.number().default(() => Date.now()),
  lastModified: z.number().default(() => Date.now()),
  format: z.string().default('walsheetz-v1'),
  isPrivate: z.boolean().optional(),
});

export type SpreadsheetMetadata = z.infer<typeof SpreadsheetMetadataSchema>;
