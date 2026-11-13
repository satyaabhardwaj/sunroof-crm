"use client";
import { useMemo, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api-client";
import type { Workspace } from "@/types/deal";
export function useWorkflowApi() {
  const { getToken, userId, orgId } = useAuth();
  const query = useQueryClient();
  const client = useMemo(() => createApiClient(getToken), [getToken]);
  const request = useCallback(
    async (path = "", body?: unknown): Promise<Workspace> => {
      const department = location.pathname.split("/")[1] || "design";
      const key = ["workspace", userId, orgId, department];
      if (body !== undefined) {
        const result = await client.post<Workspace>(
          `/api/sunroof/${path}`,
          body,
          { params: { department } },
        );
        query.setQueryData(key, result.data);
        return result.data;
      }
      return query.fetchQuery({
        queryKey: key,
        staleTime: 0,
        queryFn: async ({ signal }) =>
          (
            await client.get<Workspace>("/api/sunroof/workspace", {
              params: { department },
              signal,
            })
          ).data,
      });
    },
    [client, query, userId, orgId],
  );
  return { client, request };
}
