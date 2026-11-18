import { z } from "zod"

import {
  get3wAffordanceDescriptorSchema,
  get3wProviderRefSchema,
} from "./get3w-affordance.js"
import { get3wFeatureContributionSchema } from "./get3w-provider.js"

export const GET3W_CONTEXT_SCHEMA_VERSION = 1

export const get3wSessionRefSchema = z.object({
  workspaceId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  title: z.string().optional(),
})
export type Get3wSessionRef = z.infer<typeof get3wSessionRefSchema>

export const get3wScreenSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("conversation"),
    route: z.string(),
    workspaceId: z.string().optional(),
    sessionId: z.string().optional(),
  }),
  z.object({
    kind: z.literal("settings"),
    route: z.string(),
    workspaceId: z.string().optional(),
    panel: z.string(),
  }),
  z.object({
    kind: z.literal("other"),
    route: z.string(),
  }),
])
export type Get3wScreen = z.infer<typeof get3wScreenSchema>

export const get3wConversationLayoutSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("empty") }),
  z.object({
    kind: z.literal("single"),
    sessionId: z.string(),
    workspaceId: z.string().optional(),
  }),
  z.object({
    kind: z.literal("split"),
    primarySessionId: z.string(),
    primaryWorkspaceId: z.string().optional(),
    secondarySessionId: z.string(),
    secondaryWorkspaceId: z.string().optional(),
    focused: z.enum(["primary", "secondary"]),
  }),
])
export type Get3wConversationLayout = z.infer<typeof get3wConversationLayoutSchema>

export const get3wPanelTabSchema = z.object({
  id: z.string(),
  kind: z.enum(["browser", "artifact"]),
  label: z.string(),
  url: z.string().optional(),
  status: z.enum(["loading", "ready", "suspending", "suspended", "restoring"]).optional(),
})
export type Get3wPanelTab = z.infer<typeof get3wPanelTabSchema>

export const get3wResourceDescriptorSchema = z.object({
  ref: z.string().trim().min(1),
  kind: z.enum(["workspace", "session", "screen", "side-panel", "settings"]),
  title: z.string(),
  provider: get3wProviderRefSchema,
  state: z.record(z.string(), z.unknown()),
})
export type Get3wResourceDescriptor = z.infer<typeof get3wResourceDescriptorSchema>

export const get3wContextSnapshotSchema = z.object({
  schemaVersion: z.literal(GET3W_CONTEXT_SCHEMA_VERSION),
  revision: z.number().int().nonnegative(),
  capturedAt: z.string(),
  features: z.object({
    connectionQuestions: z.boolean().optional(),
  }).optional(),
  screen: get3wScreenSchema,
  conversations: z.object({
    tabs: z.array(get3wSessionRefSchema),
    layout: get3wConversationLayoutSchema,
    pinnedSessionIds: z.array(z.string()),
  }),
  chrome: z.object({
    sidebarOpen: z.boolean(),
    applicationMenuVisible: z.boolean(),
    rightSidebarExpanded: z.boolean(),
  }),
  execution: z.object({
    queries: z.literal("parallel"),
    commands: z.literal("serialized"),
    busyCommandId: z.string().nullable(),
    busyActor: z.string().nullable(),
  }),
  sidePanel: z.object({
    open: z.boolean(),
    ownerSessionId: z.string().nullable(),
    kind: z.enum(["panel", "extensions"]).nullable(),
    tabs: z.array(get3wPanelTabSchema),
    activeTabId: z.string().nullable(),
  }),
  resources: z.array(get3wResourceDescriptorSchema),
  availableAffordances: z.array(get3wAffordanceDescriptorSchema),
  contributions: z.array(get3wFeatureContributionSchema),
})
export type Get3wContextSnapshot = z.infer<typeof get3wContextSnapshotSchema>
