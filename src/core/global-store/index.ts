import { create } from "zustand";
import type { User } from "@/core/types";

type GlobalStore = {
  user: User | null;
  setUser: (user: User | null) => void;
  clearUser: () => void;
};

export const useGlobalStore = create<GlobalStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null }),
}));
