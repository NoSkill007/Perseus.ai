/**
 * Base de datos y detector geográfico de Panamá para Perseus AI
 * Soporta provincias, comarcas, distritos, corregimientos y barrios populares
 */

export interface DetectedLocation {
  province?: string;
  district?: string;
  corregimiento?: string;
  landmark?: string;
  formattedReference: string;
}

const CORREGIMIENTOS_PANAMA: Record<string, { province: string; district?: string }> = {
  // Panamá Centro y San Miguelito
  calidonia: { province: 'Panamá', district: 'Panamá' },
  'bella vista': { province: 'Panamá', district: 'Panamá' },
  'san francisco': { province: 'Panamá', district: 'Panamá' },
  'el chorrillo': { province: 'Panamá', district: 'Panamá' },
  'santa ana': { province: 'Panamá', district: 'Panamá' },
  curundu: { province: 'Panamá', district: 'Panamá' },
  curundú: { province: 'Panamá', district: 'Panamá' },
  bethania: { province: 'Panamá', district: 'Panamá' },
  betania: { province: 'Panamá', district: 'Panamá' },
  'pueblo nuevo': { province: 'Panamá', district: 'Panamá' },
  'san felipe': { province: 'Panamá', district: 'Panamá' },
  'juan diaz': { province: 'Panamá', district: 'Panamá' },
  'juan díaz': { province: 'Panamá', district: 'Panamá' },
  tocumen: { province: 'Panamá', district: 'Panamá' },
  pedregal: { province: 'Panamá', district: 'Panamá' },
  '24 de diciembre': { province: 'Panamá', district: 'Panamá' },
  'las cumbres': { province: 'Panamá', district: 'Panamá' },
  'alcalde diaz': { province: 'Panamá', district: 'Panamá' },
  'alcalde díaz': { province: 'Panamá', district: 'Panamá' },
  chilibre: { province: 'Panamá', district: 'Panamá' },
  ancon: { province: 'Panamá', district: 'Panamá' },
  ancón: { province: 'Panamá', district: 'Panamá' },
  'parque lefevre': { province: 'Panamá', district: 'Panamá' },
  'rio abajo': { province: 'Panamá', district: 'Panamá' },
  'río abajo': { province: 'Panamá', district: 'Panamá' },
  'don bosco': { province: 'Panamá', district: 'Panamá' },
  pacora: { province: 'Panamá', district: 'Panamá' },
  'san miguelito': { province: 'Panamá', district: 'San Miguelito' },
  'samaria': { province: 'Panamá', district: 'San Miguelito' },
  'torrijos carter': { province: 'Panamá', district: 'San Miguelito' },
  'brisas del golf': { province: 'Panamá', district: 'San Miguelito' },
  'costa del este': { province: 'Panamá', district: 'Panamá' },
  obarrio: { province: 'Panamá', district: 'Panamá' },
  'el cangrejo': { province: 'Panamá', district: 'Panamá' },
  marbella: { province: 'Panamá', district: 'Panamá' },
  albrook: { province: 'Panamá', district: 'Panamá' },
  clayton: { province: 'Panamá', district: 'Panamá' },

  // Chiriquí
  david: { province: 'Chiriquí', district: 'David' },
  boquete: { province: 'Chiriquí', district: 'Boquete' },
  bugaba: { province: 'Chiriquí', district: 'Bugaba' },
  volcan: { province: 'Chiriquí', district: 'Tierras Altas' },
  volcán: { province: 'Chiriquí', district: 'Tierras Altas' },
  'cerro punta': { province: 'Chiriquí', district: 'Tierras Altas' },
  'puerto armuelles': { province: 'Chiriquí', district: 'Barú' },
  dolega: { province: 'Chiriquí', district: 'Dolega' },
  gualaca: { province: 'Chiriquí', district: 'Gualaca' },
  boqueron: { province: 'Chiriquí', district: 'Boquerón' },
  boquerón: { province: 'Chiriquí', district: 'Boquerón' },
  renacimiento: { province: 'Chiriquí', district: 'Renacimiento' },
  'tierras altas': { province: 'Chiriquí', district: 'Tierras Altas' },

  // Bocas del Toro
  changuinola: { province: 'Bocas del Toro', district: 'Changuinola' },
  almirante: { province: 'Bocas del Toro', district: 'Almirante' },
  'isla colon': { province: 'Bocas del Toro', district: 'Bocas del Toro' },
  'isla colón': { province: 'Bocas del Toro', district: 'Bocas del Toro' },
  'bocas del toro': { province: 'Bocas del Toro', district: 'Bocas del Toro' },
  'chiriqui grande': { province: 'Bocas del Toro', district: 'Chiriquí Grande' },
  'chiriquí grande': { province: 'Bocas del Toro', district: 'Chiriquí Grande' },
  bastimentos: { province: 'Bocas del Toro', district: 'Bocas del Toro' },

  // Veraguas
  santiago: { province: 'Veraguas', district: 'Santiago' },
  sona: { province: 'Veraguas', district: 'Soná' },
  soná: { province: 'Veraguas', district: 'Soná' },
  'santa fe': { province: 'Veraguas', district: 'Santa Fe' },
  cañazas: { province: 'Veraguas', district: 'Cañazas' },
  montijo: { province: 'Veraguas', district: 'Montijo' },
  atalaya: { province: 'Veraguas', district: 'Atalaya' },

  // Colón
  cristobal: { province: 'Colón', district: 'Colón' },
  cristóbal: { province: 'Colón', district: 'Colón' },
  cativa: { province: 'Colón', district: 'Colón' },
  cativá: { province: 'Colón', district: 'Colón' },
  sabanitas: { province: 'Colón', district: 'Colón' },
  'buena vista': { province: 'Colón', district: 'Colón' },
  portobelo: { province: 'Colón', district: 'Portobelo' },

  // Panamá Oeste
  'la chorrera': { province: 'Panamá Oeste', district: 'La Chorrera' },
  arraijan: { province: 'Panamá Oeste', district: 'Arraiján' },
  arraiján: { province: 'Panamá Oeste', district: 'Arraiján' },
  capira: { province: 'Panamá Oeste', district: 'Capira' },
  chame: { province: 'Panamá Oeste', district: 'Chame' },
  'san carlos': { province: 'Panamá Oeste', district: 'San Carlos' },
  burunga: { province: 'Panamá Oeste', district: 'Arraiján' },
  'vista alegre': { province: 'Panamá Oeste', district: 'Arraiján' },
  coronado: { province: 'Panamá Oeste', district: 'Chame' },

  // Coclé
  penonome: { province: 'Coclé', district: 'Penonomé' },
  penonomé: { province: 'Coclé', district: 'Penonomé' },
  anton: { province: 'Coclé', district: 'Antón' },
  antón: { province: 'Coclé', district: 'Antón' },
  aguadulce: { province: 'Coclé', district: 'Aguadulce' },
  'el valle': { province: 'Coclé', district: 'Antón' },
  'el valle de anton': { province: 'Coclé', district: 'Antón' },
  'el valle de antón': { province: 'Coclé', district: 'Antón' },
  'la pintada': { province: 'Coclé', district: 'La Pintada' },

  // Herrera / Los Santos
  chitre: { province: 'Herrera', district: 'Chitré' },
  chitré: { province: 'Herrera', district: 'Chitré' },
  'las tablas': { province: 'Los Santos', district: 'Las Tablas' },
  guarare: { province: 'Los Santos', district: 'Guararé' },
  guararé: { province: 'Los Santos', district: 'Guararé' },
  pedasi: { province: 'Los Santos', district: 'Pedasí' },
  pedasí: { province: 'Los Santos', district: 'Pedasí' },
  tonosi: { province: 'Los Santos', district: 'Tonosí' },
  tonosí: { province: 'Los Santos', district: 'Tonosí' },

  // Darién & Comarcas
  'la palma': { province: 'Darién', district: 'Chepigana' },
  meteti: { province: 'Darién', district: 'Pinogana' },
  metetí: { province: 'Darién', district: 'Pinogana' },
  yaviza: { province: 'Darién', district: 'Pinogana' },
  'ngabe-bugle': { province: 'Comarca Ngäbe-Buglé' },
  'ngäbe-buglé': { province: 'Comarca Ngäbe-Buglé' },
  'guna yala': { province: 'Comarca Guna Yala' },
  'san blas': { province: 'Comarca Guna Yala' },
};

/**
 * Detecta ubicaciones territoriales de Panamá dentro de cualquier texto libre
 */
export function detectPanamaLocation(text: string, defaultProvince?: string): DetectedLocation {
  if (!text) {
    return {
      province: defaultProvince,
      formattedReference: defaultProvince || 'Ubicación no especificada',
    };
  }

  const cleanText = text.toLowerCase();

  // 1. Buscar coincidencias con corregimientos o distritos panameños
  for (const [key, data] of Object.entries(CORREGIMIENTOS_PANAMA)) {
    // Regex de palabra completa
    const regex = new RegExp(`\\b${key}\\b`, 'i');
    if (regex.test(cleanText)) {
      const corregimientoName = key.charAt(0).toUpperCase() + key.slice(1);
      const districtStr = data.district ? `, Distrito de ${data.district}` : '';
      const provinceStr = data.province ? `, ${data.province}` : '';

      return {
        province: data.province || defaultProvince,
        district: data.district,
        corregimiento: corregimientoName,
        formattedReference: `${corregimientoName}${districtStr}${provinceStr}`,
      };
    }
  }

  // 2. Si no coincide un corregimiento específico, buscar menciones como "en [lugar]" o "cerca de [lugar]"
  const patternMatch = text.match(/(?:en|cerca de|junto a|hacia)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s]{3,25})/i);
  if (patternMatch && patternMatch[1]) {
    const rawRef = patternMatch[1].trim();
    const formatted = defaultProvince ? `${rawRef}, ${defaultProvince}` : rawRef;
    return {
      province: defaultProvince,
      formattedReference: formatted,
    };
  }

  return {
    province: defaultProvince,
    formattedReference: defaultProvince || 'Panamá',
  };
}
