import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '../src/store/AppContext';
import { Colors } from '../src/constants/colors';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const TOPBAR_HEIGHT = 60;
const TOOLBAR_HEIGHT = 70;
const MARKER_SIZE = 24;

export default function ResultsScreen() {
  const router = useRouter();
  const {
    imageUri,
    imageWidth,
    imageHeight,
    markers,
    addMarker,
    removeMarker,
    reset,
  } = useAppContext();

  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'view' | 'add' | 'remove'>('view');

  // Calculate image display dimensions
  const availableH = SCREEN_HEIGHT - TOPBAR_HEIGHT - TOOLBAR_HEIGHT - 40;
  const imgAspect = imageWidth && imageHeight ? imageWidth / imageHeight : 1;
  let displayW = SCREEN_WIDTH;
  let displayH = SCREEN_WIDTH / imgAspect;
  if (displayH > availableH) {
    displayH = availableH;
    displayW = availableH * imgAspect;
  }

  const handleImagePress = useCallback(
    (e: any) => {
      if (mode !== 'add') return;
      const locX = e.nativeEvent.locationX ?? e.nativeEvent.offsetX ?? 0;
      const locY = e.nativeEvent.locationY ?? e.nativeEvent.offsetY ?? 0;
      const x = (locX / displayW) * 100;
      const y = (locY / displayH) * 100;
      addMarker(x, y);
    },
    [mode, displayW, displayH, addMarker]
  );

  const handleMarkerPress = useCallback(
    (id: number) => {
      if (mode === 'remove') {
        removeMarker(id);
      }
    },
    [mode, removeMarker]
  );

  const handleNewCount = () => {
    reset();
    router.replace('/');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top bar with count */}
      <View style={styles.topBar}>
        <TouchableOpacity
          testID="results-back-btn"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.countBadge}>
          <Text style={styles.countLabel}>Risultato</Text>
          <Text testID="count-result-text" style={styles.countValue}>
            {markers.length}
          </Text>
        </View>
        <TouchableOpacity
          testID="new-count-btn"
          onPress={handleNewCount}
          style={styles.backBtn}
        >
          <MaterialCommunityIcons name="refresh" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Image with markers */}
      <View style={styles.imageWrapper}>
        <View style={{ width: displayW, height: displayH, position: 'relative' }}>
          <Image
            source={{ uri: imageUri || '' }}
            style={{ width: displayW, height: displayH }}
            resizeMode="cover"
          />
          {/* Markers */}
          {markers.map((marker) => {
            const left = (marker.x / 100) * displayW - MARKER_SIZE / 2;
            const top = (marker.y / 100) * displayH - MARKER_SIZE / 2;
            return (
              <TouchableOpacity
                key={marker.id}
                testID={`marker-${marker.id}`}
                onPress={() => handleMarkerPress(marker.id)}
                activeOpacity={mode === 'remove' ? 0.5 : 1}
                style={[
                  styles.marker,
                  {
                    left,
                    top,
                    width: MARKER_SIZE,
                    height: MARKER_SIZE,
                    borderRadius: MARKER_SIZE / 2,
                  },
                ]}
              >
                <Text style={styles.markerText}>{marker.id}</Text>
              </TouchableOpacity>
            );
          })}
          {/* Tap layer for add mode */}
          {mode === 'add' && (
            <Pressable
              testID="add-marker-tap-area"
              style={StyleSheet.absoluteFill}
              onPress={handleImagePress}
            />
          )}
        </View>
      </View>

      {/* Bottom toolbar */}
      <View style={[styles.toolbar, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity
          testID="manual-add-marker-btn"
          style={[
            styles.actionBtn,
            mode === 'add' && { backgroundColor: Colors.success },
          ]}
          onPress={() => setMode(mode === 'add' ? 'view' : 'add')}
        >
          <MaterialCommunityIcons
            name="plus"
            size={28}
            color={mode === 'add' ? '#fff' : Colors.success}
          />
        </TouchableOpacity>

        <TouchableOpacity
          testID="manual-remove-marker-btn"
          style={[
            styles.actionBtn,
            mode === 'remove' && { backgroundColor: Colors.danger },
          ]}
          onPress={() => setMode(mode === 'remove' ? 'view' : 'remove')}
        >
          <MaterialCommunityIcons
            name="minus"
            size={28}
            color={mode === 'remove' ? '#fff' : Colors.danger}
          />
        </TouchableOpacity>

        <View style={styles.modeIndicator}>
          <Text style={styles.modeText}>
            {mode === 'add'
              ? 'Tocca per aggiungere'
              : mode === 'remove'
              ? 'Tocca marker per rimuovere'
              : 'Visualizzazione'}
          </Text>
        </View>

        <TouchableOpacity
          testID="new-photo-btn"
          style={styles.newPhotoBtn}
          onPress={handleNewCount}
        >
          <MaterialCommunityIcons name="camera-retake" size={22} color="#fff" />
          <Text style={styles.newPhotoText}>Nuovo</Text>
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
    paddingHorizontal: 16,
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
  countBadge: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: 24,
    paddingVertical: 6,
    borderRadius: 16,
  },
  countLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.textTertiary,
  },
  countValue: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.primary,
  },
  imageWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marker: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 122, 255, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  markerText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    height: TOOLBAR_HEIGHT,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceElevated,
    gap: 12,
  },
  actionBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeIndicator: {
    flex: 1,
    alignItems: 'center',
  },
  modeText: {
    fontSize: 12,
    color: Colors.textTertiary,
    fontWeight: '500',
  },
  newPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.primary,
  },
  newPhotoText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});
