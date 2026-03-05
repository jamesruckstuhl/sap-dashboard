import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useInstanceStore = create(
  persist(
    (set) => ({
      selectedInstanceId: null,
      setSelectedInstance: (id) => set({ selectedInstanceId: id }),
      clearSelectedInstance: () => set({ selectedInstanceId: null }),
    }),
    { name: 'sap-instance' }
  )
);
