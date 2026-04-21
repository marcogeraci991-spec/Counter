import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Alert,
  ActivityIndicator, PanResponder, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect, Defs, Mask } from 'react-native-svg';
import { useAppContext, Point } from '../src/store/AppContext';
import { Colors } from '../src/constants/colors';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

function pointsToPathD(pts: Point[]): string {
  if (pts.length < 2) return '';
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
}

export default function AreaSelectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    imageUri, imageBase64, imageWidth, imageHeight,
    category, areas, addArea, undoArea, clearAreas,
    setMarkers, isLoading, setLoading, sensitivity, setSensitivity,
  } = useAppContext();

  const [drawMode, setDrawMode] = useState<'include' | 'exclude'>('include');
  const drawModeRef = useRef<'include' | 'exclude'>('include');
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const curPtsRef = useRef<Point[]>([]);
  const isDrawingRef = useRef(false);

  // Zoom/Pan
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const zoomRef = useRef(1);
  const panXRef = useRef(0);
  const panYRef = useRef(0);
  const pinchRef = useRef<{ d: number; mx: number; my: number; z: number; px: number; py: number } | null>(null);
  const containerPageRef = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<View>(null);

  const setDrawModeSync = (m: 'include' | 'exclude') => { setDrawMode(m); drawModeRef.current = m; };

  const TOPBAR = 50;
  const TOOLBAR = 110 + insets.bottom;
  const availH = SCREEN_H - TOPBAR - TOOLBAR - insets.top - 8;
  const aspect = imageWidth && imageHeight ? imageWidth / imageHeight : 1;
  let dW = SCREEN_W;
  let dH = SCREEN_W / aspect;
  if (dH > availH) { dH = availH; dW = availH * aspect; }

  // Keep refs for dimensions (used in PanResponder closure)
  const dWRef = useRef(dW); dWRef.current = dW;
  const dHRef = useRef(dH); dHRef.current = dH;

  // Convert screen pageX/pageY to image coords via container absolute position
  const pageToImage = (pageX: number, pageY: number) => {
    const relX = pageX - containerPageRef.current.x;
    const relY = pageY - containerPageRef.current.y;
    const cx = dWRef.current / 2;
    const cy = dHRef.current / 2;
    return {
      x: (relX - cx - panXRef.current) / zoomRef.current + cx,
      y: (relY - cy - panYRef.current) / zoomRef.current + cy,
    };
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const t = evt.nativeEvent.touches;
        if (t && t.length >= 2) { pinchRef.current = null; return; }
        const p = pageToImage(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
        isDrawingRef.current = true;
        curPtsRef.current = [p];
        setCurrentPoints([p]);
      },
      onPanResponderMove: (evt) => {
        const t = evt.nativeEvent.touches;
        if (t && t.length >= 2) {
          isDrawingRef.current = false;
          setCurrentPoints([]); curPtsRef.current = [];
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
          return;
        }
        if (!isDrawingRef.current) return;
        const p = pageToImage(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
        const pts = curPtsRef.current;
        const last = pts[pts.length - 1];
        if (last && Math.abs(p.x - last.x) < 2 && Math.abs(p.y - last.y) < 2) return;
        const np = [...pts, p];
        curPtsRef.current = np;
        setCurrentPoints(np);
      },
      onPanResponderRelease: () => {
        pinchRef.current = null;
        if (!isDrawingRef.current) return;
        isDrawingRef.current = false;
        const pts = curPtsRef.current;
        if (pts.length >= 3) addArea({ points: pts, mode: drawModeRef.current });
        curPtsRef.current = []; setCurrentPoints([]);
      },
    })
  ).current;

  const includeAreas = areas.filter(a => a.mode === 'include');
  const excludeAreas = areas.filter(a => a.mode === 'exclude');

  const handleCount = async () => {
    if (includeAreas.length === 0) { Alert.alert('Attenzione', "Disegna almeno un'area di inclusione."); return; }
    setLoading(true);
    try {
      const body = {
        image_base64: imageBase64, category, sensitivity,
        include_areas: includeAreas.map(a => ({ points: a.points.map(p => ({ x: (p.x / dW) * 100, y: (p.y / dH) * 100 })), mode: 'include' })),
        exclude_areas: excludeAreas.map(a => ({ points: a.points.map(p => ({ x: (p.x / dW) * 100, y: (p.y / dH) * 100 })), mode: 'exclude' })),
      };
      const res = await fetch(`${BACKEND_URL}/api/count`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setMarkers((data.objects || []).map((o: any) => ({ id: o.id, x: o.x, y: o.y, radius: o.radius || 2 })));
      router.push('/results');
    } catch (e: any) { Alert.alert('Errore', 'Errore durante il conteggio.'); }
    finally { setLoading(false); }
  };

  const sliderPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => { setSensitivity(Math.max(0.1, Math.min(1, e.nativeEvent.locationX / (SCREEN_W - 100)))); },
    onPanResponderMove: (e) => { setSensitivity(Math.max(0.1, Math.min(1, e.nativeEvent.locationX / (SCREEN_W - 100)))); },
  })).current;

  if (!imageUri) return <View style={[st.ctn, { paddingTop: insets.top }]}><Text style={st.err}>Nessuna immagine</Text></View>;

  return (
    <View style={[st.ctn, { paddingTop: insets.top }]}>
      <View style={st.topBar}>
        <TouchableOpacity testID="area-back-btn" onPress={() => router.back()} style={st.ib}><MaterialCommunityIcons name="arrow-left" size={22} color={Colors.textPrimary} /></TouchableOpacity>
        <Text style={st.topT}>Seleziona Area</Text>
        <TouchableOpacity testID="clear-areas-btn" onPress={clearAreas} style={st.ib}><MaterialCommunityIcons name="delete-outline" size={20} color={Colors.danger} /></TouchableOpacity>
      </View>

      <View style={st.cw}>
        <View
          ref={canvasRef}
          style={[st.canvas, { width: dW, height: dH, overflow: 'hidden' }]}
          {...panResponder.panHandlers}
          onLayout={() => {
            canvasRef.current?.measureInWindow?.((x: number, y: number) => {
              containerPageRef.current = { x: x || 0, y: y || 0 };
            });
          }}
        >
          <View style={{ width: dW, height: dH, transform: [{ translateX: panX }, { translateY: panY }, { scale: zoom }] }}>
            <Image source={{ uri: imageUri }} style={{ width: dW, height: dH }} resizeMode="cover" />
            <Svg style={StyleSheet.absoluteFill} width={dW} height={dH} pointerEvents="none">
              <Defs>
                <Mask id="dm">
                  <Rect x="0" y="0" width={dW} height={dH} fill="white" />
                  {/* Render ALL areas in drawing order */}
                  {areas.map((a, i) => (
                    <Path key={`a${i}`} d={pointsToPathD(a.points)} fill={a.mode === 'include' ? 'black' : 'white'} />
                  ))}
                </Mask>
              </Defs>
              <Rect x="0" y="0" width={dW} height={dH} fill="rgba(255,255,255,0.55)" mask="url(#dm)" />
              {currentPoints.length > 1 && (
                <Path
                  d={currentPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
                  stroke={drawModeRef.current === 'include' ? Colors.success : Colors.danger}
                  strokeWidth={2 / zoom} fill="none" strokeDasharray="6,4"
                />
              )}
            </Svg>
          </View>
        </View>
      </View>

      <View style={[st.tb, { paddingBottom: insets.bottom + 6 }]}>
        <View style={st.br}>
          <TouchableOpacity testID="include-mode-btn" style={[st.mb, drawMode === 'include' && { backgroundColor: Colors.success }]} onPress={() => setDrawModeSync('include')}>
            <MaterialCommunityIcons name="plus-circle-outline" size={18} color={drawMode === 'include' ? '#fff' : Colors.success} />
            <Text style={[st.mbt, drawMode === 'include' && { color: '#fff' }]}>Includi</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="exclude-mode-btn" style={[st.mb, drawMode === 'exclude' && { backgroundColor: Colors.danger }]} onPress={() => setDrawModeSync('exclude')}>
            <MaterialCommunityIcons name="minus-circle-outline" size={18} color={drawMode === 'exclude' ? '#fff' : Colors.danger} />
            <Text style={[st.mbt, drawMode === 'exclude' && { color: '#fff' }]}>Escludi</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="undo-area-btn" style={st.mb} onPress={undoArea}><MaterialCommunityIcons name="undo" size={18} color={Colors.textSecondary} /></TouchableOpacity>
          <TouchableOpacity testID="count-btn" style={[st.cb, includeAreas.length === 0 && { opacity: 0.4 }]} onPress={handleCount} disabled={isLoading || includeAreas.length === 0}>
            {isLoading ? <ActivityIndicator color="#fff" size="small" /> : <><MaterialCommunityIcons name="counter" size={18} color="#fff" /><Text style={st.cbt}>Conta</Text></>}
          </TouchableOpacity>
        </View>
        <View style={st.sr}>
          <Text style={st.sl}>Sensibilità</Text>
          <View style={st.stc} {...sliderPan.panHandlers}><View style={st.strack} /><View style={[st.sfill, { width: `${sensitivity * 100}%` }]} /><View style={[st.sthumb, { left: `${sensitivity * 100}%` }]} /></View>
          <Text style={st.sv}>{Math.round(sensitivity * 100)}%</Text>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  ctn: { flex: 1, backgroundColor: Colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, height: 50 },
  ib: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  topT: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  cw: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  canvas: { borderRadius: 6 },
  err: { color: Colors.textTertiary, fontSize: 16, textAlign: 'center', marginTop: 100 },
  tb: { paddingHorizontal: 8, paddingTop: 8, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.surfaceElevated },
  br: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  mb: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.surfaceElevated },
  mbt: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  cb: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: Colors.primary },
  cbt: { fontSize: 13, fontWeight: '700', color: '#fff' },
  sr: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingHorizontal: 8, gap: 8 },
  sl: { fontSize: 11, fontWeight: '600', color: Colors.textTertiary, width: 65 },
  stc: { flex: 1, height: 36, justifyContent: 'center' },
  strack: { height: 4, backgroundColor: Colors.surfaceElevated, borderRadius: 2 },
  sfill: { position: 'absolute', height: 4, backgroundColor: Colors.primary, borderRadius: 2 },
  sthumb: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primary, marginLeft: -11, top: 7 },
  sv: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, width: 35, textAlign: 'right' },
});
