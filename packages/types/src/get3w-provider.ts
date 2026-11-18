import { z } from "zod"

import {
  get3wAffordanceDescriptorSchema,
  get3wProviderRefSchema,
} from "./get3w-affordance.js"

export const get3wGuidanceDescriptorSchema = z.object({
  ref: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  provider: get3wProviderRefSchema,
  loading: z.enum(["eager", "catalog", "on-demand"]),
})
export type Get3wGuidanceDescriptor = z.infer<typeof get3wGuidanceDescriptorSchema>

export const get3wFeatureContributionSchema = z.object({
  featureId: z.string().trim().min(1),
  provider: get3wProviderRefSchema,
  affordances: z.array(get3wAffordanceDescriptorSchema),
  guidance: z.array(get3wGuidanceDescriptorSchema),
})
export type Get3wFeatureContribution = z.infer<typeof get3wFeatureContributionSchema>

export const get3wProviderCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  contributions: z.array(get3wFeatureContributionSchema),
})
export type Get3wProviderCatalog = z.infer<typeof get3wProviderCatalogSchema>

export const get3wCapabilityResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("completed"),
    data: z.unknown(),
    additionalContext: z.array(z.string()).optional(),
  }),
  z.object({
    status: z.literal("guidance"),
    instructions: z.array(z.string()),
  }),
  z.object({
    status: z.literal("requires-user-action"),
    message: z.string(),
    action: z.string().optional(),
  }),
  z.object({
    status: z.literal("failed"),
    error: z.string(),
    retryable: z.boolean(),
  }),
])
export type Get3wCapabilityResult = z.infer<typeof get3wCapabilityResultSchema>
