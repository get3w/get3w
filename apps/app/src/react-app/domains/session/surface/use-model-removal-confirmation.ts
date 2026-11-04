import type { ModelRef } from "@/app/types";
const EMPTY_MODELS: readonly ModelRef[] = [];
export function useModelRemovalConfirmation(input: {
  model: ModelRef | null;
  missing: boolean;
  ready: boolean;
  scope: string;
  chatKey: string;
  refreshEngine: () => Promise<boolean>;
}) {
 return { confirmed: false, assignedModels: EMPTY_MODELS };
}
