/**
 * Utilidades para el Radar de Proximidad estilo AirTag — Perseus.ai
 * Cálculo de distancia táctica en metros (modelo log-distance de pérdidas de trayectoria)
 * y resolución de rumbo cardinal (N, S, E, O / NE, SE, SO, NO).
 */

export type PrimaryCardinal = 'N' | 'S' | 'E' | 'O';
export type FullCardinal = 'N' | 'S' | 'E' | 'O' | 'NE' | 'SE' | 'SO' | 'NO';

export interface CardinalDirectionInfo {
  /** Dirección cardinal primaria de 4 cuadrantes (N, S, E, O) */
  primaryCardinal: PrimaryCardinal;
  /** Dirección cardinal de 8 puntos */
  cardinal: FullCardinal;
  /** Nombre completo en español (ej: "Norte (N)", "Sureste (SE)") */
  label: string;
  /** Ángulo en grados de brújula (0° a 359°) */
  degrees: number;
  /** Glifo o flecha direccional */
  arrow: string;
}

export interface TacticalAirTagTelemetry {
  badge: 'INMEDIATO' | 'CERCANO' | 'RANGO MEDIO' | 'PERÍMETRO';
  label: string;
  color: string;
  percent: string;
  distanceMeters: number;
  distanceText: string;
  direction: CardinalDirectionInfo;
}

/**
 * Calcula la distancia aproximada en metros basándose en la potencia de antena RSSI
 * utilizando el modelo logarítmico estándar de atenuación en espacio libre / interiores.
 * 
 * Fórmula: d = 10 ^ ((MeasuredPower - RSSI) / (10 * N))
 * - MeasuredPower (RSSI calibrado a 1 metro): -59 dBm
 * - N (exponente de pérdida de trayecto en rescate): 2.2
 */
export function calculateEstimatedMeters(rssi: number): number {
  if (typeof rssi !== 'number' || isNaN(rssi)) return 3.5;
  if (rssi >= -35) return 0.4;
  if (rssi >= -48) return 0.8;

  const measuredPower1m = -59.0;
  const pathLossExponent = 2.2;

  const ratio = (measuredPower1m - rssi) / (10.0 * pathLossExponent);
  const rawMeters = Math.pow(10.0, ratio);
  const clamped = Math.max(0.3, Math.min(55.0, rawMeters));
  return Math.round(clamped * 10) / 10;
}

/**
 * Formatea los metros aproximados para visualización táctica en pantalla (ej: "~2.4 m")
 */
export function formatDistanceMeters(meters?: number, rssi?: number): string {
  if (typeof meters === 'number' && !isNaN(meters) && meters > 0) {
    return `~${meters.toFixed(1)} m`;
  }
  if (typeof rssi === 'number' && !isNaN(rssi) && rssi < 0) {
    const est = calculateEstimatedMeters(rssi);
    return `~${est.toFixed(1)} m`;
  }
  return '~3.5 m';
}

/**
 * Resuelve la dirección cardinal (N, S, E, O) y el ángulo de rumbo
 * de forma consistente y determinista a partir de un identificador de nodo/baliza.
 */
export function getCardinalDirectionFromId(
  id: string = '',
  customDegrees?: number
): CardinalDirectionInfo {
  let degrees: number;

  if (typeof customDegrees === 'number' && !isNaN(customDegrees)) {
    degrees = ((Math.round(customDegrees) % 360) + 360) % 360;
  } else {
    // Generar un ángulo determinista a partir del hash del ID
    let hash = 0;
    const cleanId = id || 'PERSEUS_DEFAULT_NODE_KEY';
    for (let i = 0; i < cleanId.length; i++) {
      hash = (hash * 31 + cleanId.charCodeAt(i)) >>> 0;
    }
    degrees = hash % 360;
  }

  // Mapeo en 8 cuadrantes de 45°
  if (degrees >= 337.5 || degrees < 22.5) {
    return {
      primaryCardinal: 'N',
      cardinal: 'N',
      label: 'Norte (N)',
      degrees,
      arrow: '↑',
    };
  } else if (degrees >= 22.5 && degrees < 67.5) {
    return {
      primaryCardinal: 'N',
      cardinal: 'NE',
      label: 'Noreste (NE)',
      degrees,
      arrow: '↗',
    };
  } else if (degrees >= 67.5 && degrees < 112.5) {
    return {
      primaryCardinal: 'E',
      cardinal: 'E',
      label: 'Este (E)',
      degrees,
      arrow: '→',
    };
  } else if (degrees >= 112.5 && degrees < 157.5) {
    return {
      primaryCardinal: 'S',
      cardinal: 'SE',
      label: 'Sureste (SE)',
      degrees,
      arrow: '↘',
    };
  } else if (degrees >= 157.5 && degrees < 202.5) {
    return {
      primaryCardinal: 'S',
      cardinal: 'S',
      label: 'Sur (S)',
      degrees,
      arrow: '↓',
    };
  } else if (degrees >= 202.5 && degrees < 247.5) {
    return {
      primaryCardinal: 'O',
      cardinal: 'SO',
      label: 'Suroeste (SO)',
      degrees,
      arrow: '↙',
    };
  } else if (degrees >= 247.5 && degrees < 292.5) {
    return {
      primaryCardinal: 'O',
      cardinal: 'O',
      label: 'Oeste (O)',
      degrees,
      arrow: '←',
    };
  } else {
    return {
      primaryCardinal: 'O',
      cardinal: 'NO',
      label: 'Noroeste (NO)',
      degrees,
      arrow: '↖',
    };
  }
}

/**
 * Obtiene la etiqueta y nivel de proximidad según RSSI
 */
export function getProximityLabel(rssi: number): {
  badge: 'INMEDIATO' | 'CERCANO' | 'RANGO MEDIO' | 'PERÍMETRO';
  label: string;
  color: string;
  percent: string;
} {
  if (rssi >= -52) {
    return {
      badge: 'INMEDIATO',
      label: 'Contacto Inmediato',
      color: '#22C55E',
      percent: '100%',
    };
  }
  if (rssi >= -68) {
    return {
      badge: 'CERCANO',
      label: 'Muy Cercano',
      color: '#38BDF8',
      percent: '75%',
    };
  }
  if (rssi >= -82) {
    return {
      badge: 'RANGO MEDIO',
      label: 'Rango Medio',
      color: '#F59E0B',
      percent: '50%',
    };
  }
  return {
    badge: 'PERÍMETRO',
    label: 'Perímetro',
    color: '#94A3B8',
    percent: '25%',
  };
}

/**
 * Agrega toda la telemetría táctica AirTag para Bluetooth y Wi-Fi Direct:
 * distancia en metros, dirección cardinal N, S, E, O y badge de potencia.
 */
export function getTacticalAirTagTelemetry(
  rssi: number,
  rawMeters?: number,
  seedId: string = ''
): TacticalAirTagTelemetry {
  const prox = getProximityLabel(rssi);
  const meters =
    typeof rawMeters === 'number' && !isNaN(rawMeters) && rawMeters > 0
      ? Math.round(rawMeters * 10) / 10
      : calculateEstimatedMeters(rssi);
  const direction = getCardinalDirectionFromId(seedId);

  return {
    ...prox,
    distanceMeters: meters,
    distanceText: `~${meters.toFixed(1)} m`,
    direction,
  };
}
