import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  PanResponder,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { useAppContext, Point } from '../src/store/AppContext';
import { Colors } from '../src/constants/colors';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const GRID_RES = 70;

// Ray-casting point-in-polygon
function isPointInPolygon(px: number, py: number, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointsToOpenPath(points: Point[]): string {
  if (points.length < 2) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
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
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const currentPointsRef = useRef<Point[]>([]);
  const isDrawingRef = useRef(false);

  const TOPBAR_H = 50;
  const TOOLBAR_H = 110 + insets.bottom;
  const availableH = SCREEN_HEIGHT - TOPBAR_H - TOOLBAR_H - insets.top - 8;
  const imgAspect = imageWidth && imageHeight ? imageWidth / imageHeight : 1;
  let displayW = SCREEN_WIDTH;
  let displayH = SCREEN_WIDTH / imgAspect;
  if (displayH > availableH) { displayH = availableH; displayW = availableH * imgAspect; }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        if (evt.nativeEvent.touches && evt.nativeEvent.touches.length >= 2) return;
        const locX = evt.nativeEvent.locationX;
        const locY = evt.nativeEvent.locationY;
        if (locX != null && locY != null) {
          isDrawingRef.current = true;
          currentPointsRef.current = [{ x: locX, y: locY }];
          setCurrentPoints([{ x: locX, y: locY }]);
        }
      },
      onPanResponderMove: (evt) => {
        if (evt.nativeEvent.touches && evt.nativeEvent.touches.length >= 2) { isDrawingRef.current = false; return; }
        if (!isDrawingRef.current) return;
        const locX = evt.nativeEvent.locationX;
        const locY = evt.nativeEvent.locationY;
        if (locX != null && locY != null) {
          const pts = currentPointsRef.current;
          const last = pts[pts.length - 1];
          if (last && Math.abs(locX - last.x) < 3 && Math.abs(locY - last.y) < 3) return;
          const newPts = [...pts, { x: locX, y: locY }];
          currentPointsRef.current = newPts;
          setCurrentPoints(newPts);
        }
      },
      onPanResponderRelease: () => {
        if (!isDrawingRef.current) return;
        isDrawingRef.current = false;
        const pts = currentPointsRef.current;
        if (pts.length >= 3) { addArea({ points: pts, mode: drawMode }); }
        currentPointsRef.current = [];
        setCurrentPoints([]);
      },
    })
  ).current;

  const includeAreas = areas.filter((a) => a.mode === 'include');
  const excludeAreas = areas.filter((a) => a.mode === 'exclude');

  // Build pixel-grid overlay: reliable on all platforms
  const overlayRects = useMemo(() => {
    const cellW = displayW / GRID_RES;
    const cellH = displayH / GRID_RES;
    const rects: { x: number; y: number; w: number; h: number }[] = [];

    for (let row = 0; row < GRID_RES; row++) {
      let runStart = -1;
      for (let col = 0; col <= GRID_RES; col++) {
        const px = (col + 0.5) * cellW;
        const py = (row + 0.5) * cellH;

        let included = false;
        if (col < GRID_RES) {
          for (const area of includeAreas) {
            if (isPointInPolygon(px, py, area.points)) { included = true; break; }
          }
          if (included) {
            for (const area of excludeAreas) {
              if (isPointInPolygon(px, py, area.points)) { included = false; break; }
            }
          }
        }

        const isDimmed = col >= GRID_RES || !included;
        if (isDimmed && runStart === -1) {
          runStart = col;
        } else if (!isDimmed && runStart !== -1) {
          rects.push({ x: runStart * cellW, y: row * cellH, w: (col - runStart) * cellW, h: cellH + 0.5 });
          runStart = -1;
        }
      }
      if (runStart !== -1 && runStart < GRID_RES) {
        rects.push({ x: runStart * cellW, y: row * cellH, w: (GRID_RES - runStart) * cellW, h: cellH + 0.5 });
      }
    }
    return rects;
  }, [areas, displayW, displayH]);

  const handleCount = async () => {
    if (includeAreas.length === 0) {
      Alert.alert('Attenzione', "Disegna almeno un'area di inclusione prima di contare.");
      return;
    }
    setLoading(true);
    try {
      const body = {
        image_base64: imageBase64,
        category,
        sensitivity,
        include_areas: includeAreas.map((a) => ({
          points: a.points.map((p) => ({ x: (p.x / displayW) * 100, y: (p.y / displayH) * 100 })),
          mode: 'include',
        })),
        exclude_areas: excludeAreas.map((a) => ({
          points: a.points.map((p) => ({ x: (p.x / displayW) * 100, y: (p.y / displayH) * 100 })),
          mode: 'exclude',
        })),
      };
      const response = await fetch(`${BACKEND_URL}/api/count`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const data = await response.json();
      setMarkers((data.objects || []).map((obj: any) => ({ id: obj.id, x: obj.x, y: obj.y })));
      router.push('/results');
    } catch (error: any) {
      console.error('Count error:', error);
      Alert.alert('Errore', 'Si è verificato un errore durante il conteggio. Riprova.');
    } finally {
      setLoading(false);
    }
  };

  // Slider touch handler
  const sliderRef = useRef<View>(null);
  const sliderPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const x = evt.nativeEvent.locationX;
        const w = SCREEN_WIDTH - 100;
        setSensitivity(Math.max(0.1, Math.min(1, x / w)));
      },
      onPanResponderMove: (evt) => {
        const x = evt.nativeEvent.locationX;
        const w = SCREEN_WIDTH - 100;
        setSensitivity(Math.max(0.1, Math.min(1, x / w)));
      },
    })
  ).current;

  if (!imageUri) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Nessuna immagine selezionata</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity testID="area-back-btn" onPress={() => router.back()} style={styles.iconBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Seleziona Area</Text>
        <TouchableOpacity testID="clear-areas-btn" onPress={clearAreas} style={styles.iconBtn}>
          <MaterialCommunityIcons name="delete-outline" size={20} color={Colors.danger} />
        </TouchableOpacity>
      </View>

      {/* Image canvas */}
      <View style={styles.canvasWrapper}>
        <View style={[styles.canvas, { width: displayW, height: displayH }]} {...panResponder.panHandlers}>
          <Image source={{ uri: imageUri }} style={{ width: displayW, height: displayH }} resizeMode="cover" />
          <Svg style={StyleSheet.absoluteFill} width={displayW} height={displayH} pointerEvents="none">
            {/* Pixel-grid overlay */}
            {overlayRects.map((r, i) => (
              <Rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill="rgba(255,255,255,0.55)" />
            ))}
            {/* Current drawing dashed path */}
            {currentPoints.length > 1 && (
              <Path
                d={pointsToOpenPath(currentPoints)}
                stroke={drawMode === 'include' ? Colors.success : Colors.danger}
                strokeWidth={2.5}
                fill="none"
                strokeDasharray="6,4"
              />
            )}
          </Svg>
        </View>
      </View>

      {/* Bottom toolbar */}
      <View style={[styles.toolbar, { paddingBottom: insets.bottom + 6 }]}>
        {/* Buttons row */}
        <View style={styles.buttonsRow}>
          <TouchableOpacity
            testID="include-mode-btn"
            style={[styles.modeBtn, drawMode === 'include' && { backgroundColor: Colors.success }]}
            onPress={() => setDrawMode('include')}
          >
            <MaterialCommunityIcons name="plus-circle-outline" size={18} color={drawMode === 'include' ? '#fff' : Colors.success} />
            <Text style={[styles.modeBtnText, drawMode === 'include' && { color: '#fff' }]}>Includi</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="exclude-mode-btn"
            style={[styles.modeBtn, drawMode === 'exclude' && { backgroundColor: Colors.danger }]}
            onPress={() => setDrawMode('exclude')}
          >
            <MaterialCommunityIcons name="minus-circle-outline" size={18} color={drawMode === 'exclude' ? '#fff' : Colors.danger} />
            <Text style={[styles.modeBtnText, drawMode === 'exclude' && { color: '#fff' }]}>Escludi</Text>
          </TouchableOpacity>

          <TouchableOpacity testID="undo-area-btn" style={styles.modeBtn} onPress={undoArea}>
            <MaterialCommunityIcons name="undo" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            testID="count-btn"
            style={[styles.countBtn, includeAreas.length === 0 && { opacity: 0.4 }]}
            onPress={handleCount}
            disabled={isLoading || includeAreas.length === 0}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <MaterialCommunityIcons name="counter" size={18} color="#fff" />
                <Text style={styles.countBtnText}>Conta</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Sensitivity slider */}
        <View style={styles.sliderRow}>
          <Text style={styles.sliderLabel}>Sensibilità</Text>
          <View style={styles.sliderTrackContainer} {...sliderPanResponder.panHandlers}>
            <View style={styles.sliderTrack} />
            <View style={[styles.sliderFill, { width: `${sensitivity * 100}%` }]} />
            <View style={[styles.sliderThumb, { left: `${sensitivity * 100}%` }]} />
          </View>
          <Text style={styles.sliderValue}>{Math.round(sensitivity * 100)}%</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, height: 50 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  canvasWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  canvas: { overflow: 'hidden', borderRadius: 6 },
  errorText: { color: Colors.textTertiary, fontSize: 16, textAlign: 'center', marginTop: 100 },
  toolbar: { paddingHorizontal: 8, paddingTop: 8, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.surfaceElevated },
  buttonsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  modeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.surfaceElevated },
  modeBtnText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  countBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: Colors.primary },
  countBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  sliderRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingHorizontal: 8, gap: 8 },
  sliderLabel: { fontSize: 11, fontWeight: '600', color: Colors.textTertiary, width: 65 },
  sliderTrackContainer: { flex: 1, height: 36, justifyContent: 'center' },
  sliderTrack: { height: 4, backgroundColor: Colors.surfaceElevated, borderRadius: 2 },
  sliderFill: { position: 'absolute', height: 4, backgroundColor: Colors.primary, borderRadius: 2 },
  sliderThumb: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primary, marginLeft: -11, top: 7 },
  sliderValue: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, width: 35, textAlign: 'right' },
});
