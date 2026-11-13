"use client";
import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
export function useRealtime() {
  const { getToken, userId, orgId } = useAuth();
  const query = useQueryClient();
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL;
    if (!url || !userId) return;
    let stopped = false;
    let socket: Socket | undefined;
    void getToken()
      .then((token) => {
        if (!token || stopped) return;
        socket = io(url, { auth: { token } });
        socket.on("workspace:updated", () => {
          void query.invalidateQueries({
            queryKey: ["workspace", userId, orgId],
          });
        });
      })
      .catch(() => {
        /* Query polling remains available. */
      });
    return () => {
      stopped = true;
      socket?.disconnect();
    };
  }, [getToken, userId, orgId, query]);
}
