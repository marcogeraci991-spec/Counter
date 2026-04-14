import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppContext } from '../src/store/AppContext';
import { Colors } from '../src/constants/colors';

export default function CameraScreen() {
  const router = useRouter();
  const { categoryLabel, setImage } = useAppContext();

  const handleImageResult = (result: ImagePicker.ImagePickerResult) => {
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      const base64 = asset.base64 || '';
      const width = asset.width || 0;
      const height = asset.height || 0;
      setImage(asset.uri, base64, width, height);
      router.push('/area-select');
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permesso negato', 'Consenti l\'accesso alla fotocamera per scattare foto.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      base64: true,
    });
    handleImageResult(result);
  };

  const pickFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permesso negato', 'Consenti l\'accesso alla galleria per selezionare foto.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      base64: true,
    });
    handleImageResult(result);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity
          testID="camera-back-btn"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>{categoryLabel || 'Categoria'}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.instruction}>Seleziona una foto per il conteggio</Text>

        <TouchableOpacity
          testID="take-photo-btn"
          style={styles.actionBtn}
          activeOpacity={0.7}
          onPress={takePhoto}
        >
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="camera" size={48} color={Colors.primary} />
          </View>
          <Text style={styles.actionLabel}>Scatta Foto</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="pick-gallery-btn"
          style={styles.actionBtn}
          activeOpacity={0.7}
          onPress={pickFromGallery}
        >
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="image-multiple" size={48} color={Colors.primary} />
          </View>
          <Text style={styles.actionLabel}>Dalla Galleria</Text>
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
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryBadge: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 32,
  },
  instruction: {
    fontSize: 18,
    fontWeight: '500',
    color: Colors.textTertiary,
    textAlign: 'center',
    marginBottom: 16,
  },
  actionBtn: {
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
});
