import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveReport,
  getReports,
  getReportsByStatus,
  getReportsByPriority,
  getReportCounts,
  getRecentReports,
  searchReports,
} from '../reportService';
import type { ReportRecord } from '../../types/triageTypes';

class MockSQLiteDatabase {
  public rows: any[] = [];

  runSync(sql: string, params: any[] = []): any {
    const s = sql.trim();
    if (s.startsWith('INSERT OR REPLACE INTO reports')) {
      const [
        report_id, created_at, source, status,
        audio_uri, image_uri, text_relato,
        transcript, vision_severity, visual_triage_analysis, injuries_and_symptoms,
        extracted_summary, executive_summary, triage_priority,
        needs, reported_people_count, location_reference, missing_fields,
        raw_model_output, is_local_inference, execution_time_ms,
        province, district, corregimiento,
        reporter_profile, sync_event_id, sent_at, received_at, ack_received,
        updated_at
      ] = params;

      this.rows = this.rows.filter((r) => r.report_id !== report_id);
      this.rows.push({
        report_id,
        created_at,
        source,
        status,
        audio_uri,
        image_uri,
        text_relato,
        transcript,
        vision_severity,
        visual_triage_analysis,
        injuries_and_symptoms,
        extracted_summary,
        executive_summary,
        triage_priority,
        needs,
        reported_people_count,
        location_reference,
        missing_fields,
        raw_model_output,
        is_local_inference,
        execution_time_ms,
        province,
        district,
        corregimiento,
        reporter_profile,
        sync_event_id,
        sent_at,
        received_at,
        ack_received,
        updated_at,
      });
      return { changes: 1 };
    }
    return { changes: 0 };
  }

  getAllSync<T>(sql: string, params: any[] = []): T[] {
    const s = sql.trim();

    // Cuenta por estado
    if (s.includes('COUNT(*) as count FROM reports')) {
      let filtered = this.rows;
      if (s.includes('WHERE source = ?')) {
        filtered = filtered.filter((r) => r.source === params[0]);
      }
      const map: Record<string, number> = {};
      for (const r of filtered) {
        map[r.status] = (map[r.status] || 0) + 1;
      }
      return Object.entries(map).map(([status, count]) => ({ status, count })) as unknown as T[];
    }

    let filtered = [...this.rows];

    if (s.includes('WHERE extracted_summary LIKE ? AND source = ?')) {
      const query = String(params[0]).replace(/%/g, '').toLowerCase();
      const src = params[1];
      filtered = filtered.filter((r) => r.source === src && (r.extracted_summary || '').toLowerCase().includes(query));
    } else if (s.includes('WHERE extracted_summary LIKE ?')) {
      const query = String(params[0]).replace(/%/g, '').toLowerCase();
      filtered = filtered.filter((r) => (r.extracted_summary || '').toLowerCase().includes(query));
    } else if (s.includes('WHERE status = ? AND source = ?')) {
      filtered = filtered.filter((r) => r.status === params[0] && r.source === params[1]);
    } else if (s.includes('WHERE status = ?')) {
      filtered = filtered.filter((r) => r.status === params[0]);
    } else if (s.includes('WHERE triage_priority = ? AND source = ?')) {
      filtered = filtered.filter((r) => r.triage_priority === params[0] && r.source === params[1]);
    } else if (s.includes('WHERE triage_priority = ?')) {
      filtered = filtered.filter((r) => r.triage_priority === params[0]);
    } else if (s.includes('WHERE source = ?')) {
      filtered = filtered.filter((r) => r.source === params[0]);
    }

    if (s.includes('LIMIT ?')) {
      const limit = params[params.length - 1];
      filtered = filtered.slice(0, limit);
    }

    return filtered as unknown as T[];
  }
}

describe('Aislamiento de Reportes por Rol (Ciudadano vs Rescatista)', () => {
  let db: any;

  beforeEach(() => {
    db = new MockSQLiteDatabase();

    // 1. Reporte creado por el usuario en rol Ciudadano
    const citizenReport1: ReportRecord = {
      reportId: 'rep-ciudadano-001',
      createdAt: 1000,
      source: 'local',
      status: 'confirmado',
      extractedSummary: 'Derrumbe en mi residencia, sector Boquete',
      triagePriority: 'ROJO',
      reportedPeopleCount: 2,
      isLocalInference: true,
      executionTimeMs: 120,
      needs: ['ACCESO_RESCATE'],
      missingFields: [],
      ackReceived: false,
      updatedAt: 1000,
    };

    // 2. Segundo reporte del ciudadano
    const citizenReport2: ReportRecord = {
      reportId: 'rep-ciudadano-002',
      createdAt: 2000,
      source: 'local',
      status: 'borrador',
      extractedSummary: 'Inundación menor en patio trasero',
      triagePriority: 'VERDE',
      reportedPeopleCount: 1,
      isLocalInference: true,
      executionTimeMs: 90,
      needs: ['AGUA_SANEAMIENTO'],
      missingFields: [],
      ackReceived: false,
      updatedAt: 2000,
    };

    // 3. Reporte recibido/capturado por la brigada en rol Rescatista vía P2P
    const rescuerReport1: ReportRecord = {
      reportId: 'rep-rescatista-received-001',
      createdAt: 3000,
      source: 'received',
      status: 'recibido',
      extractedSummary: 'Víctima atrapada en vehículo colapsado',
      triagePriority: 'ROJO',
      reportedPeopleCount: 4,
      isLocalInference: false,
      executionTimeMs: 0,
      needs: ['SALUD', 'ACCESO_RESCATE'],
      missingFields: [],
      ackReceived: true,
      updatedAt: 3000,
    };

    // 4. Segundo reporte recibido en terreno por el rescatista
    const rescuerReport2: ReportRecord = {
      reportId: 'rep-rescatista-received-002',
      createdAt: 4000,
      source: 'received',
      status: 'en_atencion',
      extractedSummary: 'Familia aislada en techo por crecida de río',
      triagePriority: 'AMARILLO',
      reportedPeopleCount: 3,
      isLocalInference: false,
      executionTimeMs: 0,
      needs: ['ALBERGUE'],
      missingFields: [],
      ackReceived: true,
      updatedAt: 4000,
    };

    saveReport(db, citizenReport1);
    saveReport(db, citizenReport2);
    saveReport(db, rescuerReport1);
    saveReport(db, rescuerReport2);
  });

  it('el rol Ciudadano SOLO debe ver sus reportes locales y nunca los recibidos como rescatista', () => {
    const citizenReports = getReports(db, 'local');
    expect(citizenReports).toHaveLength(2);
    expect(citizenReports.every((r) => r.source === 'local')).toBe(true);
    expect(citizenReports.map((r) => r.reportId)).toContain('rep-ciudadano-001');
    expect(citizenReports.map((r) => r.reportId)).toContain('rep-ciudadano-002');
    expect(citizenReports.map((r) => r.reportId)).not.toContain('rep-rescatista-received-001');
    expect(citizenReports.map((r) => r.reportId)).not.toContain('rep-rescatista-received-002');
  });

  it('el rol Rescatista SOLO debe ver los reportes recibidos/capturados y nunca los propios de ciudadano', () => {
    const rescuerReports = getReports(db, 'received');
    expect(rescuerReports).toHaveLength(2);
    expect(rescuerReports.every((r) => r.source === 'received')).toBe(true);
    expect(rescuerReports.map((r) => r.reportId)).toContain('rep-rescatista-received-001');
    expect(rescuerReports.map((r) => r.reportId)).toContain('rep-rescatista-received-002');
    expect(rescuerReports.map((r) => r.reportId)).not.toContain('rep-ciudadano-001');
    expect(rescuerReports.map((r) => r.reportId)).not.toContain('rep-ciudadano-002');
  });

  it('los filtros por prioridad deben respetar el origen según el rol activo', () => {
    // Ciudadano filtrando por ROJO (solo debe ver rep-ciudadano-001)
    const citizenRojo = getReportsByPriority(db, 'ROJO', 'local');
    expect(citizenRojo).toHaveLength(1);
    expect(citizenRojo[0].reportId).toBe('rep-ciudadano-001');

    // Rescatista filtrando por ROJO (solo debe ver rep-rescatista-received-001)
    const rescuerRojo = getReportsByPriority(db, 'ROJO', 'received');
    expect(rescuerRojo).toHaveLength(1);
    expect(rescuerRojo[0].reportId).toBe('rep-rescatista-received-001');
  });

  it('la búsqueda debe estar acotada al rol correspondiente', () => {
    // Ciudadano buscando "derrumbe" -> lo encuentra
    const citizenSearch = searchReports(db, 'derrumbe', 'local');
    expect(citizenSearch).toHaveLength(1);
    expect(citizenSearch[0].reportId).toBe('rep-ciudadano-001');

    // Rescatista buscando "derrumbe" -> no debe encontrarlo porque es del ciudadano
    const rescuerSearchDerrumbe = searchReports(db, 'derrumbe', 'received');
    expect(rescuerSearchDerrumbe).toHaveLength(0);

    // Rescatista buscando "vehículo" -> lo encuentra
    const rescuerSearchVehiculo = searchReports(db, 'vehículo', 'received');
    expect(rescuerSearchVehiculo).toHaveLength(1);
    expect(rescuerSearchVehiculo[0].reportId).toBe('rep-rescatista-received-001');
  });

  it('el conteo del dashboard debe contabilizar exclusivamente los casos del rol activo', () => {
    const rescuerCounts = getReportCounts(db, 'received');
    expect(rescuerCounts['recibido']).toBe(1);
    expect(rescuerCounts['en_atencion']).toBe(1);
    // El borrador del ciudadano NO debe sumar en el panel del rescatista
    expect(rescuerCounts['borrador']).toBeUndefined();

    const citizenCounts = getReportCounts(db, 'local');
    expect(citizenCounts['confirmado']).toBe(1);
    expect(citizenCounts['borrador']).toBe(1);
    expect(citizenCounts['en_atencion']).toBeUndefined();
  });
});
