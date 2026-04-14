import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, Pressable, PanResponder,
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
const MIN_MARKER = 10;

export default function ResultsScreen() {
  const router = useRouter();
  const { imageUri, imageWidth, imageHeight, markers, addMarker, removeMarker, reset } = useAppContext();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'view' | 'add' | 'remove'>('view');

  // Zoom/Pan
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const zoomRef = useRef(1);
  const panXRef = useRef(0);
  const panYRef = useRef(0);
  const pinchRef = useRef<{ d: number; mx: number; my: number; z: number; px: number; py: number } | null>(null);

  const availH = SCREEN_H - TOPBAR_H - TOOLBAR_H - insets.top - insets.bottom - 20;
  const aspect = imageWidth && imageHeight ? imageWidth / imageHeight : 1;
  let dW = SCREEN_W;
  let dH = SCREEN_W / aspect;
  if (dH > availH) { dH = availH; dW = availH * aspect; }

  // Compute marker size from radius (adapt to object size)
  const getMarkerSize = useCallback((radiusPct: number) => {
    const px = (radiusPct / 100) * dW * 2; // diameter in display px
    const size = Math.max(MIN_MARKER, Math.min(px * 0.7, 40)); // 70% of object, capped
    return size;
  }, [dW]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {},
      onPanResponderMove: (evt) => {
        const t = evt.nativeEvent.touches;
        if (t && t.length >= 2) {
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
        }
      },
      onPanResponderRelease: () => { pinchRef.current = null; },
    })
  ).current;

  const handleImagePress = useCallback((e: any) => {
    if (mode !== 'add') return;
    const lx = e.nativeEvent.locationX ?? e.nativeEvent.offsetX ?? 0;
    const ly = e.nativeEvent.locationY ?? e.nativeEvent.offsetY ?? 0;
    // Convert to image coords accounting for zoom/pan
    const ix = (lx - panXRef.current) / zoomRef.current;
    const iy = (ly - panYRef.current) / zoomRef.current;
    addMarker((ix / dW) * 100, (iy / dH) * 100);
  }, [mode, dW, dH, addMarker]);

  const handleNewCount = () => { reset(); router.replace('/'); };

  return (
    <View style={[st.ctn, { paddingTop: insets.top }]}>
      <View style={st.topBar}>
        <TouchableOpacity testID="results-back-btn" onPress={() => router.back()} style={st.ib}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={st.badge}>
          <Text style={st.badgeL}>Risultato</Text>
          <Text testID="count-result-text" style={st.badgeV}>{markers.length}</Text>
        </View>
        <TouchableOpacity testID="new-count-btn" onPress={handleNewCount} style={st.ib}>
          <MaterialCommunityIcons name="refresh" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={st.imgWrap} {...panResponder.panHandlers}>
        <View style={{ width: dW, height: dH, overflow: 'hidden' }}>
          <View style={{ width: dW, height: dH, transform: [{ translateX: panX }, { translateY: panY }, { scale: zoom }] }}>
            <Image source={{ uri: imageUri || '' }} style={{ width: dW, height: dH }} resizeMode="cover" />
            {/* Markers */}
            {markers.map((m) => {
              const sz = getMarkerSize(m.radius);
              const left = (m.x / 100) * dW - sz / 2;
              const top = (m.y / 100) * dH - sz / 2;
              const fontSize = Math.max(6, sz * 0.45);
              return (
                <TouchableOpacity
                  key={m.id} testID={`marker-${m.id}`}
                  onPress={() => mode === 'remove' && removeMarker(m.id)}
                  activeOpacity={mode === 'remove' ? 0.5 : 1}
                  style={[st.marker, { left, top, width: sz, height: sz, borderRadius: sz / 2, borderWidth: Math.max(1, sz * 0.08) }]}
                >
                  <Text style={[st.markerT, { fontSize }]}>{m.id}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {/* Add mode tap layer */}
          {mode === 'add' && <Pressable testID="add-marker-tap-area" style={StyleSheet.absoluteFill} onPress={handleImagePress} />}
        </View>
      </View>

      <View style={[st.tb, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity testID="manual-add-marker-btn" style={[st.ab, mode === 'add' && { backgroundColor: Colors.success }]} onPress={() => setMode(mode === 'add' ? 'view' : 'add')}>
          <MaterialCommunityIcons name="plus" size={28} color={mode === 'add' ? '#fff' : Colors.success} />
        </TouchableOpacity>
        <TouchableOpacity testID="manual-remove-marker-btn" style={[st.ab, mode === 'remove' && { backgroundColor: Colors.danger }]} onPress={() => setMode(mode === 'remove' ? 'view' : 'remove')}>
          <MaterialCommunityIcons name="minus" size={28} color={mode === 'remove' ? '#fff' : Colors.danger} />
        </TouchableOpacity>
        <View style={st.mi}>
          <Text style={st.mt}>{mode === 'add' ? 'Tocca per aggiungere' : mode === 'remove' ? 'Tocca marker per rimuovere' : 'Visualizzazione'}</Text>
        </View>
        <TouchableOpacity testID="new-photo-btn" style={st.np} onPress={handleNewCount}>
          <MaterialCommunityIcons name="camera-retake" size={22} color="#fff" />
          <Text style={st.npt}>Nuovo</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  ctn: { flex: 1, backgroundColor: Colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: TOPBAR_H },
  ib: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  badge: { alignItems: 'center', backgroundColor: Colors.surface, paddingHorizontal: 24, paddingVertical: 6, borderRadius: 16 },
  badgeL: { fontSize: 11, fontWeight: '500', color: Colors.textTertiary },
  badgeV: { fontSize: 28, fontWeight: '900', color: Colors.primary },
  imgWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  marker: { position: 'absolute', backgroundColor: 'rgba(0,122,255,0.55)', alignItems: 'center', justifyContent: 'center', borderColor: 'rgba(255,255,255,0.7)' },
  markerT: { color: '#fff', fontWeight: '800' },
  tb: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, height: TOOLBAR_H, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.surfaceElevated, gap: 12 },
  ab: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  mi: { flex: 1, alignItems: 'center' },
  mt: { fontSize: 12, color: Colors.textTertiary, fontWeight: '500' },
  np: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: Colors.primary },
  npt: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
