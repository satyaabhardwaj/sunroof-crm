"use client";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
/** Optional live refresh. Off unless NEXT_PUBLIC_SOCKET_URL is set; screens poll anyway. */
export function useRealtime() {
  const query = useQueryClient();
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL;
    if (!url) return;
    const socket = io(url, { withCredentials: true });
    socket.on("workspace:updated", () => {
      void query.invalidateQueries({ queryKey: ["workspace"] });
    });
    return () => {
      socket.disconnect();
    };
  }, [query]);
}
