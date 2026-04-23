import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '../src/store/AppContext';
import { Colors } from '../src/constants/colors';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { advancedParams, setAdvancedParams } = useAppContext();
  const [local, setLocal] = useState({ ...advancedParams });

  const update = (key: string, val: string) => {
    const n = parseFloat(val);
    if (!isNaN(n)) setLocal(p => ({ ...p, [key]: n }));
  };

  const save = () => { setAdvancedParams(local as any); router.back(); };
  const resetDefaults = () => {
    const defaults = { dp: 1.2, blur_size: 9, param1: 100, param2_override: 0, min_dist_factor: 0.8, clahe_clip: 2.5, obj_count_estimate: 40 };
    setLocal(defaults);
    setAdvancedParams(defaults);
  };

  const params = [
    { key: 'dp', label: 'dp (risoluzione inversa)', desc: 'Più alto = più veloce, meno preciso. Default: 1.2', min: 0.5, max: 3 },
    { key: 'blur_size', label: 'Blur kernel size', desc: 'Dimensione sfocatura gaussiana (dispari). Default: 9', min: 3, max: 21 },
    { key: 'param1', label: 'param1 (Canny threshold)', desc: 'Soglia per il rilevamento bordi. Default: 100', min: 30, max: 300 },
    { key: 'param2_override', label: 'param2 (override manuale)', desc: '0 = automatico da slider sensibilità. Più basso = più cerchi rilevati. Range: 15-80', min: 0, max: 100 },
    { key: 'min_dist_factor', label: 'Fattore distanza minima', desc: 'Moltiplicatore per distanza min tra cerchi. Default: 0.8', min: 0.2, max: 2 },
    { key: 'clahe_clip', label: 'CLAHE clip limit', desc: 'Intensità enhancement contrasto. Default: 2.5', min: 0.5, max: 10 },
    { key: 'obj_count_estimate', label: 'Stima oggetti nella foto', desc: 'Stima di quanti oggetti ci sono. Influenza dimensione attesa. Default: 40', min: 5, max: 500 },
  ];

  return (
    <View style={[st.ctn, { paddingTop: insets.top }]}>
      <View style={st.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={st.ib}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={st.topT}>Impostazioni Algoritmo</Text>
        <TouchableOpacity onPress={resetDefaults} style={st.ib}>
          <MaterialCommunityIcons name="refresh" size={20} color={Colors.warning} />
        </TouchableOpacity>
      </View>

      <ScrollView style={st.scroll} contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>
        {params.map(p => (
          <View key={p.key} style={st.paramRow}>
            <Text style={st.paramLabel}>{p.label}</Text>
            <Text style={st.paramDesc}>{p.desc}</Text>
            <View style={st.inputRow}>
              <TextInput
                testID={`setting-${p.key}`}
                style={st.input}
                value={String((local as any)[p.key])}
                onChangeText={(v) => update(p.key, v)}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
              <Text style={st.range}>{p.min} - {p.max}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={[st.saveBar, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity testID="save-settings-btn" style={st.saveBtn} onPress={save}>
          <MaterialCommunityIcons name="content-save" size={20} color="#fff" />
          <Text style={st.saveTxt}>Salva e Torna</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  ctn: { flex: 1, backgroundColor: Colors.background },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, height: 50 },
  ib: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  topT: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  scroll: { flex: 1, paddingHorizontal: 16 },
  paramRow: { marginTop: 16, backgroundColor: Colors.surface, borderRadius: 12, padding: 14 },
  paramLabel: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  paramDesc: { fontSize: 11, color: Colors.textTertiary, marginTop: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 12 },
  input: { flex: 1, height: 42, backgroundColor: Colors.surfaceElevated, borderRadius: 8, paddingHorizontal: 14, color: Colors.textPrimary, fontSize: 16, fontWeight: '700' },
  range: { fontSize: 11, color: Colors.textTertiary },
  saveBar: { paddingHorizontal: 16, paddingTop: 8, backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.surfaceElevated },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, backgroundColor: Colors.primary, borderRadius: 12 },
  saveTxt: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
