# Seguridad, Privacidad y Comportamiento ante Fallos — Perseus.ai

En situaciones de desastre, la protección de la información personal forma parte integral de la protección de las personas (Manual CICR de Protección de Datos en Acción Humanitaria).

---

## 1. Privacidad y Datos Mínimos

1. **Inferencia Local Sin Telemetría Externa:**
   - La inferencia de Inteligencia Artificial (ASR, Visión, LLM) se ejecuta estrictamente en el dispositivo físico mediante QVAC SDK.
   - **Cero llamadas a la nube:** No se envían grabaciones de voz, fotos de afectados ni coordenadas a servidores remotos ni APIs comerciales.

2. **Sin Almacenamiento de Identidad Civil:**
   - Para registrar una solicitud de auxilio **no se exige cédula, nombre completo, biometría ni billetera criptográfica**.
   - Los reportes se identifican únicamente por `report_id` (UUIDv4 aleatorio) y `device_id` local.

3. **Sin Blockchain para Datos Sensibles:**
   - Ninguna historia personal, dato de salud ni ubicación geográfica se publica en una blockchain pública o inmutable. Los datos permanecen en bases SQLite locales de los equipos autorizados que participan en el rescate.

---

## 2. Recuperación y Resiliencia ante Fallos

| Escenario de Fallo | Comportamiento del Sistema |
| :--- | :--- |
| **Modelo Ausente o Sin Memoria RAM** | La app degrada graciosamente: abre el formulario de captura manual y permite guardar el reporte localmente de inmediato sin bloquear al usuario. |
| **Pérdida Total de Red (Modo Avión)** | Toda la captura, inferencia y persistencia continúa funcionando al 100%. Los reportes se marcan como `synced = 0` y se encolan para difusión automática al reconectar. |
| **Interrupción durante Sincronización** | El receptor solo confirma (ACK) una vez que el reporte ha sido persistido en su base SQLite. Si se corta el enlace, el emisor conserva el reporte en cola y lo reintenta sin duplicar. |
| **Conflicto de Asignación Concurrente** | Si dos rescatistas toman el mismo caso durante una desconexión, al encontrarse el sistema detecta el conflicto, lo marca como `conflicto` en la UI y permite resolución por el coordinador. |
| **Entrada Maliciosa o Prompt Injection** | El extractor semántico sanitiza inyecciones (ej. "IGNORA LAS REGLAS", "DROP TABLE") y clasifica exclusivamente dentro del enum forzado de prioridades START. |

---

## 3. Delimitación de Responsabilidad Operativa

> [!WARNING]
> Perseus.ai es una herramienta de asistencia y coordinación logística para brigadas de rescate. **No realiza diagnóstico médico autónomo ni sustituye a los canales oficiales de emergencia (SINAPROC / 911 / Bomberos / Cruz Roja).** Toda propuesta generada por la IA debe ser revisada y confirmada por una persona antes de su despacho.
