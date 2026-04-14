import React, { useState, useRef, useCallback } from 'react';
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
import Svg, { Path, Rect, Defs, Mask } from 'react-native-svg';
import { useAppContext, Point } from '../src/store/AppContext';
import { Colors } from '../src/constants/colors';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

function pointsToPathD(points: Point[]): string {
  if (points.length < 2) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
}

export default function AreaSelectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    imageUri,
    imageBase64,
    imageWidth,
    imageHeight,
    category,
    areas,
    addArea,
    undoArea,
    clearAreas,
    setMarkers,
    isLoading,
    setLoading,
  } = useAppContext();

  const [drawMode, setDrawMode] = useState<'include' | 'exclude'>('include');
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const currentPointsRef = useRef<Point[]>([]);
  const isDrawingRef = useRef(false);

  const TOPBAR_H = 50;
  const TOOLBAR_H = 60 + insets.bottom;

  // Calculate image display dimensions
  const availableH = SCREEN_HEIGHT - TOPBAR_H - TOOLBAR_H - insets.top - 16;
  const imgAspect = imageWidth && imageHeight ? imageWidth / imageHeight : 1;
  let displayW = SCREEN_WIDTH;
  let displayH = SCREEN_WIDTH / imgAspect;
  if (displayH > availableH) {
    displayH = availableH;
    displayW = availableH * imgAspect;
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches && touches.length >= 2) return;
        const locX = evt.nativeEvent.locationX;
        const locY = evt.nativeEvent.locationY;
        if (locX != null && locY != null) {
          isDrawingRef.current = true;
          currentPointsRef.current = [{ x: locX, y: locY }];
          setCurrentPoints([{ x: locX, y: locY }]);
        }
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches && touches.length >= 2) {
          isDrawingRef.current = false;
          return;
        }
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
        if (pts.length >= 3) {
          addArea({ points: pts, mode: drawMode });
        }
        currentPointsRef.current = [];
        setCurrentPoints([]);
      },
    })
  ).current;

  const includeAreas = areas.filter((a) => a.mode === 'include');
  const excludeAreas = areas.filter((a) => a.mode === 'exclude');

  const handleCount = async () => {
    if (includeAreas.length === 0) {
      Alert.alert('Attenzione', "Disegna almeno un'area di inclusione prima di contare.");
      return;
    }
    setLoading(true);
    try {
      const body = {
        image_base64: imageBase64,
        category: category,
        include_areas: includeAreas.map((a) => ({
          points: a.points.map((p) => ({
            x: (p.x / displayW) * 100,
            y: (p.y / displayH) * 100,
          })),
          mode: 'include',
        })),
        exclude_areas: excludeAreas.map((a) => ({
          points: a.points.map((p) => ({
            x: (p.x / displayW) * 100,
            y: (p.y / displayH) * 100,
          })),
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
      setMarkers(
        (data.objects || []).map((obj: any) => ({
          id: obj.id,
          x: obj.x,
          y: obj.y,
        }))
      );
      router.push('/results');
    } catch (error: any) {
      console.error('Count error:', error);
      Alert.alert('Errore', 'Si è verificato un errore durante il conteggio. Riprova.');
    } finally {
      setLoading(false);
    }
  };

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
        <TouchableOpacity testID="area-back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Seleziona Area</Text>
        <TouchableOpacity testID="clear-areas-btn" onPress={clearAreas} style={styles.backBtn}>
          <MaterialCommunityIcons name="delete-outline" size={20} color={Colors.danger} />
        </TouchableOpacity>
      </View>

      {/* Image canvas */}
      <View style={styles.canvasWrapper}>
        <View
          style={[styles.canvas, { width: displayW, height: displayH }]}
          {...panResponder.panHandlers}
        >
          <Image
            source={{ uri: imageUri }}
            style={{ width: displayW, height: displayH }}
            resizeMode="cover"
          />
          {/* SVG overlay - include areas use Mask, exclude areas as separate overlay */}
          <Svg
            style={StyleSheet.absoluteFill}
            width={displayW}
            height={displayH}
            pointerEvents="none"
          >
            <Defs>
              <Mask id="dimMask">
                {/* White = overlay visible (dimmed), Black = overlay hidden (bright) */}
                <Rect x="0" y="0" width={displayW} height={displayH} fill="white" />
                {/* Include areas -> hide overlay -> image visible */}
                {includeAreas.map((area, i) => (
                  <Path key={`inc-${i}`} d={pointsToPathD(area.points)} fill="black" />
                ))}
              </Mask>
            </Defs>
            {/* Semi-transparent white overlay with holes for include areas */}
            <Rect
              x="0"
              y="0"
              width={displayW}
              height={displayH}
              fill="rgba(255,255,255,0.55)"
              mask="url(#dimMask)"
            />
            {/* Exclude areas: separate overlay patches drawn ON TOP to restore dimming */}
            {excludeAreas.map((area, i) => (
              <Path
                key={`exc-overlay-${i}`}
                d={pointsToPathD(area.points)}
                fill="rgba(255,255,255,0.55)"
              />
            ))}
            {/* Current drawing path - dashed only */}
            {currentPoints.length > 1 && (
              <Path
                d={currentPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
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
      <View style={[styles.toolbar, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity
          testID="include-mode-btn"
          style={[styles.modeBtn, drawMode === 'include' && { backgroundColor: Colors.success }]}
          onPress={() => setDrawMode('include')}
        >
          <MaterialCommunityIcons
            name="plus-circle-outline"
            size={18}
            color={drawMode === 'include' ? '#fff' : Colors.success}
          />
          <Text style={[styles.modeBtnText, drawMode === 'include' && { color: '#fff' }]}>
            Includi
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="exclude-mode-btn"
          style={[styles.modeBtn, drawMode === 'exclude' && { backgroundColor: Colors.danger }]}
          onPress={() => setDrawMode('exclude')}
        >
          <MaterialCommunityIcons
            name="minus-circle-outline"
            size={18}
            color={drawMode === 'exclude' ? '#fff' : Colors.danger}
          />
          <Text style={[styles.modeBtnText, drawMode === 'exclude' && { color: '#fff' }]}>
            Escludi
          </Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    height: 50,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  canvasWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    overflow: 'hidden',
    borderRadius: 6,
  },
  errorText: {
    color: Colors.textTertiary,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 100,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingTop: 10,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceElevated,
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surfaceElevated,
  },
  modeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  countBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.primary,
  },
  countBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});
