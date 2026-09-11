# Estándares Internacionales y Adaptación al Producto — Perseus.ai

Perseus.ai incorpora principios de guías humanitarias internacionales y estándares de gestión de incidentes para orientar su diseño y la clasificación de necesidades en campo.

---

## 1. Manual Esfera (Esfera Humanitarian Standards)

El **Manual Esfera** define áreas mínimas de respuesta humanitaria en desastres. Perseus.ai clasifica y extrae necesidades operativas alineadas con sus 4 sectores esenciales:

1. **AGUA_SANEAMIENTO:** Abastecimiento de agua potable, higiene, kits de saneamiento y letrinas de emergencia.
2. **ALIMENTACION:** Asistencia alimentaria, víveres secos, nutrición para lactantes y niños.
3. **ALBERGUE:** Alojamiento temporal, lonas impermeables, techado de emergencia, mantas y abrigo.
4. **SALUD:** Primeros auxilios, atención de heridos, evacuación médica y soporte en crisis de ansiedad.

### Categorías Complementarias del Producto:
- **ACCESO_RESCATE:** Búsqueda y rescate en estructuras colapsadas (USAR), despeje de vías y accesibilidad acuática.
- **PROTECCION:** Seguridad física de comunidades aisladas, iluminación de emergencia y custodia de grupos vulnerables.
- **OTRA / DESCONOCIDA:** Asistencia general o necesidades no especificadas en el relato inicial.

---

## 2. Guía IFRC (Federación Internacional de la Cruz Roja)

De la metodología de evaluación rápida de necesidades de la IFRC, Perseus.ai adopta:
- **Separación de Hecho vs. Interpretación:** Conservación inmutable del relato original (audio/texto) frente a la ficha estructurada propuesta por la IA.
- **Identificación de Brechas de Información (`missing_fields`):** La app señala qué datos faltan (ej. ubicación exacta, cantidad de personas) sin rellenarlos automáticamente con suposiciones.
- **Revisión Humana en el Bucle:** El rescatista o voluntario siempre confirma o edita los campos antes de que el reporte pase al estado `confirmado`.

---

## 3. ISO 22320:2018 (Gestión de Incidentes y Coordinación)

Perseus.ai implementa los principios de interoperabilidad y roles de coordinación de la norma ISO 22320:
- **Separación de Roles Operativos:** Distinción clara entre el rol de *Afectado/Brigadista de Campo* (captura y reporte) y el de *Rescatista/Coordinador* (recepción, cola de prioridad y asignación de recursos).
- **Trazabilidad de Asignaciones:** La tabla `assignments` registra el historial de qué nodo tomó qué caso y cuándo, detectando asignaciones concurrentes o duplicadas.

---

## 4. Protocolo de Triaje START (Simple Triage and Rapid Treatment)

Para la priorización operativa de casos en la cola de rescate:
- **ROJO (Prioridad 1 - Inmediato):** Riesgo vital inminente, personas atrapadas en estructuras o techos, heridas graves, niños o ancianos en peligro crítico.
- **AMARILLO (Prioridad 2 - Urgente):** Evacuaciones masivas sin riesgo de muerte inmediata, familias sin refugio o lesiones moderadas.
- **VERDE (Prioridad 3 - Menor):** Afectaciones leves, personas en puntos de encuentro seguros fuera de peligro vital.
- **NEGRO (Prioridad 4 - Fallecido / Sin signos vitales):** Casos confirmados sin signos vitales.
