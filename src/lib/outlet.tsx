import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from './supabase';
import type { Outlet } from '../types';

const ALL_LOCATIONS = 'All Locations';

interface OutletContextValue {
  outlets: Outlet[];
  selectedOutlet: Outlet | null;
  setSelectedOutlet: (outlet: Outlet) => void;
  loading: boolean;

  isellerLocations: string[];
  selectedLocation: string;
  setSelectedLocation: (loc: string) => void;
  setIsellerLocations: (locs: string[]) => void;
}

const OutletContext = createContext<OutletContextValue | null>(null);

export function OutletProvider({ children }: { children: ReactNode }) {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [selectedOutlet, setSelectedOutlet] = useState<Outlet | null>(null);
  const [loading, setLoading] = useState(true);

  const [isellerLocations, setIsellerLocations] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>(ALL_LOCATIONS);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('outlets')
        .select('*')
        .order('name');
      const rows = (data ?? []) as Outlet[];
      setOutlets(rows);
      if (rows.length > 0) setSelectedOutlet(rows[0]);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <OutletContext.Provider
      value={{
        outlets,
        selectedOutlet,
        setSelectedOutlet,
        loading,
        isellerLocations,
        selectedLocation,
        setSelectedLocation,
        setIsellerLocations,
      }}
    >
      {children}
    </OutletContext.Provider>
  );
}

export function useOutlet(): OutletContextValue {
  const ctx = useContext(OutletContext);
  if (!ctx) throw new Error('useOutlet must be used within OutletProvider');
  return ctx;
}

export { ALL_LOCATIONS };
