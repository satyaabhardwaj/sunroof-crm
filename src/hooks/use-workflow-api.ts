"use client";
import { useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api-client";
import type { Workspace } from "@/types/deal";
export function useWorkflowApi() {
  const query = useQueryClient();
  const client = useMemo(() => createApiClient(), []);
  const request = useCallback(
    async (path = "", body?: unknown): Promise<Workspace> => {
      const department = location.pathname.split("/")[1] || "design";
      const key = ["workspace", department];
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
    [client, query],
  );
  return { client, request };
}
