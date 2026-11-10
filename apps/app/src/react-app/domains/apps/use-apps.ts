import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createArtifactsClient } from "@/app/lib/get3w-artifacts";
import { useGet3wAccount } from "../cloud/get3w-account";

export const dashboardManagementReason = "A signed-in account and artifact ownership are required to edit artifacts.";

/** Native identity only. Retained Den tokens never authorize cloud artifacts. */
export function useAppsClient() {
  const account = useGet3wAccount();
  const userId = account.user?.id ?? null;
  const identityVerified = account.status === "signed_in" && Boolean(userId);
  const client = useMemo(() => identityVerified && userId ? createArtifactsClient({ userId }) : null, [identityVerified, userId]);
  return {
    identityVerified,
    canManage: identityVerified,
    client,
    userId,
    // The repeated userId keeps the persisted pin and tile-cache keys written by earlier releases.
    scope: ["get3w-native-artifacts", userId, userId],
  };
}

export function useSavedApps() {
  const context = useAppsClient();
  const { client, scope } = context;
  const query = useQuery({
    queryKey: ["saved-apps", ...scope],
    enabled: Boolean(client),
    queryFn: async () => {
      if (!client) throw Error("Sign in to open your apps.");
      return client.listSavedApps();
    },
    staleTime: 5_000,
    refetchInterval: 5_000,
    retry: false,
  });
  return { ...context, query, available: Boolean(client && query.data?.enabled && !query.isError) };
}
