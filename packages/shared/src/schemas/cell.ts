import { z } from 'zod';

export const CellValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const CellStyleSchema = z
  .object({
    bg: z.string().optional(),
    fc: z.string().optional(),
    ff: z.string().optional(),
    fs: z.number().optional(),
    vt: z.number().optional(),
    ht: z.number().optional(),
    bl: z.number().optional(),
    it: z.number().optional(),
  })
  .passthrough();

export const CellSchema = z
  .object({
    v: CellValueSchema.optional(), // value (storage format)
    value: CellValueSchema.optional(), // value (UI format)
    f: z.string().optional(), // formula (storage)
    formula: z.string().optional(), // formula (UI)
    t: z.string().optional(), // type (storage)
    type: z.string().optional(), // type (UI)
    s: CellStyleSchema.optional(), // style
  })
  .passthrough();

export type Cell = z.infer<typeof CellSchema>;
export type CellValue = z.infer<typeof CellValueSchema>;
export type CellStyle = z.infer<typeof CellStyleSchema>;
