import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppContext } from '../src/store/AppContext';
import { Colors } from '../src/constants/colors';

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
  const { setCategory } = useAppContext();

  const handleSelect = (item: CategoryItem, groupTitle: string) => {
    setCategory(item.id, `${groupTitle} - ${item.label}`);
    router.push('/camera');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="counter" size={36} color={Colors.primary} />
        <Text style={styles.title}>CountApp</Text>
        <Text style={styles.subtitle}>Seleziona la categoria di oggetti da contare</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
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
                    size={32}
                    color={Colors.primary}
                  />
                  <Text style={styles.cardLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.textPrimary,
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textTertiary,
    marginTop: 8,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  group: {
    marginTop: 24,
  },
  groupTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 12,
    paddingLeft: 4,
  },
  itemsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
    flex: 1,
    maxWidth: '48%' as any,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: 8,
    textAlign: 'center',
  },
});
