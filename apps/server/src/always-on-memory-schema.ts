import { z } from "zod";

export const memoryReadInputSchema = z.object({ ids: z.array(z.string().min(1).max(160)).min(1).max(5) }).strict();
