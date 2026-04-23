import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, PanResponder, LayoutChangeEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '../src/store/AppContext';
import { Colors } from '../src/constants/colors';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
const TOPBAR_H = 60;
const TOOLBAR_H = 56;

export default function ResultsScreen() {
  const router = useRouter();
  const { imageUri, imageWidth, imageHeight, markers, addMarker, removeMarker, updateMarkerSize, reset } = useAppContext();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<'view' | 'add' | 'remove' | 'resize'>('view');
  const modeRef = useRef<typeof mode>('view');
  const setModeSync = (m: typeof mode) => { setMode(m); modeRef.current = m; };

  const [resizingId, setResizingId] = useState<number | null>(null);

  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const zoomRef = useRef(1);
  const panXRef = useRef(0);
  const panYRef = useRef(0);
  const pinchRef = useRef<any>(null);
  const containerPageX = useRef(0);
  const containerPageY = useRef(0);

  const availH = SCREEN_H - TOPBAR_H - TOOLBAR_H - insets.top - insets.bottom - 20;
  const aspect = imageWidth && imageHeight ? imageWidth / imageHeight : 1;
  let dW = SCREEN_W;
  let dH = SCREEN_W / aspect;
  if (dH > availH) { dH = availH; dW = availH * aspect; }
  const dWRef = useRef(dW); dWRef.current = dW;
  const dHRef = useRef(dH); dHRef.current = dH;

  const getMarkerSize = useCallback((m: { radius: number; sizeOverride?: number }) => {
    if (m.sizeOverride != null) return m.sizeOverride;
    const diameter = (m.radius / 100) * dW * 2;
    return Math.max(6, Math.min(diameter * 0.6, 28));
  }, [dW]);

  // Use locationX for touch coords (reliable on Android)
  const touchToImage = (locX: number, locY: number) => {
    if (zoomRef.current === 1 && panXRef.current === 0 && panYRef.current === 0) {
      return { x: locX, y: locY };
    }
    const cx = dWRef.current / 2;
    const cy = dHRef.current / 2;
    return {
      x: (locX - cx - panXRef.current) / zoomRef.current + cx,
      y: (locY - cy - panYRef.current) / zoomRef.current + cy,
    };
  };

  const containerRef = useRef<View>(null);
  const measureContainer = useCallback(() => {}, []);

  // PanResponder only for 2-finger zoom/pan
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: (e) => e.nativeEvent.touches && e.nativeEvent.touches.length >= 2,
    onMoveShouldSetPanResponder: (e) => e.nativeEvent.touches && e.nativeEvent.touches.length >= 2,
    onPanResponderMove: (evt) => {
      const t = evt.nativeEvent.touches;
      if (!t || t.length < 2) return;
      const t0 = t[0], t1 = t[1];
      const d = Math.sqrt((t0.pageX - t1.pageX) ** 2 + (t0.pageY - t1.pageY) ** 2);
      const mx = (t0.pageX + t1.pageX) / 2;
      const my = (t0.pageY + t1.pageY) / 2;
      if (!pinchRef.current) { pinchRef.current = { d, mx, my, z: zoomRef.current, px: panXRef.current, py: panYRef.current }; return; }
      const s = pinchRef.current;
      const nz = Math.max(1, Math.min(8, s.z * (d / s.d)));
      zoomRef.current = nz; panXRef.current = s.px + (mx - s.mx); panYRef.current = s.py + (my - s.my);
      setZoom(nz); setPanX(panXRef.current); setPanY(panYRef.current);
    },
    onPanResponderRelease: () => { pinchRef.current = null; },
  })).current;

  const handleImageTap = useCallback((evt: any) => {
    if (modeRef.current !== 'add') return;
    const locX = evt.nativeEvent.locationX ?? 0;
    const locY = evt.nativeEvent.locationY ?? 0;
    const p = touchToImage(locX, locY);
    addMarker((p.x / dWRef.current) * 100, (p.y / dHRef.current) * 100);
  }, [addMarker]);

  const handleMarkerTap = useCallback((id: number) => {
    if (modeRef.current === 'remove') { removeMarker(id); return; }
    if (modeRef.current === 'resize') { setResizingId(prev => prev === id ? null : id); return; }
  }, [removeMarker]);

  const handleNewCount = () => { reset(); router.replace('/'); };

  // Resize slider - proper width tracking
  const [resizeSliderW, setResizeSliderW] = useState(100);
  const resizeSliderWRef = useRef(100);
  const resizeSliderPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => applyResize(e.nativeEvent.locationX),
    onPanResponderMove: (e) => applyResize(e.nativeEvent.locationX),
  })).current;

  const resizingIdRef = useRef<number | null>(null);
  resizingIdRef.current = resizingId;

  const applyResize = (locX: number) => {
    const id = resizingIdRef.current;
    if (id == null) return;
    const pct = Math.max(0, Math.min(1, locX / resizeSliderWRef.current));
    const newSize = 3 + pct * 50; // 3px to 53px
    updateMarkerSize(id, newSize);
  };

  const resizingMarker = resizingId != null ? markers.find(m => m.id === resizingId) : null;
  const currentResizeSize = resizingMarker ? getMarkerSize(resizingMarker) : 14;
  const resizePct = Math.max(0, Math.min(1, (currentResizeSize - 3) / 50));
  const showResizeSlider = mode === 'resize' && resizingId != null;

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

      <View ref={containerRef} style={s.imgWrap} {...panResponder.panHandlers} onLayout={measureContainer}>
        <View style={{ width: dW, height: dH, overflow: 'hidden' }}>
          <View style={{ width: dW, height: dH, transform: [{ translateX: panX }, { translateY: panY }, { scale: zoom }] }}>
            <Image source={{ uri: imageUri || '' }} style={{ width: dW, height: dH }} resizeMode="cover" />
            {markers.map((m) => {
              const sz = getMarkerSize(m);
              const left = (m.x / 100) * dW - sz / 2;
              const top = (m.y / 100) * dH - sz / 2;
              const fs = Math.max(4, sz * 0.42);
              const isResizing = resizingId === m.id;
              return (
                <TouchableOpacity key={m.id} testID={`marker-${m.id}`} onPress={() => handleMarkerTap(m.id)} activeOpacity={0.6}
                  style={[s.marker, { left, top, width: sz, height: sz, borderRadius: sz / 2, borderWidth: Math.max(0.5, sz * 0.06) },
                    isResizing && { borderColor: Colors.warning, borderWidth: 2 }]}>
                  <Text style={[s.markerT, { fontSize: fs }]}>{m.id}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {mode === 'add' && (
            <TouchableOpacity testID="add-marker-tap-area" style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleImageTap} />
          )}
        </View>
      </View>

      <View style={[s.tb, { paddingBottom: insets.bottom + 8 }]}>
        {showResizeSlider ? (
          <View style={s.resizeRow}>
            <Text style={s.resizeLabel}>Tag #{resizingId}</Text>
            <View style={s.sliderC}
              onLayout={(e: LayoutChangeEvent) => { resizeSliderWRef.current = e.nativeEvent.layout.width; setResizeSliderW(e.nativeEvent.layout.width); }}
              {...resizeSliderPan.panHandlers}>
              <View style={s.sliderTrack} />
              <View style={[s.sliderFill, { width: `${resizePct * 100}%` }]} />
              <View style={[s.sliderThumb, { left: resizePct * resizeSliderW - 10 }]} />
            </View>
            <Text style={s.resizeVal}>{Math.round(currentResizeSize)}px</Text>
            <TouchableOpacity onPress={() => setResizingId(null)} style={s.resizeDone}>
              <MaterialCommunityIcons name="check" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.buttonsRow}>
            <TouchableOpacity testID="manual-add-marker-btn" style={[s.ab, mode === 'add' && { backgroundColor: Colors.success }]}
              onPress={() => setModeSync(mode === 'add' ? 'view' : 'add')}>
              <MaterialCommunityIcons name="plus" size={24} color={mode === 'add' ? '#fff' : Colors.success} />
            </TouchableOpacity>
            <TouchableOpacity testID="manual-remove-marker-btn" style={[s.ab, mode === 'remove' && { backgroundColor: Colors.danger }]}
              onPress={() => setModeSync(mode === 'remove' ? 'view' : 'remove')}>
              <MaterialCommunityIcons name="minus" size={24} color={mode === 'remove' ? '#fff' : Colors.danger} />
            </TouchableOpacity>
            <TouchableOpacity testID="resize-marker-btn" style={[s.ab, mode === 'resize' && { backgroundColor: Colors.warning }]}
              onPress={() => { setModeSync(mode === 'resize' ? 'view' : 'resize'); setResizingId(null); }}>
              <MaterialCommunityIcons name="resize" size={22} color={mode === 'resize' ? '#fff' : Colors.warning} />
            </TouchableOpacity>
            <View style={s.mi}>
              <Text style={s.mt}>{mode === 'add' ? 'Tocca: aggiungi' : mode === 'remove' ? 'Tocca tag: rimuovi' : mode === 'resize' ? 'Tocca tag: ridimensiona' : 'Zoom: 2 dita'}</Text>
            </View>
            <TouchableOpacity testID="new-photo-btn" style={s.np} onPress={handleNewCount}>
              <MaterialCommunityIcons name="camera-retake" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
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
  marker: { position: 'absolute', backgroundColor: 'rgba(0,122,255,0.45)', alignItems: 'center', justifyContent: 'center', borderColor: 'rgba(255,255,255,0.6)' },
  markerT: { color: '#fff', fontWeight: '800' },
  tb: { paddingHorizontal: 10, paddingTop: 8, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.surfaceElevated },
  buttonsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ab: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  mi: { flex: 1, alignItems: 'center' },
  mt: { fontSize: 11, color: Colors.textTertiary, fontWeight: '500' },
  np: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  resizeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resizeLabel: { fontSize: 11, fontWeight: '600', color: Colors.textTertiary, width: 48 },
  sliderC: { flex: 1, height: 40, justifyContent: 'center' },
  sliderTrack: { height: 4, backgroundColor: Colors.surfaceElevated, borderRadius: 2 },
  sliderFill: { position: 'absolute', height: 4, backgroundColor: Colors.warning, borderRadius: 2 },
  sliderThumb: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.warning, top: 9 },
  resizeVal: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary, width: 32, textAlign: 'right' },
  resizeDone: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.success, alignItems: 'center', justifyContent: 'center' },
});
