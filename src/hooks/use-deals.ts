"use client";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api-client";
import type { Workspace } from "@/types/deal";
export function useDeals(department: string) {
  const { getToken, userId, orgId, isLoaded, isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["workspace", userId, orgId, department],
    enabled: isLoaded && !!isSignedIn,
    queryFn: async ({ signal }) =>
      (
        await createApiClient(getToken).get<Workspace>(
          "/api/sunroof/workspace",
          { params: { department }, signal },
        )
      ).data,
    retry: false,
    refetchInterval: 30000,
  });
}
