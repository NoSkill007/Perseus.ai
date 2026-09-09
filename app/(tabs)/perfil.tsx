import React, { useCallback, useState } from 'react';
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
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { getProfile, saveProfile } from '../../src/services/profileService';
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
  const db = useSQLiteContext();
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
        <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Nombre completo" placeholderTextColor="#64748B" />

        {/* Edad */}
        <Text style={styles.label}>Edad *</Text>
        <TextInput style={styles.input} value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="Edad" placeholderTextColor="#64748B" />

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
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Teléfono" placeholderTextColor="#64748B" />

        {/* Provincia */}
        <Text style={styles.label}>Provincia *</Text>
        <TouchableOpacity style={styles.picker} onPress={() => setShowProvincePicker(true)}>
          <Text style={province ? styles.pickerText : styles.pickerPlaceholder}>
            {province || 'Seleccionar provincia'}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#94A3B8" />
        </TouchableOpacity>

        {/* Dirección */}
        <Text style={styles.label}>Dirección habitual</Text>
        <TextInput style={[styles.input, styles.multiline]} value={address} onChangeText={setAddress} multiline placeholder="Dirección" placeholderTextColor="#64748B" />

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
          <Switch value={hasDisability} onValueChange={setHasDisability} trackColor={{ true: '#3B82F6' }} thumbColor="#F8FAFC" />
        </View>
        {hasDisability && (
          <TextInput style={[styles.input, styles.multiline]} value={disabilityDescription} onChangeText={setDisabilityDescription} multiline placeholder="Descripción de la discapacidad" placeholderTextColor="#64748B" />
        )}

        {/* Condiciones médicas */}
        <Text style={styles.label}>Condiciones médicas</Text>
        <TextInput style={[styles.input, styles.multiline]} value={medicalConditions} onChangeText={setMedicalConditions} multiline placeholder="Alergias, medicamentos, condiciones crónicas..." placeholderTextColor="#64748B" />

        {/* Contacto de emergencia */}
        <Text style={styles.label}>Contacto de emergencia</Text>
        <TextInput style={styles.input} value={emergencyContactName} onChangeText={setEmergencyContactName} placeholder="Nombre del contacto" placeholderTextColor="#64748B" />
        <TextInput style={[styles.input, { marginTop: 6 }]} value={emergencyContactPhone} onChangeText={setEmergencyContactPhone} keyboardType="phone-pad" placeholder="Teléfono del contacto" placeholderTextColor="#64748B" />

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
          <Ionicons name="save" size={20} color="#F8FAFC" />
          <Text style={styles.saveButtonText}>Guardar cambios</Text>
        </TouchableOpacity>

        {/* Info privacidad */}
        <View style={styles.infoCard}>
          <Ionicons name="lock-closed" size={18} color="#22C55E" />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: '#F8FAFC', marginBottom: 20 },
  label: { fontSize: 13, color: '#94A3B8', fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 12,
    color: '#F8FAFC',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#334155',
  },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  segmentRow: { flexDirection: 'row', gap: 8 },
  segment: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  segmentActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  segmentText: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
  segmentTextActive: { color: '#F8FAFC' },
  picker: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  pickerText: { color: '#F8FAFC', fontSize: 15 },
  pickerPlaceholder: { color: '#64748B', fontSize: 15 },
  bloodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bloodChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  bloodChipActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  bloodChipText: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  bloodChipTextActive: { color: '#F8FAFC' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  roleRow: { flexDirection: 'row', gap: 12 },
  roleCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#334155',
  },
  roleCardActive: { borderColor: '#3B82F6' },
  roleEmoji: { fontSize: 28, marginBottom: 4 },
  roleLabel: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
  roleLabelActive: { color: '#3B82F6' },
  saveButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
  },
  saveButtonText: { color: '#F8FAFC', fontSize: 16, fontWeight: '700' },
  infoCard: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  infoText: { color: '#94A3B8', fontSize: 12, flex: 1, lineHeight: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1E293B', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%', padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#F8FAFC', textAlign: 'center', marginBottom: 12 },
  modalItem: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  modalItemActive: { backgroundColor: '#334155' },
  modalItemText: { color: '#F8FAFC', fontSize: 15 },
  modalItemTextActive: { color: '#3B82F6', fontWeight: '600' },
  modalClose: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  modalCloseText: { color: '#3B82F6', fontSize: 16, fontWeight: '600' },
});
