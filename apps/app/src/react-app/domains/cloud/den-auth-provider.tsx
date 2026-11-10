import { createContext, use, type ReactNode } from "react";
import type { DenUser } from "@/app/lib/den";
import { t } from "@/i18n";

export type DenAuthStatus =
  | "checking"
  | "signed_in"
  | "unavailable"
  | "signed_out";

export type DenAuthStore = {
  status: DenAuthStatus;
  user: DenUser | null;
  verifiedIdentity: { principalId: string } | null;
  error: string | null;
  isSignedIn: boolean;
  refresh: () => Promise<void>;
};

// Legacy consumers keep an explicit signed-out context. Get3W authentication
// is owned by get3w-account and the native bridge, never by a Den token.
const retiredSession: DenAuthStore = Object.freeze({
  status: "signed_out",
  user: null,
  verifiedIdentity: null,
  error: null,
  isSignedIn: false,
  refresh: async () => {},
});
const DenAuthContext = createContext<DenAuthStore | undefined>(undefined);
export function DenAuthProvider({ children }: { children: ReactNode }) {
  return <DenAuthContext.Provider value={retiredSession}>{children}</DenAuthContext.Provider>;
}
export function useDenAuth(): DenAuthStore {
  return retiredSession;
}
