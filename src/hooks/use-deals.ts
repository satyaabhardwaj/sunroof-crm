"use client";
import { useQuery } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api-client";
import type { Workspace } from "@/types/deal";
export function useDeals(department: string) {
  return useQuery({
    queryKey: ["workspace", department],
    queryFn: async ({ signal }) =>
      (
        await createApiClient().get<Workspace>("/api/sunroof/workspace", {
          params: { department },
          signal,
        })
      ).data,
    retry: false,
    refetchInterval: 30000,
  });
}
