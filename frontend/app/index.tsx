import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '../src/store/AppContext';
import { Colors } from '../src/constants/colors';

const PADDING = 16;
const GAP = 10;
const COLS = 3;

interface CategoryItem {
  id: string;
  label: string;
  icon: string;
}

interface CategoryGroup {
  title: string;
  items: CategoryItem[];
}

const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    title: 'Barre',
    items: [
      { id: 'barre_tonde', label: 'Tonde', icon: 'circle' },
      { id: 'barre_quadre', label: 'Quadre', icon: 'square' },
      { id: 'barre_rettangolari', label: 'Rettangolari', icon: 'rectangle' },
      { id: 'barre_esagonali', label: 'Esagonali', icon: 'hexagon' },
      { id: 'barre_generiche', label: 'Generiche', icon: 'shape' },
    ],
  },
  {
    title: 'Tubi',
    items: [
      { id: 'tubi_tondi', label: 'Tondi', icon: 'circle-outline' },
      { id: 'tubi_quadri', label: 'Quadri', icon: 'square-outline' },
      { id: 'tubi_rettangolari', label: 'Rettangolari', icon: 'rectangle-outline' },
      { id: 'tubi_generici', label: 'Generici', icon: 'shape-outline' },
    ],
  },
  {
    title: 'Profili',
    items: [
      { id: 'profili_l', label: 'Profilo a L', icon: 'alpha-l-box' },
      { id: 'profili_t', label: 'Profilo a T', icon: 'alpha-t-box' },
    ],
  },
  {
    title: 'Travi',
    items: [
      { id: 'travi_ipe', label: 'Travi IPE', icon: 'alpha-i-box' },
    ],
  },
];

export default function IndexScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setCategory } = useAppContext();

  const handleSelect = (item: CategoryItem, groupTitle: string) => {
    setCategory(item.id, `${groupTitle} - ${item.label}`);
    router.push('/camera');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="counter" size={32} color={Colors.primary} />
        <Text style={styles.title}>CountApp</Text>
        <Text style={styles.subtitle}>Seleziona la categoria di oggetti da contare</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 16 }]}
      >
        {CATEGORY_GROUPS.map((group) => (
          <View key={group.title} style={styles.group}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <View style={styles.itemsRow}>
              {group.items.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  testID={`category-${item.id}`}
                  style={styles.categoryCard}
                  activeOpacity={0.7}
                  onPress={() => handleSelect(item, group.title)}
                >
                  <MaterialCommunityIcons
                    name={item.icon as any}
                    size={28}
                    color={Colors.primary}
                  />
                  <Text style={styles.cardLabel} numberOfLines={1}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.textPrimary,
    marginTop: 6,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textTertiary,
    marginTop: 6,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: PADDING,
  },
  group: {
    marginTop: 20,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 10,
    paddingLeft: 2,
  },
  itemsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  categoryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    height: 80,
    width: '31%',
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 6,
    textAlign: 'center',
  },
});
