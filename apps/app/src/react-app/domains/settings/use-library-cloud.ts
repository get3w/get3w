import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import type { DenClient } from "../../../app/lib/den";
import type {
  DenLibraryAccessGrant,
  DenLibraryItem,
  DenLibraryOrgDirectory,
  DenLibraryPluginItem,
} from "../../../app/lib/den-library";
import { clearCloudInventoryCache } from "../connections/cloud-inventory-cache";
import { isOwnedLibraryPlugin, libraryAudienceFromGrants, type LibraryAudience } from "./library-sharing";
import { parseSkillMarkdown, skillMarkdown } from "./library";

export type LibraryShareTarget = { kind: "team"; id: string } | { kind: "person"; id: string } | { kind: "everyone" };

export type LibraryCloud = {
  ready: boolean;
  sharingError: boolean;
  grantsReadyFor: (pluginId: string) => boolean;
  items: DenLibraryItem[];
  directory: DenLibraryOrgDirectory | null;
  pluginById: Map<string, DenLibraryPluginItem>;
  ownedPluginIds: Set<string>;
  audienceFor: (pluginId: string) => LibraryAudience;
  grantsFor: (pluginId: string) => DenLibraryAccessGrant[];
  refresh: () => Promise<void>;
  /** Makes the audience exactly `targets`: grants what is missing and revokes the rest. */
  setAudience: (pluginId: string, targets: LibraryShareTarget[]) => Promise<void>;
  archive: (pluginId: string) => Promise<void>;
  restore: (pluginId: string) => Promise<void>;
  readSkill: (pluginId: string) => Promise<LibraryEditableSkill | null>;
  saveSkill: (skill: LibraryEditableSkill, next: { name: string; description: string; instructions: string }) => Promise<void>;
};

export type LibraryEditableSkill = {
  pluginId: string;
  configObjectId: string;
  slug: string;
  name: string;
  description: string;
  instructions: string;
  rawSourceText: string;
};

/** Organization Library is absent; local skills and plugins use the extensions store. */
export function useLibraryCloud(_input: { client: DenClient; baseUrl: string; organizationId: string; enabled: boolean }): LibraryCloud {
 const unavailable = async () => { throw new Error("Organization Library is unavailable in this edition."); };
 return { ready: false, sharingError: false, grantsReadyFor: () => false, items: [], directory: null,
  pluginById: new Map(), ownedPluginIds: new Set(), audienceFor: () => ({ orgWide: false, teams: [], people: [] }),
  grantsFor: () => [], refresh: async () => {}, setAudience: unavailable, archive: unavailable,
  restore: unavailable, readSkill: unavailable, saveSkill: unavailable };
}
