import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Modal,
  ActivityIndicator,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { saveProfile } from '../src/services/profileService';
import { useTheme } from '../src/context/ThemeContext';
import type { ThemeColors } from '../src/constants/theme';
import type { UserProfile, AppRole, Sex, BloodType } from '../src/types/triageTypes';

const PROVINCIAS: string[] = [
  'Chiriquí',
  'Bocas del Toro',
  'Panamá',
  'Panamá Oeste',
  'Colón',
  'Veraguas',
  'Coclé',
  'Herrera',
  'Los Santos',
  'Darién',
  'Comarca Ngäbe-Buglé',
  'Comarca Guna Yala',
];

const BLOOD_TYPES: BloodType[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function OnboardingScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Paso actual (1: Datos Personales, 2: Rol)
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);

  // Estados de datos personales (Paso 1)
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<Sex | null>(null);
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [province, setProvince] = useState('');
  const [bloodType, setBloodType] = useState<BloodType | null>(null);
  const [hasDisability, setHasDisability] = useState(false);
  const [disabilityDescription, setDisabilityDescription] = useState('');
  const [medicalConditions, setMedicalConditions] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');

  // Estado de modal de selección de provincia
  const [isProvinceModalVisible, setIsProvinceModalVisible] = useState(false);

  // Estado de rol (Paso 2)
  const [role, setRole] = useState<AppRole>('ciudadano');

  // Estados de control
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  /**
   * Valida los campos obligatorios del Paso 1
   */
  const validateStep1 = (): boolean => {
    setErrorMessage(null);

    if (!fullName.trim()) {
      setErrorMessage('Por favor ingresa tu nombre completo.');
      return false;
    }

    const parsedAge = parseInt(age.trim(), 10);
    if (!age.trim() || isNaN(parsedAge) || parsedAge <= 0 || parsedAge > 125) {
      setErrorMessage('Por favor ingresa una edad válida (1 a 125 años).');
      return false;
    }

    if (!sex) {
      setErrorMessage('Por favor selecciona tu sexo (M, F u Otro).');
      return false;
    }

    if (!phone.trim()) {
      setErrorMessage('Por favor ingresa tu número telefónico.');
      return false;
    }

    if (!province.trim()) {
      setErrorMessage('Por favor selecciona tu provincia o comarca.');
      return false;
    }

    if (hasDisability && !disabilityDescription.trim()) {
      setErrorMessage('Por favor describe la condición de discapacidad o apoyo necesario.');
      return false;
    }

    return true;
  };

  /**
   * Avanza al Paso 2 si la validación es correcta
   */
  const handleNextStep = () => {
    console.log('[Onboarding] Validando datos personales...');
    if (validateStep1()) {
      setErrorMessage(null);
      setCurrentStep(2);
      console.log('[Onboarding] Avanzando al Paso 2: Selección de rol');
    }
  };

  /**
   * Retrocede al Paso 1
   */
  const handlePrevStep = () => {
    setErrorMessage(null);
    setCurrentStep(1);
    console.log('[Onboarding] Regresando al Paso 1');
  };

  /**
   * Guarda el perfil y redirige al dashboard
   */
  const handleSaveProfile = () => {
    console.log('[Onboarding] Iniciando guardado de perfil...');
    setErrorMessage(null);

    if (!validateStep1()) {
      setCurrentStep(1);
      return;
    }

    if (!role) {
      setErrorMessage('Por favor selecciona un rol para continuar.');
      return;
    }

    setIsSaving(true);

    try {
      const now = Date.now();
      const profile: UserProfile = {
        fullName: fullName.trim(),
        age: parseInt(age.trim(), 10),
        sex: sex as Sex,
        phone: phone.trim(),
        address: address.trim() || undefined,
        province: province.trim(),
        bloodType: bloodType || undefined,
        hasDisability,
        disabilityDescription: hasDisability ? disabilityDescription.trim() || undefined : undefined,
        medicalConditions: medicalConditions.trim() || undefined,
        emergencyContactName: emergencyContactName.trim() || undefined,
        emergencyContactPhone: emergencyContactPhone.trim() || undefined,
        role,
        createdAt: now,
        updatedAt: now,
      };

      saveProfile(db, profile);
      console.log('[Onboarding] Perfil guardado exitosamente en SQLite:', profile.fullName);

      // Redirigir al inicio de la aplicación
      router.replace('/(tabs)' as any);
    } catch (error) {
      console.error('[Onboarding] Error al guardar perfil:', error);
      setErrorMessage('Ocurrió un error al guardar el perfil en la base de datos local. Intente nuevamente.');
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flexOne}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Principal */}
          <View style={styles.header}>
            <View style={styles.logoRow}>
              <View style={styles.logoBadge}>
                <Ionicons name="shield-checkmark" size={28} color={theme.primary} />
              </View>
              <View>
                <Text style={styles.appTitle}>Perseus.ai</Text>
                <Text style={styles.subtitle}>Configuración inicial</Text>
              </View>
            </View>
            <Text style={styles.headerDescription}>
              Bienvenido al sistema local de triaje de emergencias y respuesta en desastres para Panamá.
            </Text>
          </View>

          {/* Indicadores de Paso */}
          <View style={styles.stepIndicatorContainer}>
            <TouchableOpacity
              style={[styles.stepItem, currentStep === 1 && styles.stepItemActive]}
              onPress={() => currentStep === 2 && setCurrentStep(1)}
              activeOpacity={0.7}
            >
              <View style={[styles.stepCircle, currentStep === 1 && styles.stepCircleActive]}>
                <Text style={[styles.stepNumber, currentStep === 1 && styles.stepNumberActive]}>1</Text>
              </View>
              <Text style={[styles.stepTitle, currentStep === 1 && styles.stepTitleActive]}>
                1. Datos Personales
              </Text>
            </TouchableOpacity>

            <View style={styles.stepDivider} />

            <TouchableOpacity
              style={[styles.stepItem, currentStep === 2 && styles.stepItemActive]}
              onPress={handleNextStep}
              activeOpacity={0.7}
            >
              <View style={[styles.stepCircle, currentStep === 2 && styles.stepCircleActive]}>
                <Text style={[styles.stepNumber, currentStep === 2 && styles.stepNumberActive]}>2</Text>
              </View>
              <Text style={[styles.stepTitle, currentStep === 2 && styles.stepTitleActive]}>
                2. Rol en Emergencias
              </Text>
            </TouchableOpacity>
          </View>

          {/* Mensaje de Error si la validación falla */}
          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={20} color="#EF4444" style={styles.errorIcon} />
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* ========================================================================= */}
          {/* PASO 1: DATOS PERSONALES */}
          {/* ========================================================================= */}
          {currentStep === 1 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="person-circle-outline" size={22} color={theme.primary} />
                <Text style={styles.cardTitle}>Paso 1: Información Personal</Text>
              </View>
              <Text style={styles.cardHelperText}>
                Los campos con asterisco (*) son obligatorios para facilitar tu localización y atención.
              </Text>

              {/* Nombre Completo */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  Nombre completo <Text style={styles.requiredAsterisk}>*</Text>
                </Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Ej: Juan Pérez Morales"
                  placeholderTextColor={theme.textPlaceholder}
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                />
              </View>

              {/* Edad y Sexo en dos columnas */}
              <View style={styles.twoColumnRow}>
                <View style={styles.halfColumn}>
                  <Text style={styles.label}>
                    Edad <Text style={styles.requiredAsterisk}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Ej: 32"
                    placeholderTextColor={theme.textPlaceholder}
                    value={age}
                    onChangeText={setAge}
                    keyboardType="numeric"
                    maxLength={3}
                  />
                </View>

                <View style={styles.halfColumn}>
                  <Text style={styles.label}>
                    Sexo <Text style={styles.requiredAsterisk}>*</Text>
                  </Text>
                  <View style={styles.sexButtonsContainer}>
                    <TouchableOpacity
                      style={[styles.sexButton, sex === 'M' && styles.sexButtonActive]}
                      onPress={() => setSex('M')}
                    >
                      <Text style={[styles.sexButtonText, sex === 'M' && styles.sexButtonTextActive]}>
                        M
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.sexButton, sex === 'F' && styles.sexButtonActive]}
                      onPress={() => setSex('F')}
                    >
                      <Text style={[styles.sexButtonText, sex === 'F' && styles.sexButtonTextActive]}>
                        F
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.sexButton, sex === 'Otro' && styles.sexButtonActive]}
                      onPress={() => setSex('Otro')}
                    >
                      <Text style={[styles.sexButtonText, sex === 'Otro' && styles.sexButtonTextActive]}>
                        Otro
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Teléfono */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  Teléfono <Text style={styles.requiredAsterisk}>*</Text>
                </Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Ej: +507 6123-4567"
                  placeholderTextColor={theme.textPlaceholder}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
              </View>

              {/* Provincia */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>
                  Provincia o Comarca <Text style={styles.requiredAsterisk}>*</Text>
                </Text>
                <TouchableOpacity
                  style={styles.pickerSelector}
                  onPress={() => setIsProvinceModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <View style={styles.pickerValueRow}>
                    <Ionicons
                      name="location-outline"
                      size={18}
                      color={province ? theme.primary : theme.textMuted}
                      style={styles.inputIcon}
                    />
                    <Text style={province ? styles.pickerSelectedText : styles.pickerPlaceholderText}>
                      {province || 'Selecciona tu provincia o comarca...'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={18} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Dirección Habitual */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Dirección habitual (Opcional)</Text>
                <TextInput
                  style={styles.textArea}
                  placeholder="Ej: Calle Principal, Casa #14, Barriada Santa María"
                  placeholderTextColor={theme.textPlaceholder}
                  value={address}
                  onChangeText={setAddress}
                  multiline
                  numberOfLines={2}
                />
              </View>

              {/* Tipo de Sangre */}
              <View style={styles.fieldGroup}>
                <View style={styles.labelWithBadgeRow}>
                  <Text style={styles.label}>Tipo de sangre (Opcional)</Text>
                  {bloodType && (
                    <TouchableOpacity onPress={() => setBloodType(null)}>
                      <Text style={styles.clearSelectionText}>Quitar selección</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.chipsGrid}>
                  {BLOOD_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.chipButton, bloodType === type && styles.chipButtonActive]}
                      onPress={() => setBloodType(bloodType === type ? null : type)}
                    >
                      <Text
                        style={[styles.chipButtonText, bloodType === type && styles.chipButtonTextActive]}
                      >
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Switch de Discapacidad */}
              <View style={styles.switchGroup}>
                <View style={styles.switchTextContainer}>
                  <Text style={styles.switchLabel}>¿Sufre alguna discapacidad?</Text>
                  <Text style={styles.switchSubLabel}>
                    Permite priorizar apoyo físico o de movilidad en evacuaciones.
                  </Text>
                </View>
                <Switch
                  value={hasDisability}
                  onValueChange={setHasDisability}
                  trackColor={{ false: theme.border, true: theme.primary }}
                  thumbColor={hasDisability ? '#FFFFFF' : theme.textMuted}
                />
              </View>

              {/* Descripción de Discapacidad condicional */}
              {hasDisability && (
                <View style={styles.conditionalFieldGroup}>
                  <Text style={styles.label}>
                    Descripción de la discapacidad <Text style={styles.requiredAsterisk}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Ej: Movilidad reducida (silla de ruedas), sordera..."
                    placeholderTextColor={theme.textPlaceholder}
                    value={disabilityDescription}
                    onChangeText={setDisabilityDescription}
                  />
                </View>
              )}

              {/* Condiciones Médicas Relevantes */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Condiciones médicas relevantes (Opcional)</Text>
                <TextInput
                  style={styles.textArea}
                  placeholder="Ej: Hipertensión arterial, diabetes tipo 2, asma, alérgico a penicilina..."
                  placeholderTextColor={theme.textPlaceholder}
                  value={medicalConditions}
                  onChangeText={setMedicalConditions}
                  multiline
                  numberOfLines={2}
                />
              </View>

              {/* Contacto de Emergencia */}
              <View style={styles.subSectionHeader}>
                <Ionicons name="call-outline" size={18} color={theme.primary} />
                <Text style={styles.subSectionTitle}>Contacto de Emergencia (Opcional)</Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Nombre del contacto</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Ej: María González (Familiar)"
                  placeholderTextColor={theme.textPlaceholder}
                  value={emergencyContactName}
                  onChangeText={setEmergencyContactName}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Teléfono del contacto</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Ej: +507 6999-8888"
                  placeholderTextColor={theme.textPlaceholder}
                  value={emergencyContactPhone}
                  onChangeText={setEmergencyContactPhone}
                  keyboardType="phone-pad"
                />
              </View>

              {/* Botón Siguiente */}
              <TouchableOpacity
                style={styles.primaryActionButton}
                onPress={handleNextStep}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryActionText}>Siguiente: Selección de Rol</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          )}

          {/* ========================================================================= */}
          {/* PASO 2: SELECCIÓN DE ROL */}
          {/* ========================================================================= */}
          {currentStep === 2 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="people-outline" size={22} color={theme.primary} />
                <Text style={styles.cardTitle}>Paso 2: ¿Cuál es tu rol principal?</Text>
              </View>
              <Text style={styles.cardHelperText}>
                Selecciona la función que desempeñarás en situaciones de emergencia. Podrás modificarla en cualquier momento en tu perfil.
              </Text>

              {/* Tarjeta Rol 1: Ciudadano */}
              <TouchableOpacity
                style={[
                  styles.roleCard,
                  role === 'ciudadano' && styles.roleCardSelected,
                ]}
                onPress={() => setRole('ciudadano')}
                activeOpacity={0.8}
              >
                <View style={styles.roleCardHeader}>
                  <View style={styles.roleIconContainer}>
                    <Text style={styles.roleEmoji}>🏠</Text>
                  </View>
                  <View style={styles.roleTitleColumn}>
                    <Text style={styles.roleCardTitle}>Ciudadano</Text>
                    <Text style={styles.roleCardSubtitle}>Reporta y solicita auxilio</Text>
                  </View>
                  <View style={styles.roleRadioCircle}>
                    {role === 'ciudadano' && <View style={styles.roleRadioInner} />}
                  </View>
                </View>

                <Text style={styles.roleDescription}>
                  Ideal para residentes y familias. Permite crear reportes rápidos de emergencia con fotos y voz, analizados con IA en tu dispositivo, y pedir auxilio a rescatistas cercanos.
                </Text>

                <View style={styles.roleHighlightsContainer}>
                  <View style={styles.highlightItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                    <Text style={styles.highlightText}>Envío asistido de reportes con IA</Text>
                  </View>
                  <View style={styles.highlightItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                    <Text style={styles.highlightText}>Transmisión P2P directa sin señal móvil</Text>
                  </View>
                  <View style={styles.highlightItem}>
                    <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                    <Text style={styles.highlightText}>Información médica integrada para socorristas</Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* Tarjeta Rol 2: Rescatista */}
              <TouchableOpacity
                style={[
                  styles.roleCard,
                  role === 'rescatista' && styles.roleCardSelected,
                ]}
                onPress={() => setRole('rescatista')}
                activeOpacity={0.8}
              >
                <View style={styles.roleCardHeader}>
                  <View style={styles.roleIconContainer}>
                    <Text style={styles.roleEmoji}>🚑</Text>
                  </View>
                  <View style={styles.roleTitleColumn}>
                    <Text style={styles.roleCardTitle}>Rescatista</Text>
                    <Text style={styles.roleCardSubtitle}>Recibe y atiende incidentes</Text>
                  </View>
                  <View style={styles.roleRadioCircle}>
                    {role === 'rescatista' && <View style={styles.roleRadioInner} />}
                  </View>
                </View>

                <Text style={styles.roleDescription}>
                  Diseñado para miembros de SINAPROC, Cruz Roja, Bomberos, Policía o brigadistas comunitarios. Recibe reportes en el terreno y visualiza el triaje START priorizado por colores.
                </Text>

                <View style={styles.roleHighlightsContainer}>
                  <View style={styles.highlightItem}>
                    <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
                    <Text style={styles.highlightText}>Recepción y consolidación de reportes P2P</Text>
                  </View>
                  <View style={styles.highlightItem}>
                    <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
                    <Text style={styles.highlightText}>Triaje START (Rojo, Amarillo, Verde, Negro)</Text>
                  </View>
                  <View style={styles.highlightItem}>
                    <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
                    <Text style={styles.highlightText}>Coordinación operativa y atención de víctimas</Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* Botones de Acción Paso 2 */}
              <View style={styles.step2ButtonsRow}>
                <TouchableOpacity
                  style={styles.secondaryActionButton}
                  onPress={handlePrevStep}
                  disabled={isSaving}
                  activeOpacity={0.85}
                >
                  <Ionicons name="arrow-back" size={18} color={theme.text} />
                  <Text style={styles.secondaryActionText}>Atrás</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryActionButtonStep2, isSaving && styles.disabledButton]}
                  onPress={handleSaveProfile}
                  disabled={isSaving}
                  activeOpacity={0.85}
                >
                  {isSaving ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.primaryActionText}>Guardando...</Text>
                    </View>
                  ) : (
                    <View style={styles.actionRow}>
                      <Text style={styles.primaryActionText}>Finalizar y Entrar</Text>
                      <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Modal de Selección de Provincia */}
          <Modal
            visible={isProvinceModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setIsProvinceModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <View style={styles.modalTitleRow}>
                    <Ionicons name="map" size={20} color={theme.primary} />
                    <Text style={styles.modalTitle}>Selecciona tu Provincia</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.modalCloseButton}
                    onPress={() => setIsProvinceModalVisible(false)}
                  >
                    <Ionicons name="close" size={20} color={theme.textMuted} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalScrollView}>
                  {PROVINCIAS.map((prov) => {
                    const isSelected = province === prov;
                    return (
                      <TouchableOpacity
                        key={prov}
                        style={[styles.modalItem, isSelected && styles.modalItemSelected]}
                        onPress={() => {
                          setProvince(prov);
                          setIsProvinceModalVisible(false);
                          console.log('[Onboarding] Provincia seleccionada:', prov);
                        }}
                      >
                        <Text
                          style={[styles.modalItemText, isSelected && styles.modalItemTextSelected]}
                        >
                          {prov}
                        </Text>
                        {isSelected && (
                          <Ionicons name="checkmark" size={18} color={theme.primary} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </Modal>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.background,
    },
    flexOne: {
      flex: 1,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 40,
    },
    header: {
      marginBottom: 20,
      marginTop: 4,
    },
    logoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    logoBadge: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    appTitle: {
      fontSize: 26,
      fontWeight: '800',
      color: theme.text,
      letterSpacing: 0.5,
    },
    subtitle: {
      fontSize: 14,
      color: theme.textMuted,
      fontWeight: '500',
    },
    headerDescription: {
      fontSize: 13,
      color: theme.textMuted,
      lineHeight: 18,
      marginTop: 4,
    },
    stepIndicatorContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.card,
      borderRadius: 12,
      borderColor: theme.border,
      borderWidth: 1,
      padding: 8,
      marginBottom: 16,
    },
    stepItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 8,
    },
    stepItemActive: {
      backgroundColor: theme.cardInner,
    },
    stepCircle: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    stepCircleActive: {
      backgroundColor: theme.primary,
    },
    stepNumber: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.textMuted,
    },
    stepNumberActive: {
      color: '#FFFFFF',
    },
    stepTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.textMuted,
    },
    stepTitleActive: {
      color: theme.text,
      fontWeight: '700',
    },
    stepDivider: {
      width: 1,
      height: 20,
      backgroundColor: theme.border,
      marginHorizontal: 4,
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.dangerMuted,
      borderColor: theme.danger,
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
    },
    errorIcon: {
      marginRight: 8,
    },
    errorBannerText: {
      color: theme.danger,
      fontSize: 13,
      fontWeight: '600',
      flex: 1,
      lineHeight: 18,
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: 14,
      borderColor: theme.border,
      borderWidth: 1,
      padding: 18,
      marginBottom: 24,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
      gap: 8,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.text,
    },
    cardHelperText: {
      fontSize: 13,
      color: theme.textMuted,
      marginBottom: 18,
      lineHeight: 18,
    },
    fieldGroup: {
      marginBottom: 14,
    },
    twoColumnRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 14,
    },
    halfColumn: {
      flex: 1,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.textSecondary,
      marginBottom: 6,
    },
    labelWithBadgeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    clearSelectionText: {
      fontSize: 12,
      color: theme.sky,
      fontWeight: '500',
    },
    requiredAsterisk: {
      color: theme.danger,
      fontWeight: '700',
    },
    textInput: {
      backgroundColor: theme.inputBackground,
      borderColor: theme.inputBorder,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: theme.text,
    },
    textArea: {
      backgroundColor: theme.inputBackground,
      borderColor: theme.inputBorder,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: theme.text,
      minHeight: 64,
      textAlignVertical: 'top',
    },
    sexButtonsContainer: {
      flexDirection: 'row',
      gap: 6,
      height: 44,
    },
    sexButton: {
      flex: 1,
      backgroundColor: theme.inputBackground,
      borderColor: theme.inputBorder,
      borderWidth: 1,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sexButtonActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    sexButtonText: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    sexButtonTextActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    pickerSelector: {
      backgroundColor: theme.inputBackground,
      borderColor: theme.inputBorder,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    pickerValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    inputIcon: {
      marginRight: 8,
    },
    pickerPlaceholderText: {
      color: theme.textPlaceholder,
      fontSize: 14,
    },
    pickerSelectedText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600',
    },
    chipsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chipButton: {
      backgroundColor: theme.inputBackground,
      borderColor: theme.inputBorder,
      borderWidth: 1,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 14,
      minWidth: 46,
      alignItems: 'center',
    },
    chipButtonActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    chipButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.textMuted,
    },
    chipButtonTextActive: {
      color: '#FFFFFF',
    },
    switchGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.cardInner,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      marginVertical: 8,
    },
    switchTextContainer: {
      flex: 1,
      marginRight: 12,
    },
    switchLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 2,
    },
    switchSubLabel: {
      fontSize: 11,
      color: theme.textMuted,
      lineHeight: 15,
    },
    conditionalFieldGroup: {
      backgroundColor: theme.cardInner,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      marginBottom: 14,
    },
    subSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 10,
      marginBottom: 12,
      paddingTop: 10,
      borderTopColor: theme.border,
      borderTopWidth: 1,
    },
    subSectionTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
    },
    primaryActionButton: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 14,
    },
    primaryActionText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    roleCard: {
      backgroundColor: theme.cardInner,
      borderColor: theme.border,
      borderWidth: 1.5,
      borderRadius: 12,
      padding: 16,
      marginBottom: 14,
    },
    roleCardSelected: {
      borderColor: theme.primary,
      backgroundColor: theme.primaryMuted,
    },
    roleCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    roleIconContainer: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: theme.card,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    roleEmoji: {
      fontSize: 22,
    },
    roleTitleColumn: {
      flex: 1,
    },
    roleCardTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: theme.text,
    },
    roleCardSubtitle: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 2,
    },
    roleRadioCircle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderColor: theme.primary,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    roleRadioInner: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: theme.primary,
    },
    roleDescription: {
      fontSize: 13,
      color: theme.textSecondary,
      lineHeight: 18,
      marginBottom: 12,
    },
    roleHighlightsContainer: {
      gap: 6,
      borderTopColor: theme.border,
      borderTopWidth: 1,
      paddingTop: 10,
    },
    highlightItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    highlightText: {
      fontSize: 12,
      color: theme.textSecondary,
    },
    step2ButtonsRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 10,
    },
    secondaryActionButton: {
      flex: 1,
      backgroundColor: theme.cardInner,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 10,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    secondaryActionText: {
      color: theme.textSecondary,
      fontSize: 15,
      fontWeight: '600',
    },
    primaryActionButtonStep2: {
      flex: 2,
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    disabledButton: {
      opacity: 0.6,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: theme.modalOverlay,
      justifyContent: 'center',
      padding: 20,
    },
    modalContent: {
      backgroundColor: theme.modalBg,
      borderRadius: 14,
      borderColor: theme.border,
      borderWidth: 1,
      maxHeight: '75%',
      overflow: 'hidden',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderBottomColor: theme.border,
      borderBottomWidth: 1,
    },
    modalTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.text,
    },
    modalCloseButton: {
      padding: 4,
    },
    modalScrollView: {
      padding: 8,
    },
    modalItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 8,
    },
    modalItemSelected: {
      backgroundColor: theme.cardInner,
    },
    modalItemText: {
      fontSize: 14,
      color: theme.textSecondary,
    },
    modalItemTextSelected: {
      color: theme.primary,
      fontWeight: '700',
    },
  });
