# Perseus.ai 🚨

> **Red P2P de triaje emergencial offline-first, con IA on-device, para el Decentralized AI Hackathon (ISD Summit, 9–11 sept 2026, Ciudad de Panamá).**

---

## 1. El Problema

Cuando ocurre un desastre natural (inundaciones en Chiriquí, deslizamientos en San Miguelito, sismos en Bocas del Toro), la infraestructura de telecomunicaciones suele ser de las primeras en colapsar. Las aplicaciones de emergencia convencionales dependen de internet y de servidores centrales remotos. 

**Perseus.ai** resuelve este problema mediante una arquitectura **100% offline-first**:
1. **Captura Multimodal en Campo:** Los afectados o brigadistas pueden registrar la emergencia por voz (audio), fotos de daños o relato de texto, incluso en modo avión.
2. **Triaje con IA On-Device (QVAC):** Modelos locales cuantizados procesan el audio (Whisper), evalúan la severidad y extraen una ficha estructurada con categorías humanitarias del **Manual Esfera** y prioridad **START** (Rojo, Amarillo, Verde, Negro).
3. **Sincronización P2P Sin Internet:** Los reportes confirmados se difunden directamente entre dispositivos móviles vía Wi-Fi local / BLE / sockets P2P, permitiendo a los rescatistas coordinar asignaciones sin depender de la nube.

---

## 2. Arquitectura del Sistema

```
┌────────────────────────────────┐       Mesh P2P Local      ┌────────────────────────────────┐
│  Dispositivo A (Afectado)      │◄── (WiFi LAN / BLE) ───►│  Dispositivo B (Rescatista)    │
│                                │                         │                                │
│  1. UI de Rol (Captura)        │                         │  1. Cola de Prioridad (START)  │
│  2. QVAC SDK (Whisper + LLM)   │                         │  2. QVAC SDK (Mismo runtime)   │
│  3. SQLite Local (4 entidades) │                         │  3. SQLite Local (4 entidades) │
└────────────────────────────────┘                         └────────────────────────────────┘
```

- **Principio de Cómputo Secuencial:** El dispositivo nunca paraleliza cómputo intensivo de IA con difusión de red; primero procesa secuencialmente modelo por modelo liberando la memoria RAM inmediatamente, y luego transmite los eventos.
- **Sin Servidor Central:** Cada teléfono móvil mantiene su propia base de datos SQLite y converge eventualmente mediante intercambio de identificadores únicos.

---

## 3. Esquema de Datos Local (SQLite — 4 Entidades Principales)

1. `TRIAGE_REPORTS`: Almacena cada ficha de emergencia con transcripción ASR, prioridad START, necesidades Esfera, ubicación y estado de confirmación.
2. `RESCUE_NODES`: Registra los dispositivos rescatistas descubiertos en la red local (indicativo de radio `callsign`, rol, `last_seen`).
3. `ASSIGNMENTS`: Gestiona la toma de casos por brigadas y detecta colisiones de asignación concurrente.
4. `SYNC_LOG`: Bitácora auditable de transferencias P2P para verificar visualmente los saltos y acuses de recibo (ACK) ante el jurado.

---

## 4. Declaración de Base Preexistente (Sección Obligatoria)

En estricto cumplimiento con el **Artículo 11 de las Reglas del Hackathon**, se declara formalmente todo el software preexistente, modelos y librerías utilizadas como base:

- **Pesos de Modelos de IA:**
  - `Whisper Base Quantized Q8_0` (74M parámetros, formato GGML `.bin`, Licencia MIT, OpenAI / whisper.cpp).
  - `Llama 3.2 1B Instruct Q4_0` (1.23B parámetros, formato GGUF `.gguf`, Llama 3.2 Community License, Meta AI).
  - `VisionPsy-Nano` (Modelo de visión compacto, formato GGUF, Licencia Apache 2.0, Tether AI Research).
- **Runtimes y SDKs de Inferencia Local:**
  - `@qvac/sdk` (v0.18.2) y `react-native-bare-kit` (v0.11.5) por Holepunch / Tether.
- **Framework y Librerías Base:**
  - `Expo SDK 54` y `React Native 0.81.5` (Plantilla base Expo Router con TypeScript, Licencia MIT).
  - `expo-sqlite` (Motor SQLite local para React Native, Licencia MIT).
  - `expo-av` y `expo-image-picker` (Módulos de captura multimedia de audio y cámara).
- **Documentación y Referencias Humanitarias:**
  - Manual Esfera 2018 (Estándares Humanitarios de Respuesta).
  - Protocolo de Triaje START e ISO 22320:2018 (Gestión y Coordinación de Incidentes).

---

## 5. Garantía de Cero Nube (Zero-Cloud Inference Guarantee)

- ✅ **0 llamadas a APIs remotas de inferencia.** Toda transcripción, visión y clasificación ocurre físicamente en el chip del dispositivo (ARM64 / NEON).
- ✅ **Funcionamiento en Modo Avión comprobable.**
- ✅ **Sin recolección de datos personales sensibles en blockchain.**

---

## 6. Cómo Ejecutar el Proyecto

### Requisitos Previos:
- Node.js $\ge 22.17.0$
- Android SDK / NDK configurado para compilaciones nativas en arquitectura `arm64-v8a`
- Dispositivo Android físico conectado por USB (QVAC requiere hardware físico)

### Instalación:
```bash
# 1. Clonar el repositorio
git clone <url-del-repositorio>
cd "Perseus AI/Perseus.ai"

# 2. Instalar dependencias
npm install

# 3. Generar proyecto nativo de Android
npx expo prebuild --platform android

# 4. Compilar y ejecutar en el dispositivo físico conectado
npx expo run:android --device
```

### Ejecutar Suite de Pruebas QA:
```bash
npm test
```

---

## 7. Estructura de Documentación

- [`docs/architecture.md`](docs/architecture.md): Arquitectura detallada, componentes y protocolo P2P.
- [`docs/standards.md`](docs/standards.md): Integración con Manual Esfera, IFRC, ISO 22320 y START.
- [`docs/safety-and-privacy.md`](docs/safety-and-privacy.md): Privacidad de datos humanitarios y recuperación de fallos.
- [`docs/evaluation.md`](docs/evaluation.md): Métricas de QA, benchmarks locales y matriz de aceptación.
- [`models/manifest.json`](models/manifest.json): Manifiesto formal de modelos y licencias.
- [`fixtures/synthetic_cases.json`](fixtures/synthetic_cases.json): 30 casos sintéticos de prueba en Panamá.
