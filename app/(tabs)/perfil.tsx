import React, { useCallback, useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { getProfile, saveProfile } from '../../src/services/profileService';
import { useTheme } from '../../src/context/ThemeContext';
import type { ThemeColors } from '../../src/constants/theme';
import type { UserProfile, AppRole, Sex, BloodType } from '../../src/types/triageTypes';

const PROVINCIAS = [
  'Chiriquí', 'Bocas del Toro', 'Panamá', 'Panamá Oeste', 'Colón', 'Veraguas',
  'Coclé', 'Herrera', 'Los Santos', 'Darién', 'Comarca Ngäbe-Buglé', 'Comarca Guna Yala',
];

const BLOOD_TYPES: BloodType[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const SEX_OPTIONS: { label: string; value: Sex }[] = [
  { label: 'M', value: 'M' },
  { label: 'F', value: 'F' },
  { label: 'Otro', value: 'Otro' },
];

export default function PerfilScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const { theme, mode, setThemeMode } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [showProvincePicker, setShowProvincePicker] = useState(false);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<Sex>('M');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [province, setProvince] = useState('');
  const [bloodType, setBloodType] = useState<BloodType | ''>('');
  const [hasDisability, setHasDisability] = useState(false);
  const [disabilityDescription, setDisabilityDescription] = useState('');
  const [medicalConditions, setMedicalConditions] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [role, setRole] = useState<AppRole>('ciudadano');

  useFocusEffect(
    useCallback(() => {
      const p = getProfile(db);
      if (p) {
        setProfile(p);
        setFullName(p.fullName);
        setAge(String(p.age));
        setSex(p.sex);
        setPhone(p.phone);
        setAddress(p.address || '');
        setProvince(p.province);
        setBloodType(p.bloodType || '');
        setHasDisability(p.hasDisability);
        setDisabilityDescription(p.disabilityDescription || '');
        setMedicalConditions(p.medicalConditions || '');
        setEmergencyContactName(p.emergencyContactName || '');
        setEmergencyContactPhone(p.emergencyContactPhone || '');
        setRole(p.role);
      }
    }, [db])
  );

  const handleSave = () => {
    if (!fullName.trim() || !age.trim() || !phone.trim() || !province) {
      Alert.alert('Campos requeridos', 'Nombre, edad, teléfono y provincia son obligatorios.');
      return;
    }

    const updated: UserProfile = {
      id: 1,
      fullName: fullName.trim(),
      age: parseInt(age, 10),
      sex,
      phone: phone.trim(),
      address: address.trim() || undefined,
      province,
      bloodType: (bloodType as BloodType) || undefined,
      hasDisability,
      disabilityDescription: hasDisability ? disabilityDescription.trim() || undefined : undefined,
      medicalConditions: medicalConditions.trim() || undefined,
      emergencyContactName: emergencyContactName.trim() || undefined,
      emergencyContactPhone: emergencyContactPhone.trim() || undefined,
      role,
      createdAt: profile?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    saveProfile(db, updated);
    Alert.alert('✅ Guardado', 'Tu perfil ha sido actualizado.');
  };

  const handleRoleChange = (newRole: AppRole) => {
    if (newRole === role) return;
    Alert.alert(
      'Cambiar rol',
      `¿Deseas cambiar tu rol a ${newRole === 'rescatista' ? 'Rescatista' : 'Ciudadano'}? Esto cambiará la vista de la aplicación.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: () => setRole(newRole) },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>👤 Mi Perfil</Text>

        {/* Nombre */}
        <Text style={styles.label}>Nombre completo *</Text>
        <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Nombre completo" placeholderTextColor={theme.textPlaceholder} />

        {/* Edad */}
        <Text style={styles.label}>Edad *</Text>
        <TextInput style={styles.input} value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="Edad" placeholderTextColor={theme.textPlaceholder} />

        {/* Sexo */}
        <Text style={styles.label}>Sexo *</Text>
        <View style={styles.segmentRow}>
          {SEX_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.segment, sex === opt.value && styles.segmentActive]}
              onPress={() => setSex(opt.value)}
            >
              <Text style={[styles.segmentText, sex === opt.value && styles.segmentTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Teléfono */}
        <Text style={styles.label}>Teléfono *</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Teléfono" placeholderTextColor={theme.textPlaceholder} />

        {/* Provincia */}
        <Text style={styles.label}>Provincia *</Text>
        <TouchableOpacity style={styles.picker} onPress={() => setShowProvincePicker(true)}>
          <Text style={province ? styles.pickerText : styles.pickerPlaceholder}>
            {province || 'Seleccionar provincia'}
          </Text>
          <Ionicons name="chevron-down" size={18} color={theme.textMuted} />
        </TouchableOpacity>

        {/* Dirección */}
        <Text style={styles.label}>Dirección habitual</Text>
        <TextInput style={[styles.input, styles.multiline]} value={address} onChangeText={setAddress} multiline placeholder="Dirección" placeholderTextColor={theme.textPlaceholder} />

        {/* Tipo de sangre */}
        <Text style={styles.label}>Tipo de sangre</Text>
        <View style={styles.bloodGrid}>
          {BLOOD_TYPES.map((bt) => (
            <TouchableOpacity
              key={bt}
              style={[styles.bloodChip, bloodType === bt && styles.bloodChipActive]}
              onPress={() => setBloodType(bloodType === bt ? '' : bt)}
            >
              <Text style={[styles.bloodChipText, bloodType === bt && styles.bloodChipTextActive]}>{bt}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Discapacidad */}
        <View style={styles.switchRow}>
          <Text style={styles.label}>¿Sufre alguna discapacidad?</Text>
          <Switch
            value={hasDisability}
            onValueChange={setHasDisability}
            trackColor={{ true: theme.primary, false: theme.border }}
            thumbColor="#FFFFFF"
          />
        </View>
        {hasDisability && (
          <TextInput style={[styles.input, styles.multiline]} value={disabilityDescription} onChangeText={setDisabilityDescription} multiline placeholder="Descripción de la discapacidad" placeholderTextColor={theme.textPlaceholder} />
        )}

        {/* Condiciones médicas */}
        <Text style={styles.label}>Condiciones médicas</Text>
        <TextInput style={[styles.input, styles.multiline]} value={medicalConditions} onChangeText={setMedicalConditions} multiline placeholder="Alergias, medicamentos, condiciones crónicas..." placeholderTextColor={theme.textPlaceholder} />

        {/* Contacto de emergencia */}
        <Text style={styles.label}>Contacto de emergencia</Text>
        <TextInput style={styles.input} value={emergencyContactName} onChangeText={setEmergencyContactName} placeholder="Nombre del contacto" placeholderTextColor={theme.textPlaceholder} />
        <TextInput style={[styles.input, { marginTop: 6 }]} value={emergencyContactPhone} onChangeText={setEmergencyContactPhone} keyboardType="phone-pad" placeholder="Teléfono del contacto" placeholderTextColor={theme.textPlaceholder} />

        {/* Rol */}
        <Text style={[styles.label, { marginTop: 20 }]}>Rol en emergencias</Text>
        <View style={styles.roleRow}>
          <TouchableOpacity
            style={[styles.roleCard, role === 'ciudadano' && styles.roleCardActive]}
            onPress={() => handleRoleChange('ciudadano')}
          >
            <Text style={styles.roleEmoji}>🏠</Text>
            <Text style={[styles.roleLabel, role === 'ciudadano' && styles.roleLabelActive]}>Ciudadano</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.roleCard, role === 'rescatista' && styles.roleCardActive]}
            onPress={() => handleRoleChange('rescatista')}
          >
            <Text style={styles.roleEmoji}>🚑</Text>
            <Text style={[styles.roleLabel, role === 'rescatista' && styles.roleLabelActive]}>Rescatista</Text>
          </TouchableOpacity>
        </View>

        {/* Guardar */}
        <TouchableOpacity style={styles.saveButton} onPress={handleSave} activeOpacity={0.8}>
          <Ionicons name="save" size={20} color="#FFFFFF" />
          <Text style={styles.saveButtonText}>Guardar cambios</Text>
        </TouchableOpacity>

        {/* Apariencia / Modo Claro / Oscuro */}
        <Text style={[styles.sectionTitle, { marginTop: 26 }]}>🎨 Apariencia de la App</Text>
        <View style={styles.themeRow}>
          <TouchableOpacity
            style={[styles.themeCard, mode === 'system' && styles.themeCardActive]}
            onPress={() => setThemeMode('system')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="phone-portrait-outline"
              size={20}
              color={mode === 'system' ? theme.primary : theme.textMuted}
            />
            <Text style={[styles.themeLabel, mode === 'system' && styles.themeLabelActive]}>
              Sistema
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.themeCard, mode === 'dark' && styles.themeCardActive]}
            onPress={() => setThemeMode('dark')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="moon"
              size={20}
              color={mode === 'dark' ? theme.primary : theme.textMuted}
            />
            <Text style={[styles.themeLabel, mode === 'dark' && styles.themeLabelActive]}>
              Oscuro
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.themeCard, mode === 'light' && styles.themeCardActive]}
            onPress={() => setThemeMode('light')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="sunny"
              size={20}
              color={mode === 'light' ? theme.primary : theme.textMuted}
            />
            <Text style={[styles.themeLabel, mode === 'light' && styles.themeLabelActive]}>
              Claro
            </Text>
          </TouchableOpacity>
        </View>

        {/* Herramientas de Laboratorio IA */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>🔬 Diagnóstico y Modelos de IA</Text>
        <TouchableOpacity
          style={styles.labLinkCard}
          onPress={() => router.push('/whisper-test')}
          activeOpacity={0.8}
        >
          <Ionicons name="mic-circle" size={24} color={theme.sky} />
          <View style={{ flex: 1 }}>
            <Text style={styles.labLinkTitle}>Laboratorio Whisper Tiny ASR</Text>
            <Text style={styles.labLinkSub}>Probar transcripción de voz local</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.labLinkCard, { borderColor: theme.purple }]}
          onPress={() => router.push('/vision-test')}
          activeOpacity={0.8}
        >
          <Ionicons name="eye" size={24} color={theme.purple} />
          <View style={{ flex: 1 }}>
            <Text style={styles.labLinkTitle}>Laboratorio Visión (VisionPsy)</Text>
            <Text style={styles.labLinkSub}>Probar evaluación visual de daños</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </TouchableOpacity>

        {/* Info privacidad */}
        <View style={styles.infoCard}>
          <Ionicons name="lock-closed" size={18} color={theme.success} />
          <Text style={styles.infoText}>
            Tus datos se almacenan solo en este dispositivo. Se comparten únicamente cuando envías un reporte via P2P.
          </Text>
        </View>
      </ScrollView>

      {/* Province Picker Modal */}
      <Modal visible={showProvincePicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Seleccionar Provincia</Text>
            <FlatList
              data={PROVINCIAS}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, province === item && styles.modalItemActive]}
                  onPress={() => {
                    setProvince(item);
                    setShowProvincePicker(false);
                  }}
                >
                  <Text style={[styles.modalItemText, province === item && styles.modalItemTextActive]}>{item}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowProvincePicker(false)}>
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(theme: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 40 },
    title: { fontSize: 22, fontWeight: '800', color: theme.text, marginBottom: 16 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginTop: 20, marginBottom: 6 },
    label: { color: theme.textMuted, fontSize: 13, fontWeight: '600', marginTop: 12, marginBottom: 4 },
    input: {
      backgroundColor: theme.card,
      borderRadius: 10,
      padding: 12,
      color: theme.text,
      fontSize: 15,
      borderWidth: 1,
      borderColor: theme.border,
    },
    multiline: { minHeight: 70, textAlignVertical: 'top' },
    segmentRow: { flexDirection: 'row', gap: 8 },
    segment: {
      flex: 1,
      backgroundColor: theme.card,
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    segmentActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    segmentText: { color: theme.textMuted, fontSize: 14, fontWeight: '600' },
    segmentTextActive: { color: '#FFFFFF' },
    picker: {
      backgroundColor: theme.card,
      borderRadius: 10,
      padding: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
    },
    pickerText: { color: theme.text, fontSize: 15 },
    pickerPlaceholder: { color: theme.textPlaceholder, fontSize: 15 },
    bloodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    bloodChip: {
      backgroundColor: theme.card,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    bloodChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    bloodChipText: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
    bloodChipTextActive: { color: '#FFFFFF' },
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
    roleRow: { flexDirection: 'row', gap: 12 },
    roleCard: {
      flex: 1,
      backgroundColor: theme.card,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: theme.border,
    },
    roleCardActive: { borderColor: theme.primary, backgroundColor: theme.cardInner },
    roleEmoji: { fontSize: 28, marginBottom: 4 },
    roleLabel: { color: theme.textMuted, fontSize: 14, fontWeight: '600' },
    roleLabelActive: { color: theme.primary, fontWeight: '700' },

    // Selector de tema
    themeRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    themeCard: {
      flex: 1,
      backgroundColor: theme.card,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: theme.border,
      gap: 6,
    },
    themeCardActive: {
      borderColor: theme.primary,
      backgroundColor: theme.cardInner,
    },
    themeLabel: { color: theme.textMuted, fontSize: 12, fontWeight: '600' },
    themeLabelActive: { color: theme.primary, fontWeight: '700' },

    saveButton: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      padding: 16,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      marginTop: 24,
    },
    saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    infoCard: {
      backgroundColor: theme.card,
      borderRadius: 10,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 16,
      borderWidth: 1,
      borderColor: theme.border,
    },
    labLinkCard: {
      backgroundColor: theme.card,
      borderRadius: 12,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 10,
      borderWidth: 1,
      borderColor: theme.border,
    },
    labLinkTitle: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600',
    },
    labLinkSub: {
      color: theme.textMuted,
      fontSize: 12,
    },
    infoText: { color: theme.textMuted, fontSize: 12, flex: 1, lineHeight: 16 },
    modalOverlay: { flex: 1, backgroundColor: theme.modalOverlay, justifyContent: 'flex-end' },
    modalContent: { backgroundColor: theme.modalBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%', padding: 16 },
    modalTitle: { fontSize: 18, fontWeight: '700', color: theme.text, textAlign: 'center', marginBottom: 12 },
    modalItem: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: theme.border },
    modalItemActive: { backgroundColor: theme.cardInner },
    modalItemText: { color: theme.text, fontSize: 15 },
    modalItemTextActive: { color: theme.primary, fontWeight: '600' },
    modalClose: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
    modalCloseText: { color: theme.primary, fontSize: 16, fontWeight: '600' },
  });
}
