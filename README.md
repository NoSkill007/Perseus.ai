# Perseus.ai 🚨

> **Red P2P de Triaje Humanitario y Rescate 100% Offline con Inteligencia Artificial On-Device**  
> Desarrollado para el **Decentralized AI Hackathon** (ISD Summit, 9–11 de septiembre de 2026, Ciudad de Panamá).

[![Offline-First](https://img.shields.io/badge/Conectividad-100%25%20Offline-green.svg)](#5-garant%C3%ADa-de-cero-nube-zero-cloud-guarantee)
[![Inferencia Local](https://img.shields.io/badge/IA%20Runtime-QVAC%20%2B%20BareKit-blue.svg)](#4-modelos-de-ia-on-device--runtime)
[![Protocolo P2P](https://img.shields.io/badge/P2P-Nearby%20Connections%20(BLE%20%2B%20Wi--Fi)-orange.svg)](#6-red-p2p-descentralizada-nearby-connections)
[![Estándar](https://img.shields.io/badge/Est%C3%A1ndares-Manual%20Esfera%20%2B%20START-red.svg)](#7-est%C3%A1ndares-humanitarios-internacionales)

---

## 1. El Problema Humanitario

En desastres naturales de rápida evolución (como las inundaciones estacionales en **Tierras Altas / Chiriquí**, deslizamientos de tierra en **San Miguelito** o sismos en el occidente de **Bocas del Toro**), la infraestructura eléctrica y las torres de telefonía celular colapsan en los primeros minutos.

Las aplicaciones de emergencia tradicionales sufren de **tres fallas críticas**:
1. **Dependencia absoluta de la nube:** Si no hay señal 4G/5G ni internet satelital, la app no funciona o se congela.
2. **Triaje desestructurado:** Los mensajes de voz o chats no se procesan en fichas normalizadas, saturando a los rescatistas con relatos caóticos y datos contradictorios.
3. **Falta de coordinación en campo:** Las brigadas locales de voluntarios y rescatistas no tienen forma de sincronizar reportes entre sí sin un servidor central, provocando duplicación de esfuerzos o zonas abandonadas.

---

## 2. La Solución: Perseus.ai

**Perseus.ai** es una plataforma móvil de rescate y triaje que opera con **cero dependencia de internet**, combinando **IA generativa on-device** con una **red en malla P2P (Peer-to-Peer)**:

* 🎙️ **Captura Multimodal en Campo:** Los ciudadanos y brigadistas pueden reportar emergencias mediante voz grabada, relatos de texto y fotografías de daños, incluso en **modo avión**.
* 🧠 **Triaje Asistido por IA On-Device:** 
  * **Whisper Tiny (ASR):** Transcribe el audio del afectado localmente en el chip ARM64.
  * **Llama 3.2 1B Instruct (LLM):** Extrae un resumen ejecutivo para brigadas, clasifica las necesidades humanitarias según el **Manual Esfera** (Agua, Salud, Albergue, Alimentos, Rescate) y asigna la prioridad médica bajo el protocolo internacional **START** (*Simple Triage and Rapid Treatment*: Rojo, Amarillo, Verde, Negro).
  * **Inspección Visual de Escena:** Evalúa el nivel de daño estructural para complementar la ficha del incidente.
* 📡 **Sincronización P2P Mesh Sin Conexión:** Utiliza **Google Nearby Connections API** (BLE + Wi-Fi Hotspot automático sin routers) para transmitir fichas de triaje, audios y fotos directamente de teléfono a teléfono.
* 🛡️ **Roles Segregados (Ciudadano vs. Rescatista):** El ciudadano reporta y recibe guías de supervivencia inmediatas; el rescatista visualiza una cola de incidentes clasificados por prioridad START y toma casos con resolución de conflictos de asignación.

---

## 3. Arquitectura del Sistema

```
┌─────────────────────────────────────────┐         Red P2P Local (Sin Internet)        ┌─────────────────────────────────────────┐
│     Dispositivo A (Ciudadano / Campo)   │ ◄── (Nearby Connections: BLE + Wi-Fi) ───► │      Dispositivo B (Rescatista / COE)   │
├─────────────────────────────────────────┤                                            ├─────────────────────────────────────────┤
│ 1. Captura (Voz, Foto, Texto, GPS/Prov) │                                            │ 1. Cola de Casos Priorizados (START)    │
│ 2. Pipeline Secuencial de IA On-Device  │                                            │ 2. Radar de Proximidad RSSI             │
│    [Whisper ASR] ➔ [Llama 3.2 1B]       │                                            │ 3. Toma de Asignaciones & Albergues     │
│ 3. Almacén Local (SQLite - 4 Tablas)    │                                            │ 4. Auditoría de Sincronización (ACKs)   │
└─────────────────────────────────────────┘                                            └─────────────────────────────────────────┘
```

### Principio de Cómputo Secuencial (Memory Budget)
Para garantizar la estabilidad en dispositivos Android con memoria RAM limitada (4GB a 8GB), Perseus.ai implementa **ejecución secuencial estricta**:
1. Se carga el modelo **Whisper** en memoria, transcribe el audio a texto y se libera inmediatamente la RAM.
2. Se procesa la evaluación del incidente y se alimenta al **LLM Llama 3.2**.
3. El LLM extrae el JSON estructurado y se descarga de la memoria.
4. Con los modelos descargados y la memoria liberada, se inicia el motor de red P2P para difundir el reporte y sus adjuntos.

---

## 4. Modelos de IA On-Device & Runtime

| Modelo | Parámetros | Cuantización | Formato | Función | Runtime |
| :--- | :---: | :---: | :---: | :--- | :--- |
| **Whisper Tiny** | 39M | `Q8_0` | GGML (`.bin`) | Transcripción local de voz de la víctima/brigadista a texto en español. | QVAC / whisper.cpp |
| **Llama 3.2 1B Instruct** | 1.23B | `Q4_0` | GGUF (`.gguf`) | Extracción de resumen humanitario, clasificación Esfera y prioridad START. | QVAC / llama.cpp |
| **Evaluador Visual Local** | — | Heurístico / Semántico | Nativo On-Device | Detección de severidad de daños en fotos de la escena sin depender de red. | TypeScript / On-Device |

---

## 5. Roadmap de Visión Computacional (VLM — VisionPsy-Nano)

> ### 🔬 Estado de Implementación y Roadmap Futuro
> 
> Durante el ciclo de desarrollo del hackathon, se integró y probó la arquitectura multimodal con **VisionPsy-Nano (460M Q4_K_M imatrix, 303 MB)** junto con su proyector multimodal **`mmproj-visionpsy-nano-460m-q8.gguf` (108 MB)**:
> 
> 1. **Pipeline de Preprocesamiento:** Se implementó `prepareImageForVision` con redimensionamiento dinámico (`expo-image-manipulator`) acotando las fotos del sensor a un máximo de 768px (resolución óptima del proyector) y compresión JPEG 70% para evitar desbordamiento de buffers tensores en dispositivos móviles.
> 2. **Diagnóstico Técnico de Estabilidad:** La arquitectura de `@qvac/sdk` empaqueta un worker JavaScript monolítico (`worker.mobile.bundle.js` de ~9 MB) que se compila e interpreta mediante V8 en un hilo secundario nativo (`libbare-kit.so`). En arquitecturas móviles `arm64-v8a`, la inicialización concurrente del motor multimodal dentro del runtime V8 del worklet genera agotamiento de memoria virtual en el thread nativo.
> 3. **Decisión Arquitectónica de Hackathon:** Por rigor de confiabilidad y resiliencia en situaciones de desastre (donde una app **jamás debe crashear** en manos de un rescatista), la inferencia visual en esta versión de competencia se desacopló del worklet y se canalizó mediante un **analizador de severidad semántica on-device**, preservando el 100% de la experiencia de usuario y el flujo de triaje.
> 4. **Roadmap para Versiones Posteriores:**
>    - **Binding Nativo Directo C++:** Migración del cargador multimodal desde el runtime de worklet JS hacia bindings JNI/NDK directos con `llama.cpp` (`libqvac__llm-llamacpp`), eliminando la sobrecarga de V8 para la inicialización del `mmproj`.
>    - **Aceleración NPU / GPU:** Cuantizaciones optimizadas en NPU (Qualcomm Hexagon / MediaTek APU) para inferencia visual sub-segundo con consumo mínimo de batería.

---

## 6. Red P2P Descentralizada (Nearby Connections)

La sincronización entre dispositivos no utiliza intermediarios ni routers Wi-Fi:

* **Topología P2P_CLUSTER:** Descubrimiento simétrico donde cualquier teléfono actúa simultáneamente como transmisor y receptor.
* **Canales Híbridos (BLE + Wi-Fi Direct):** El descubrimiento e intercambio de identidades inicial ocurre mediante Bluetooth Low Energy (BLE), y la transferencia masiva de datos escala automáticamente a Wi-Fi Hotspot de alta velocidad.
* **Manejo Mixto de Payloads:**
  * `Payload.Type.BYTES`: Fichas de triaje START normalizadas en formato JSON estructurado ($\le 32\text{ KB}$).
  * `Payload.Type.FILE`: Archivos binarios de voz (`.m4a`, `.wav`) y fotografías capturadas en el incidente.
* **Resolución de Conflictos:** Si dos rescatistas reclaman un mismo caso estando desconectados, el protocolo preserva ambas propuestas y las clasifica como `conflicto`, permitiendo al líder de brigada resolver la asignación definitiva.

---

## 7. Estándares Humanitarios Internacionales

Perseus.ai alinea su lógica de decisión con los protocolos internacionales más exigentes:

1. **Protocolo de Triaje START (Simple Triage and Rapid Treatment):**
   * 🔴 **ROJO (Inmediato):** Riesgo vital inminente, personas atrapadas, hemorragias severas o compromiso respiratorio.
   * 🟡 **AMARILLO (Diferido):** Lesiones graves pero estables que toleran espera controlada (fracturas, contusiones moderadas).
   * 🟢 **VERDE (Leve):** Afectados ambulatorios con lesiones menores o necesidades materiales inmediatas.
   * ⚫ **NEGRO (Fallecido / Expectante):** Víctimas sin signos vitales o lesiones incompatibles con la vida.
2. **Manual Esfera (Carta Humanitaria y Normas Mínimas):**
   * Clasificación automática en: *Agua y Saneamiento (WASH)*, *Alimentación y Nutrición*, *Salud y Primeros Auxilios*, *Albergue y Artículos No Alimentarios*, *Acceso y Rescate*.
3. **ISO 22320:2018:**
   * Directrices para la coordinación, control y auditoría de incidentes en protección civil.

---

## 8. Guía de Evaluación Rápida para Jurados (3 Minutos)

Para evaluar **Perseus.ai** en el dispositivo Android físico durante la demostración:

### Paso 1: Configurar Rol e Identidad
1. Al abrir la app por primera vez, complete el formulario de bienvenida (o edite su perfil en la pestaña **Perfil**).
2. Seleccione el rol deseado:
   * **Ciudadano:** Interfaz simplificada para solicitar auxilio, grabar reportes y recibir instrucciones de seguridad.
   * **Rescatista:** Interfaz táctica con métricas START, lista de casos y toma de asignaciones.

### Paso 2: Crear un Reporte de Emergencia Multimodal
1. Diríjase a la pestaña **Reportar** (`+`).
2. Puede utilizar los tres métodos de entrada:
   * **Voz:** Presione `🎙️ Grabar Audio` y dicte una situación de desastre (ej: *"Tenemos tres personas atrapadas por la crecida del río en Tierras Altas, una con fractura"*).
   * **Foto:** Capture una fotografía o seleccione una imagen de la galería.
   * **Relato escrito:** Escriba o complemente el relato del incidente.
3. Presione **"🔍 Procesar con IA"**.
4. Observe las fases del pipeline ejecutándose en pantalla: transcripción $\rightarrow$ análisis visual $\rightarrow$ extracción semántica.
5. Verifique la pantalla de **Revisión Humana**: el sistema muestra la ficha estructurada, la prioridad START calculada, las necesidades Esfera detectadas y los detalles técnicos de la auditoría.
6. Presione **"Confirmar y Guardar"**.

### Paso 3: Probar la Sincronización P2P
1. Vaya a la pestaña **Sincronizar** (o presione "Confirmar y Compartir").
2. Active el interruptor de **Sincronización P2P**. El dispositivo comenzará a descubrir otros teléfonos cercanos en modo cluster.
3. En la pestaña **Perfil**, verifique la bitácora de auditoría de red (`SYNC_LOG`) con los bytes y eventos de sincronización registrados.

### Paso 4: Inspeccionar Laboratorios de Diagnóstico
1. Vaya a la pestaña **Perfil**.
2. Desplácese hasta la sección final: **"🔬 Diagnóstico y Modelos de IA"**.
3. Ingrese a los laboratorios interactivos:
   * **Laboratorio Whisper ASR:** Permite grabar notas de voz y probar la transcripción local con métricas de tiempo de inferencia.
   * **Laboratorio de Visión:** Permite seleccionar presets de emergencias (inundación, derrumbe, daño estructural) y probar la inspección visual on-device.

---

## 9. Garantía de Cero Nube (Zero-Cloud Guarantee)

* ✅ **0 llamadas a APIs remotas de inferencia:** Ninguna petición sale a OpenAI, Anthropic, Google Cloud ni servidores externos.
* ✅ **100% Funcional en Modo Avión:** Toda la suite de triaje y la base de datos funcionan con Wi-Fi y datos móviles desactivados.
* ✅ **Soberanía y Privacidad de Datos:** Los datos clínicos y de ubicación de los afectados residen únicamente en los dispositivos de los rescatistas autorizados presentes en el área del desastre.

---

## 10. Declaración de Base Preexistente (Artículo 11)

En cumplimiento con el reglamento del hackathon:

* **Modelos y Pesos Preexistentes:**
  * `Whisper Tiny Q8_0` (39M params, MIT License, OpenAI / whisper.cpp).
  * `Llama 3.2 1B Instruct Q4_0` (1.23B params, Llama 3.2 Community License, Meta AI).
  * `VisionPsy-Nano 460M` (460M params, Apache-2.0, Tether AI Research).
* **Frameworks y Runtimes:**
  * `@qvac/sdk` (v0.18.2) & `react-native-bare-kit` (v0.11.5) por Holepunch / Tether.
  * `Google Play Services Nearby Connections API` (`com.google.android.gms:play-services-nearby:18.7.0`).
  * `Expo SDK 54` & `React Native 0.81.5` con `expo-sqlite`, `expo-av` y `expo-image-manipulator`.

---

## 11. Estructura del Repositorio

```
Perseus.ai/
├── app/                        # Pantallas y rutas de Expo Router
│   ├── (tabs)/                 # Navegación principal
│   │   ├── index.tsx           # Inicio / Dashboard de triaje y emergencias
│   │   ├── reportar.tsx        # Formulario multimodal de captura
│   │   ├── sincronizar.tsx     # Radar y sincronización P2P Nearby
│   │   └── perfil.tsx          # Perfil de usuario, rol y laboratorios de IA
│   ├── review/[id].tsx         # Pantalla de revisión humana de triaje
│   ├── whisper-test.tsx        # Laboratorio interactivo Whisper ASR
│   └── vision-test.tsx         # Laboratorio interactivo de inspección visual
├── src/
│   ├── services/
│   │   ├── ai/                 # Pipeline de triaje, QVAC manager, ASR, LLM
│   │   ├── p2p/                # Módulo P2P Nearby Connections & radar BLE
│   │   ├── database/           # SQLite schema (4 tablas), migraciones
│   │   └── reportService.ts    # CRUD de reportes y sincronización
│   ├── types/                  # Definiciones de TypeScript (START, Esfera, P2P)
│   └── utils/                  # Captura de medios y optimización de imágenes
├── docs/                       # Documentación técnica extendida
│   ├── architecture.md         # Diagramas y detalles del protocolo de red
│   ├── standards.md            # Mapeo de estándares Esfera e ISO 22320
│   ├── safety-and-privacy.md   # Políticas de privacidad y modo offline
│   └── evaluation.md           # Métricas de prueba y casos de uso en Panamá
└── models/
    └── manifest.json           # Manifiesto de modelos y licencias
```

