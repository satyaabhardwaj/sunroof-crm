"use client";
import { create } from "zustand";
export const useLayout = create<{
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}));
