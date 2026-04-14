import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Image,
  Alert,
  ActivityIndicator,
  PanResponder,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Path, Rect, Defs, ClipPath } from 'react-native-svg';
import { useAppContext, Point, DrawnArea } from '../src/store/AppContext';
import { Colors } from '../src/constants/colors';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const TOOLBAR_HEIGHT = 70;
const TOPBAR_HEIGHT = 56;

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

function pointsToPathD(points: Point[]): string {
  if (points.length < 2) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
}

export default function AreaSelectScreen() {
  const router = useRouter();
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

  // Calculate image display dimensions
  const availableH = SCREEN_HEIGHT - TOPBAR_HEIGHT - TOOLBAR_HEIGHT - 80;
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

  // Build overlay path (full rect with holes for include areas)
  const includeAreas = areas.filter((a) => a.mode === 'include');
  const excludeAreas = areas.filter((a) => a.mode === 'exclude');

  const buildOverlayPath = useCallback(() => {
    let d = `M 0 0 L ${displayW} 0 L ${displayW} ${displayH} L 0 ${displayH} Z`;
    includeAreas.forEach((area) => {
      if (area.points.length >= 3) {
        d += ' ' + pointsToPathD(area.points);
      }
    });
    return d;
  }, [includeAreas, displayW, displayH]);

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

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

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
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Nessuna immagine selezionata</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          testID="area-back-btn"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Seleziona Area</Text>
        <TouchableOpacity
          testID="clear-areas-btn"
          onPress={clearAreas}
          style={styles.backBtn}
        >
          <MaterialCommunityIcons name="delete-outline" size={22} color={Colors.danger} />
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
          <Svg
            style={StyleSheet.absoluteFill}
            width={displayW}
            height={displayH}
            pointerEvents="none"
          >
            {/* Overlay with holes for include areas */}
            <Path
              d={buildOverlayPath()}
              fill={Colors.overlayLight}
              fillRule="evenodd"
            />
            {/* Exclude areas on top */}
            {excludeAreas.map((area, i) => (
              <Path
                key={`ex-fill-${i}`}
                d={pointsToPathD(area.points)}
                fill={Colors.overlayLight}
              />
            ))}
            {/* Strokes for all drawn areas */}
            {areas.map((area, i) => (
              <Path
                key={`stroke-${i}`}
                d={pointsToPathD(area.points)}
                stroke={area.mode === 'include' ? Colors.success : Colors.danger}
                strokeWidth={2.5}
                fill="none"
              />
            ))}
            {/* Current drawing path */}
            {currentPoints.length > 1 && (
              <Path
                d={
                  currentPoints
                    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
                    .join(' ')
                }
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
      <View style={styles.toolbar}>
        <TouchableOpacity
          testID="include-mode-btn"
          style={[
            styles.modeBtn,
            drawMode === 'include' && { backgroundColor: Colors.success },
          ]}
          onPress={() => setDrawMode('include')}
        >
          <MaterialCommunityIcons
            name="plus-circle-outline"
            size={20}
            color={drawMode === 'include' ? '#fff' : Colors.success}
          />
          <Text
            style={[
              styles.modeBtnText,
              drawMode === 'include' && { color: '#fff' },
            ]}
          >
            Includi
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="exclude-mode-btn"
          style={[
            styles.modeBtn,
            drawMode === 'exclude' && { backgroundColor: Colors.danger },
          ]}
          onPress={() => setDrawMode('exclude')}
        >
          <MaterialCommunityIcons
            name="minus-circle-outline"
            size={20}
            color={drawMode === 'exclude' ? '#fff' : Colors.danger}
          />
          <Text
            style={[
              styles.modeBtnText,
              drawMode === 'exclude' && { color: '#fff' },
            ]}
          >
            Escludi
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="undo-area-btn"
          style={styles.modeBtn}
          onPress={undoArea}
        >
          <MaterialCommunityIcons name="undo" size={20} color={Colors.textSecondary} />
          <Text style={styles.modeBtnText}>Annulla</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="count-btn"
          style={[
            styles.countBtn,
            includeAreas.length === 0 && { opacity: 0.4 },
          ]}
          onPress={handleCount}
          disabled={isLoading || includeAreas.length === 0}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <MaterialCommunityIcons name="counter" size={20} color="#fff" />
              <Text style={styles.countBtnText}>Conta</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    height: TOPBAR_HEIGHT,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontSize: 17,
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
    borderRadius: 8,
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    height: TOOLBAR_HEIGHT,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceElevated,
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surfaceElevated,
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  countBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.primary,
  },
  countBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
