import React, { createContext, useContext, useState, useCallback } from 'react';

export interface Point {
  x: number;
  y: number;
}

export interface DrawnArea {
  points: Point[];
  mode: 'include' | 'exclude';
}

export interface Marker {
  id: number;
  x: number;
  y: number;
  radius: number;
  sizeOverride?: number;
}

interface AppState {
  category: string | null;
  categoryLabel: string | null;
  imageUri: string | null;
  imageBase64: string | null;
  imageWidth: number;
  imageHeight: number;
  areas: DrawnArea[];
  markers: Marker[];
  isLoading: boolean;
  sensitivity: number;
  advancedParams: {
    dp: number; blur_size: number; param1: number; param2_override: number;
    min_dist_factor: number; clahe_clip: number; obj_count_estimate: number;
  };
}

interface AppContextType extends AppState {
  setCategory: (category: string, label: string) => void;
  setImage: (uri: string, base64: string, width: number, height: number) => void;
  addArea: (area: DrawnArea) => void;
  clearAreas: () => void;
  undoArea: () => void;
  setMarkers: (markers: Marker[]) => void;
  addMarker: (x: number, y: number) => void;
  removeMarker: (id: number) => void;
  updateMarkerSize: (id: number, size: number) => void;
  setLoading: (loading: boolean) => void;
  setSensitivity: (v: number) => void;
  reset: () => void;
}

const defaultState: AppState = {
  category: null,
  categoryLabel: null,
  imageUri: null,
  imageBase64: null,
  imageWidth: 0,
  imageHeight: 0,
  areas: [],
  markers: [],
  isLoading: false,
  sensitivity: 0.5,
  advancedParams: { dp: 1.2, blur_size: 9, param1: 100, param2_override: 0, min_dist_factor: 0.8, clahe_clip: 2.5, obj_count_estimate: 40 },
};

const AppContext = createContext<AppContextType>({
  ...defaultState,
  setCategory: () => {},
  setImage: () => {},
  addArea: () => {},
  clearAreas: () => {},
  undoArea: () => {},
  setMarkers: () => {},
  addMarker: () => {},
  removeMarker: () => {},
  updateMarkerSize: () => {},
  setLoading: () => {},
  setSensitivity: () => {},
  setAdvancedParams: () => {},
  reset: () => {},
});

export const useAppContext = () => useContext(AppContext);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(defaultState);

  const setCategory = useCallback((category: string, label: string) => {
    setState(prev => ({ ...prev, category, categoryLabel: label }));
  }, []);

  const setImage = useCallback((uri: string, base64: string, width: number, height: number) => {
    setState(prev => ({
      ...prev,
      imageUri: uri,
      imageBase64: base64,
      imageWidth: width,
      imageHeight: height,
      areas: [],
      markers: [],
    }));
  }, []);

  const addArea = useCallback((area: DrawnArea) => {
    setState(prev => ({ ...prev, areas: [...prev.areas, area] }));
  }, []);

  const clearAreas = useCallback(() => {
    setState(prev => ({ ...prev, areas: [] }));
  }, []);

  const undoArea = useCallback(() => {
    setState(prev => ({ ...prev, areas: prev.areas.slice(0, -1) }));
  }, []);

  const setMarkers = useCallback((markers: Marker[]) => {
    setState(prev => ({ ...prev, markers }));
  }, []);

  const addMarker = useCallback((x: number, y: number) => {
    setState(prev => {
      const maxId = prev.markers.reduce((max, m) => Math.max(max, m.id), 0);
      const avgR = prev.markers.length > 0 ? prev.markers.reduce((s, m) => s + m.radius, 0) / prev.markers.length : 2;
      return { ...prev, markers: [...prev.markers, { id: maxId + 1, x, y, radius: avgR, sizeOverride: undefined }] };
    });
  }, []);

  const removeMarker = useCallback((id: number) => {
    setState(prev => {
      const filtered = prev.markers.filter(m => m.id !== id);
      const renumbered = filtered.map((m, i) => ({ ...m, id: i + 1 }));
      return { ...prev, markers: renumbered };
    });
  }, []);

  const updateMarkerSize = useCallback((id: number, size: number) => {
    setState(prev => ({
      ...prev,
      markers: prev.markers.map(m => m.id === id ? { ...m, sizeOverride: size } : m),
    }));
  }, []);

  const setLoading = useCallback((isLoading: boolean) => {
    setState(prev => ({ ...prev, isLoading }));
  }, []);

  const setSensitivity = useCallback((sensitivity: number) => {
    setState(prev => ({ ...prev, sensitivity }));
  }, []);

  const setAdvancedParams = useCallback((advancedParams: AppState['advancedParams']) => {
    setState(prev => ({ ...prev, advancedParams }));
  }, []);

  const reset = useCallback(() => {
    setState(defaultState);
  }, []);

  return (
    <AppContext.Provider
      value={{
        ...state,
        setCategory,
        setImage,
        addArea,
        clearAreas,
        undoArea,
        setMarkers,
        addMarker,
        removeMarker,
        updateMarkerSize,
        setLoading,
        setSensitivity,
        setAdvancedParams,
        reset,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
