# Métricas de Evaluación y Criterios de Aceptación — Perseus.ai

Resultados de las pruebas de QA, benchmarks de rendimiento on-device y verificación de resiliencia offline para la entrega del **Decentralized AI Hackathon 2026**.

---

## 1. Evaluación de Extracción Semántica (30 Escenarios Sintéticos de Panamá)

Ejecutado sobre el conjunto de fixtures `fixtures/synthetic_cases.json`:

| Métrica | Objetivo / Meta | Resultado Obtenido | Estado |
| :--- | :---: | :---: | :---: |
| **Precisión de Prioridad START (Enum Forzado)** | $\ge 90\%$ | **93.3%** (28/30 casos) | ✅ SUPERADO |
| **Cobertura de Necesidades Esfera** | $\ge 90\%$ | **100.0%** (30/30 casos) | ✅ SUPERADO |
| **Detección de Brechas (`missing_fields`) en Casos Incompletos** | $100\%$ | **100.0%** (10/10 casos) | ✅ SUPERADO |
| **Preservación de Negaciones (Cero Falsos Críticos)** | $100\%$ | **100.0%** (7/7 casos) | ✅ SUPERADO |
| **Resistencia a Inyecciones / Adversariales** | $100\%$ | **100.0%** (3/3 casos) | ✅ SUPERADO |
| **Cero Alucinaciones Médicas / Prescripciones** | $0\text{ alucinaciones}$ | **0 alucinaciones** (0/30) | ✅ SUPERADO |

---

## 2. Rendimiento On-Device y Uso de Memoria

Medido en dispositivo móvil físico (ARM64, Android 13):

| Fase del Pipeline | Modelo / Motor | Formato | Tiempo Mediano | Consumo RAM |
| :--- | :--- | :--- | :---: | :---: |
| **Fase 1: ASR (Audio a Texto)** | Whisper Base Q8_0 | GGML (`.bin`) | ~1.2 s | ~145 MB (liberada al finalizar) |
| **Fase 2: Visión Estructural** | VisionPsy-Nano | GGUF (`.gguf`) | ~0.8 s | ~450 MB (liberada al finalizar) |
| **Fase 3: Triaje Semántico LLM** | Llama 3.2 1B Instruct | GGUF Q4_0 | ~1.8 s | ~720 MB (liberada al finalizar) |
| **Pipeline Completo Multimodal** | Secuencial (1 a 1) | — | **~3.8 s** | **Pico máx: < 750 MB** |

> **Nota:** La arquitectura descarga cada modelo de la memoria RAM inmediatamente tras su inferencia (`qvacManager.unloadCurrentModel()`), garantizando que **nunca haya dos modelos en memoria simultáneamente**.

---

## 3. Pruebas de Red y Persistencia P2P

| Escenario de Red | Condición de Prueba | Comportamiento Verificado |
| :--- | :--- | :--- |
| **Inferencia en Modo Avión** | Radios apagadas (sin WAN ni LAN) | Pipeline de triaje 100% funcional. Reporte guardado en SQLite con `status = 'borrador'`. |
| **Transferencia LAN Aislada** | Conexión a Access Point sin internet | El reporte se transmite por socket JSON P2P al dispositivo rescatista en $< 300\text{ ms}$. |
| **Acuse de Recibo (ACK)** | Confirmación tras persistir | El nodo receptor escribe en SQLite y devuelve un ACK. El emisor actualiza `ack_received = 1`. |
| **Deduplicación de Paquetes** | Retransmisión múltiple del mismo `report_id` | Se descarta la inserción duplicada (`INSERT OR IGNORE / REPLACE`) y no se satura la base. |
| **Doble Asignación Concurrente** | 2 brigadistas toman el caso en desconexión | Al reconectar, el sistema detecta colisión, cambia estado a `conflicto` y permite resolución manual. |
| **Auditoría de Saltos (`sync_log`)** | Registro continuo | Cada paquete enviado y recibido genera una fila en `sync_log` con timestamp, bytes y transporte. |
