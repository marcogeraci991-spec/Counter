import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, PanResponder,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '../src/store/AppContext';
import { Colors } from '../src/constants/colors';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
const TOPBAR_H = 60;
const TOOLBAR_H = 70;

export default function ResultsScreen() {
  const router = useRouter();
  const { imageUri, imageWidth, imageHeight, markers, addMarker, removeMarker, reset } = useAppContext();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'view' | 'add' | 'remove'>('view');
  const modeRef = useRef<'view' | 'add' | 'remove'>('view');
  const setModeSync = (m: 'view' | 'add' | 'remove') => { setMode(m); modeRef.current = m; };

  // Zoom/Pan
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const zoomRef = useRef(1);
  const panXRef = useRef(0);
  const panYRef = useRef(0);
  const pinchRef = useRef<{ d: number; mx: number; my: number; z: number; px: number; py: number } | null>(null);
  const wasPinchingRef = useRef(false);

  const availH = SCREEN_H - TOPBAR_H - TOOLBAR_H - insets.top - insets.bottom - 20;
  const aspect = imageWidth && imageHeight ? imageWidth / imageHeight : 1;
  let dW = SCREEN_W;
  let dH = SCREEN_W / aspect;
  if (dH > availH) { dH = availH; dW = availH * aspect; }
  const dWRef = useRef(dW); dWRef.current = dW;
  const dHRef = useRef(dH); dHRef.current = dH;

  const getMarkerSize = useCallback((radiusPct: number) => {
    const px = (radiusPct / 100) * dW * 2; // diameter in display px
    return Math.max(8, px * 0.85); // 85% of object diameter, no upper cap
  }, [dW]);

  // Convert screen coords to image coords (transform origin = center)
  const screenToImage = (sx: number, sy: number) => {
    const cx = dWRef.current / 2;
    const cy = dHRef.current / 2;
    return {
      x: (sx - cx - panXRef.current) / zoomRef.current + cx,
      y: (sy - cy - panYRef.current) / zoomRef.current + cy,
    };
  };

  // PanResponder: only claims 2-finger gestures. Single taps handled via onPress of markers/image.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        const t = evt.nativeEvent.touches;
        return t && t.length >= 2;
      },
      onMoveShouldSetPanResponder: (evt) => {
        const t = evt.nativeEvent.touches;
        return t && t.length >= 2;
      },
      onPanResponderGrant: () => { wasPinchingRef.current = false; },
      onPanResponderMove: (evt) => {
        const t = evt.nativeEvent.touches;
        if (!t || t.length < 2) return;
        wasPinchingRef.current = true;
        const t0 = t[0], t1 = t[1];
        const d = Math.sqrt((t0.pageX - t1.pageX) ** 2 + (t0.pageY - t1.pageY) ** 2);
        const mx = (t0.pageX + t1.pageX) / 2;
        const my = (t0.pageY + t1.pageY) / 2;
        if (!pinchRef.current) {
          pinchRef.current = { d, mx, my, z: zoomRef.current, px: panXRef.current, py: panYRef.current };
          return;
        }
        const s = pinchRef.current;
        const nz = Math.max(1, Math.min(6, s.z * (d / s.d)));
        const nx = s.px + (mx - s.mx);
        const ny = s.py + (my - s.my);
        zoomRef.current = nz; panXRef.current = nx; panYRef.current = ny;
        setZoom(nz); setPanX(nx); setPanY(ny);
      },
      onPanResponderRelease: () => { pinchRef.current = null; },
    })
  ).current;

  // Handle single tap on image area (for adding markers)
  const handleImageTap = useCallback((evt: any) => {
    if (modeRef.current !== 'add') return;
    const lx = evt.nativeEvent.locationX ?? evt.nativeEvent.offsetX ?? 0;
    const ly = evt.nativeEvent.locationY ?? evt.nativeEvent.offsetY ?? 0;
    const p = screenToImage(lx, ly);
    addMarker((p.x / dWRef.current) * 100, (p.y / dHRef.current) * 100);
  }, [addMarker]);

  // Handle single tap on a marker (for removing)
  const handleMarkerTap = useCallback((id: number) => {
    if (modeRef.current === 'remove') removeMarker(id);
  }, [removeMarker]);

  const handleNewCount = () => { reset(); router.replace('/'); };

  return (
    <View style={[s.ctn, { paddingTop: insets.top }]}>
      <View style={s.topBar}>
        <TouchableOpacity testID="results-back-btn" onPress={() => router.back()} style={s.ib}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={s.badge}>
          <Text style={s.badgeL}>Risultato</Text>
          <Text testID="count-result-text" style={s.badgeV}>{markers.length}</Text>
        </View>
        <TouchableOpacity testID="new-count-btn" onPress={handleNewCount} style={s.ib}>
          <MaterialCommunityIcons name="refresh" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={s.imgWrap} {...panResponder.panHandlers}>
        <View style={{ width: dW, height: dH, overflow: 'hidden' }}>
          {/* Transformed image + markers container */}
          <View style={{ width: dW, height: dH, transform: [{ translateX: panX }, { translateY: panY }, { scale: zoom }] }}>
            <Image source={{ uri: imageUri || '' }} style={{ width: dW, height: dH }} resizeMode="cover" />
            {/* Markers rendered inside transformed view */}
            {markers.map((m) => {
              const sz = getMarkerSize(m.radius);
              const left = (m.x / 100) * dW - sz / 2;
              const top = (m.y / 100) * dH - sz / 2;
              const fs = Math.max(5, sz * 0.42);
              return (
                <TouchableOpacity
                  key={m.id} testID={`marker-${m.id}`}
                  onPress={() => handleMarkerTap(m.id)}
                  activeOpacity={mode === 'remove' ? 0.4 : 0.8}
                  style={[s.marker, { left, top, width: sz, height: sz, borderRadius: sz / 2, borderWidth: Math.max(1, sz * 0.07) }]}
                >
                  <Text style={[s.markerT, { fontSize: fs }]}>{m.id}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Tap capture layer for ADD mode - outside transform, on top */}
          {mode === 'add' && (
            <TouchableOpacity
              testID="add-marker-tap-area"
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={handleImageTap}
            />
          )}
        </View>
      </View>

      <View style={[s.tb, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity testID="manual-add-marker-btn" style={[s.ab, mode === 'add' && { backgroundColor: Colors.success }]}
          onPress={() => setModeSync(mode === 'add' ? 'view' : 'add')}>
          <MaterialCommunityIcons name="plus" size={28} color={mode === 'add' ? '#fff' : Colors.success} />
        </TouchableOpacity>
        <TouchableOpacity testID="manual-remove-marker-btn" style={[s.ab, mode === 'remove' && { backgroundColor: Colors.danger }]}
          onPress={() => setModeSync(mode === 'remove' ? 'view' : 'remove')}>
          <MaterialCommunityIcons name="minus" size={28} color={mode === 'remove' ? '#fff' : Colors.danger} />
        </TouchableOpacity>
        <View style={s.mi}>
          <Text style={s.mt}>{mode === 'add' ? 'Tocca per aggiungere' : mode === 'remove' ? 'Tocca marker per rimuovere' : 'Zoom con 2 dita'}</Text>
        </View>
        <TouchableOpacity testID="new-photo-btn" style={s.np} onPress={handleNewCount}>
          <MaterialCommunityIcons name="camera-retake" size={22} color="#fff" />
          <Text style={s.npt}>Nuovo</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  ctn: { flex: 1, backgroundColor: Colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: TOPBAR_H },
  ib: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  badge: { alignItems: 'center', backgroundColor: Colors.surface, paddingHorizontal: 24, paddingVertical: 6, borderRadius: 16 },
  badgeL: { fontSize: 11, fontWeight: '500', color: Colors.textTertiary },
  badgeV: { fontSize: 28, fontWeight: '900', color: Colors.primary },
  imgWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  marker: { position: 'absolute', backgroundColor: 'rgba(0,122,255,0.5)', alignItems: 'center', justifyContent: 'center', borderColor: 'rgba(255,255,255,0.65)' },
  markerT: { color: '#fff', fontWeight: '800' },
  tb: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, height: TOOLBAR_H, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.surfaceElevated, gap: 12 },
  ab: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  mi: { flex: 1, alignItems: 'center' },
  mt: { fontSize: 12, color: Colors.textTertiary, fontWeight: '500' },
  np: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: Colors.primary },
  npt: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
