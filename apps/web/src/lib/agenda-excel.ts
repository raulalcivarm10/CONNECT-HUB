/**
 * Parseo del Excel de agenda del cliente, 100% EN EL NAVEGADOR con SheetJS.
 * El archivo NUNCA se sube al API: aquí se convierte en filas y lo que viaja
 * es el JSON del PUT /eventos/:id/agenda. El import de `xlsx` es dinámico
 * para no engordar el bundle inicial del panel (mismo criterio que excel.ts).
 *
 * El archivo real trae `Día | Horario | Salón | Nacionalidad | Conferencista |
 * Tema de conferencia | Area` y una segunda hoja "WORKSHOP" que añade
 * `Tipo | Patrocinador`. Las columnas se detectan POR ENCABEZADO (tolerando
 * tildes, mayúsculas y espacios), nunca por posición, y en los cuatro idiomas
 * del panel (ver ALIAS).
 *
 * Aquí vive también la PLANTILLA descargable (`descargarPlantillaAgenda`): el
 * ejemplo que se reparte y el lector que lo vuelve a leer tienen que ir a la
 * par, así que están en el mismo archivo a propósito.
 */

/** Una fila de la agenda, con los campos del contrato del API. */
export interface FilaAgenda {
  idAgenda?: number;
  diaOrden: number;
  horaInicio: string;
  horaFin: string;
  salon: string;
  area: string;
  tema: string;
  conferencista: string;
  nacionalidad: string;
  /** 'PONENCIA' | 'DESCANSO' o el valor de la columna `Tipo` (hoja WORKSHOP). */
  tipo: string;
  patrocinador: string;
  orden: number;
}

export interface ResultadoAgendaExcel {
  filas: FilaAgenda[];
  /** hojas de las que sí salieron filas */
  hojas: string[];
  /** filas de datos descartadas por venir vacías o sin contenido */
  omitidas: number;
}

type Campo =
  | 'dia'
  | 'horario'
  | 'salon'
  | 'nacionalidad'
  | 'conferencista'
  | 'tema'
  | 'area'
  | 'tipo'
  | 'patrocinador';

/**
 * Sinónimos aceptados por columna, ya normalizados (sin tildes, minúsculas).
 * Se prueba primero la coincidencia EXACTA de todos los encabezados y solo
 * después la parcial, para que "tema de conferencia" no se lleve la columna
 * de "conferencista" ni al revés.
 *
 * Hay sinónimos de los CUATRO idiomas del panel, no solo del español. El panel
 * arranca en inglés y la plantilla descargable (`libroPlantillaAgenda`) sale con
 * los encabezados del idioma activo, así que el lector tiene que reconocer los
 * cuatro juegos o la plantilla que reparte no se podría volver a importar. Los
 * del archivo original del cliente (en español) siguen intactos: se AÑADEN, no
 * se sustituyen.
 */
const ALIAS: Record<Campo, string[]> = {
  dia: ['dia', 'dias', 'fecha', 'jornada', 'day', 'date', 'jour'],
  horario: [
    'horario',
    'hora',
    'horas',
    'hora inicio',
    'horarios',
    'time',
    'schedule',
    'hours',
    'horaire',
  ],
  salon: [
    'salon',
    'salones',
    'sala',
    'auditorio',
    'aula',
    'room',
    'hall',
    'venue',
    'auditorium',
    'salle',
  ],
  nacionalidad: [
    'nacionalidad',
    'pais',
    'nacion',
    'origen',
    'nationality',
    'country',
    'nationalite',
    'nacionalidade',
  ],
  conferencista: [
    'conferencista',
    'conferencistas',
    'ponente',
    'expositor',
    'disertante',
    'speaker',
    'presenter',
    'lecturer',
    'intervenant',
    'palestrante',
  ],
  tema: [
    'tema de conferencia',
    'tema de la conferencia',
    'tema',
    'temas',
    'conferencia',
    'titulo',
    'charla',
    'topic',
    'title',
    'session',
    'talk',
    'lecture',
    'sujet',
  ],
  area: [
    'area',
    'areas',
    'eje',
    'categoria',
    'especialidad',
    'track',
    'category',
    'field',
    'speciality',
    'domaine',
  ],
  tipo: ['tipo', 'tipos', 'modalidad', 'type', 'kind'],
  patrocinador: ['patrocinador', 'patrocinadores', 'auspiciante', 'sponsor'],
};

const CAMPOS = Object.keys(ALIAS) as Campo[];

/** minúsculas, sin tildes y con los espacios colapsados (para comparar). */
function norm(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Texto visible de una celda: recorta los espacios sobrantes (varios temas del
 * archivo real acaban en una ristra de espacios) y colapsa los internos.
 */
function txt(v: unknown): string {
  if (v == null) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Número de serie de Excel → 'HH:MM' (solo interesa la parte fraccionaria). */
function horaDeSerial(n: number): string {
  const frac = n - Math.floor(n);
  const total = Math.round(frac * 24 * 60);
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

// 08:00 / 8h00 / 08H00 / 8.00, con am/pm opcional
const RE_HORA = /(\d{1,2})\s*[:.hH]\s*(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/gi;

/** 'Horario' → [horaInicio, horaFin]; devuelve '' en lo que no venga. */
export function partirHorario(v: unknown): [string, string] {
  if (typeof v === 'number' && Number.isFinite(v)) return [horaDeSerial(v), ''];
  const horas: string[] = [];
  for (const m of String(v ?? '').matchAll(RE_HORA)) {
    let h = Number(m[1]);
    const min = Number(m[2]);
    const suf = norm(m[3]).replace(/[.\s]/g, '');
    if (suf === 'pm' && h < 12) h += 12;
    if (suf === 'am' && h === 12) h = 0;
    if (h > 23 || min > 59) continue;
    horas.push(`${pad(h)}:${pad(min)}`);
  }
  if (horas.length === 0) return ['', ''];
  if (horas.length === 1) return [horas[0], ''];
  return [horas[0], horas[horas.length - 1]];
}

/**
 * Busca la fila de encabezados en las primeras filas de la hoja y devuelve
 * el índice de columna de cada campo reconocido. null si no parece una hoja
 * de agenda (menos de 3 columnas reconocidas).
 */
function mapearColumnas(
  filas: unknown[][],
): { fila: number; cols: Partial<Record<Campo, number>> } | null {
  let mejor: { fila: number; cols: Partial<Record<Campo, number>> } | null = null;
  const limite = Math.min(filas.length, 25);
  for (let i = 0; i < limite; i++) {
    const cabeceras = (filas[i] ?? []).map(norm);
    const cols: Partial<Record<Campo, number>> = {};
    const usadas = new Set<number>();

    // 1ª pasada: coincidencia exacta
    for (const campo of CAMPOS) {
      const j = cabeceras.findIndex(
        (h, idx) => !usadas.has(idx) && h !== '' && ALIAS[campo].includes(h),
      );
      if (j >= 0) {
        cols[campo] = j;
        usadas.add(j);
      }
    }
    // 2ª pasada: el encabezado contiene (o está contenido en) un sinónimo
    for (const campo of CAMPOS) {
      if (cols[campo] !== undefined) continue;
      const j = cabeceras.findIndex(
        (h, idx) =>
          !usadas.has(idx) &&
          h !== '' &&
          ALIAS[campo].some((a) => h.includes(a) || a.includes(h)),
      );
      if (j >= 0) {
        cols[campo] = j;
        usadas.add(j);
      }
    }

    const n = Object.keys(cols).length;
    if (n >= 3 && (!mejor || n > Object.keys(mejor.cols).length)) {
      mejor = { fila: i, cols };
    }
  }
  return mejor;
}

/**
 * Lee el Excel y devuelve las filas listas para el PUT.
 *
 * Reglas (todas necesarias para que la importación no salga rota):
 * - **Celdas combinadas**: `Día`, `Horario` y `Salón` vacíos heredan el valor
 *   de la fila anterior; eso es lo que agrupa a los ponentes de un bloque.
 * - **Días por ORDEN, no por fecha**: las fechas del Excel están corridas, así
 *   que se toman los valores distintos de `Día` en el orden en que aparecen
 *   y se mapean a 1, 2, 3…
 * - **Descansos y protocolo**: si `Tema` y `Area` vienen vacíos, la fila es un
 *   descanso o acto y el rótulo está en `Conferencista`.
 * - Se ignoran las filas totalmente vacías (la hoja WORKSHOP trae ~985 de 996).
 *
 * UNA HOJA A LA VEZ. El libro del cliente trae la agenda principal y una hoja
 * "WORKSHOP", pero los workshops se dan de alta como EVENTOS APARTE (eventos
 * hijos), así que fusionar ambas hojas metería la agenda de un evento dentro de
 * otro. Sin `hoja` se usa la primera; para cargar los workshops hay que abrir su
 * propio evento y elegir esa hoja.
 */
/**
 * Nombres de las hojas del libro, para poder elegir cuál se importa antes de
 * parsear nada. La agenda principal y la de workshops viven en hojas distintas
 * y pertenecen a eventos distintos.
 */
export async function hojasDelExcel(archivo: File | Blob): Promise<string[]> {
  const XLSX = await import('xlsx');
  // bookSheets: solo lee la lista de hojas, no el contenido
  const wb = XLSX.read(await archivo.arrayBuffer(), {
    type: 'array',
    bookSheets: true,
  });
  return wb.SheetNames;
}

export async function parsearAgendaExcel(
  archivo: File | Blob,
  hojaElegida?: string,
): Promise<ResultadoAgendaExcel> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });

  // día del Excel (tal cual, p. ej. "46298") → 1, 2, 3…
  const dias = new Map<string, number>();
  const filas: FilaAgenda[] = [];
  const hojas: string[] = [];
  let omitidas = 0;

  const objetivo =
    hojaElegida && wb.SheetNames.includes(hojaElegida)
      ? [hojaElegida]
      : wb.SheetNames.slice(0, 1);

  for (const nombre of objetivo) {
    const hoja = wb.Sheets[nombre];
    if (!hoja) continue;
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
      header: 1,
      raw: true,
      defval: '',
      blankrows: true,
    });
    const cab = mapearColumnas(matriz);
    if (!cab) continue;

    const { cols } = cab;
    const celda = (fila: unknown[], campo: Campo): unknown => {
      const j = cols[campo];
      return j === undefined ? '' : fila[j];
    };

    // últimos valores vistos, para las celdas combinadas
    let ultDia = '';
    let ultHorario: unknown = '';
    let ultSalon = '';
    let usadas = 0;

    for (let i = cab.fila + 1; i < matriz.length; i++) {
      const fila = matriz[i] ?? [];
      // fila totalmente vacía (mirando el crudo, antes de heredar nada)
      const vacia = CAMPOS.every((c) => txt(celda(fila, c)) === '');
      if (vacia) continue;

      const dia = txt(celda(fila, 'dia')) || ultDia;
      const horarioCrudo =
        txt(celda(fila, 'horario')) !== '' ? celda(fila, 'horario') : ultHorario;
      const salon = txt(celda(fila, 'salon')) || ultSalon;
      ultDia = dia;
      ultHorario = horarioCrudo;
      ultSalon = salon;

      const area = txt(celda(fila, 'area'));
      let tema = txt(celda(fila, 'tema'));
      let conferencista = txt(celda(fila, 'conferencista'));
      let nacionalidad = txt(celda(fila, 'nacionalidad'));
      const patrocinador = txt(celda(fila, 'patrocinador'));

      // sin tema, sin área y sin ponente no hay nada que mostrar
      if (!tema && !area && !conferencista) {
        omitidas++;
        continue;
      }

      let tipo: string;
      if (!tema && !area) {
        // descanso o acto de protocolo: el rótulo viene en `Conferencista`
        tipo = 'DESCANSO';
        tema = conferencista;
        conferencista = '';
        nacionalidad = '';
      } else {
        // Un workshop ES una ponencia: tiene ponente, tema y sala, y debe verse
        // como tarjeta completa. La columna `Tipo` de la hoja WORKSHOP describe
        // la modalidad del taller, NO el tipo de bloque de la agenda, así que no
        // se propaga: el API solo admite PONENCIA | DESCANSO | PROTOCOLO y
        // cualquier otro valor haría fallar la importación entera con un 400.
        // El patrocinador sí se conserva, que es el dato útil de esa hoja.
        tipo = 'PONENCIA';
      }

      const [horaInicio, horaFin] = partirHorario(horarioCrudo);
      const clave = dia || '-';
      let diaOrden = dias.get(clave);
      if (diaOrden === undefined) {
        diaOrden = dias.size + 1;
        dias.set(clave, diaOrden);
      }

      filas.push({
        diaOrden,
        horaInicio,
        horaFin,
        salon,
        area,
        tema,
        conferencista,
        nacionalidad,
        tipo,
        patrocinador,
        orden: 0,
      });
      usadas++;
    }

    if (usadas > 0) hojas.push(nombre);
  }

  return { filas: ordenarYNumerar(filas), hojas, omitidas };
}

/**
 * Ordena por día → hora → salón (empates: orden original, para que los
 * ponentes de un mismo bloque no se barajen) y renumera `orden` por día.
 * También compacta `diaOrden` a 1..n sin huecos.
 */
export function ordenarYNumerar(filas: FilaAgenda[]): FilaAgenda[] {
  const conIdx = filas.map((f, i) => ({ f, i }));
  conIdx.sort(
    (a, b) =>
      a.f.diaOrden - b.f.diaOrden ||
      (a.f.horaInicio || '99:99').localeCompare(b.f.horaInicio || '99:99') ||
      (a.f.horaFin || '99:99').localeCompare(b.f.horaFin || '99:99') ||
      a.f.salon.localeCompare(b.f.salon) ||
      a.i - b.i,
  );
  const compacto = new Map<number, number>();
  const contador = new Map<number, number>();
  return conIdx.map(({ f }) => {
    let dia = compacto.get(f.diaOrden);
    if (dia === undefined) {
      dia = compacto.size + 1;
      compacto.set(f.diaOrden, dia);
    }
    const n = (contador.get(dia) ?? 0) + 1;
    contador.set(dia, n);
    return { ...f, diaOrden: dia, orden: n };
  });
}

/** Un bloque del Excel: mismo día, mismo horario y mismo salón. */
export interface SesionAgenda {
  clave: string;
  diaOrden: number;
  horaInicio: string;
  horaFin: string;
  salon: string;
  area: string;
  filas: FilaAgenda[];
  esDescanso: boolean;
}

/**
 * Agrupa las filas en sesiones (día + horario + salón). Cada descanso es su
 * propia sesión: no se mezcla con las charlas de la misma franja.
 */
export function agruparSesiones(filas: FilaAgenda[]): SesionAgenda[] {
  const mapa = new Map<string, SesionAgenda>();
  for (const f of filas) {
    const esDescanso = f.tipo === 'DESCANSO';
    const clave = esDescanso
      ? `${f.diaOrden}|${f.horaInicio}|d${f.orden}`
      : `${f.diaOrden}|${f.horaInicio}|${f.horaFin}|${norm(f.salon)}`;
    const previa = mapa.get(clave);
    if (previa) {
      previa.filas.push(f);
      if (!previa.area && f.area) previa.area = f.area;
    } else {
      mapa.set(clave, {
        clave,
        diaOrden: f.diaOrden,
        horaInicio: f.horaInicio,
        horaFin: f.horaFin,
        salon: f.salon,
        area: f.area,
        filas: [f],
        esDescanso,
      });
    }
  }
  return [...mapa.values()];
}

/** Conteo para la vista previa: "24 filas → 16 sesiones en 3 días". */
export function resumenAgenda(filas: FilaAgenda[]) {
  return {
    filas: filas.length,
    sesiones: agruparSesiones(filas).length,
    dias: new Set(filas.map((f) => f.diaOrden)).size,
  };
}

/* ─────────────────────── plantilla descargable ─────────────────────── */

/** El `t()` del panel: la plantilla sale en el idioma activo. */
type Traducir = (clave: string, vars?: Record<string, string | number>) => string;

/** Nombre del archivo que se descarga. */
export const ARCHIVO_PLANTILLA = 'schedule-template.xlsx';

/** Ancho (en caracteres) de cada columna, para que se lea al abrirlo. */
const ANCHOS = [9, 16, 18, 14, 18, 42, 16, 13, 18];

/**
 * Libro de la plantilla de agenda, con los encabezados del idioma activo y un
 * ejemplo GENÉRICO (nada de datos reales de ningún cliente).
 *
 * El ejemplo no es decorativo: cada fila enseña una regla del lector, que son
 * justo las que la gente hace mal.
 *   1. sesión completa;
 *   2. fila con Horario y Salón VACÍOS = otro ponente del MISMO bloque;
 *   3. dos salas a la misma hora = sesiones en paralelo (válido);
 *   4. descanso: sin Tema ni Área y con el rótulo en la columna del ponente;
 *   5. dos días, para que se vea que la columna Día es la que agrupa.
 *
 * Se devuelve el libro (y no el archivo) para poder comprobar el viaje de ida
 * y vuelta: lo que sale de aquí tiene que volver a entrar por
 * `parsearAgendaExcel` sin perder la agrupación.
 */
export async function libroPlantillaAgenda(t: Traducir) {
  const XLSX = await import('xlsx');

  const dia1 = t('ag.day', { n: 1 });
  const dia2 = t('ag.day', { n: 2 });
  const salaA = t('ag.tplRoomA');
  const salaB = t('ag.tplRoomB');
  const area1 = t('ag.tplArea1');
  const area2 = t('ag.tplArea2');
  const ponencia = t('ag.tPONENCIA');
  const descanso = t('ag.tDESCANSO');
  // ponentes de mentira y sin apellido: nadie debe confundirlos con personas
  const ponente = (n: number) => `${t('ag.speaker')} ${n}`;

  const filas: string[][] = [
    [
      t('ag.tplColDay'),
      t('ag.tplColTime'),
      t('ag.room'),
      t('ag.nationality'),
      t('ag.speaker'),
      t('ag.topic'),
      t('ag.area'),
      t('ag.type'),
      t('ag.sponsor'),
    ],
    // 1) sesión normal completa
    [dia1, '09:00 - 09:45', salaA, t('ag.tplNat1'), ponente(1), t('ag.tplT1'), area1, ponencia, ''],
    // 2) MISMO bloque que la de arriba: horario y salón vacíos
    [dia1, '', '', t('ag.tplNat2'), ponente(2), t('ag.tplT2'), area1, ponencia, ''],
    // 3) otra sala a la MISMA hora: sesiones en paralelo
    [dia1, '09:00 - 09:45', salaB, t('ag.tplNat3'), ponente(3), t('ag.tplT3'), area2, ponencia, 'Acme Corp'],
    // 4) descanso: sin tema ni área, el rótulo va en la columna del ponente
    [dia1, '10:00 - 10:30', '', '', t('ag.tplBreak'), '', '', descanso, ''],
    [dia1, '10:30 - 11:15', salaA, t('ag.tplNat1'), ponente(4), t('ag.tplT4'), area2, ponencia, ''],
    // 5) segundo día: la columna Día es la que separa las jornadas
    [dia2, '09:00 - 10:00', salaA, t('ag.tplNat2'), ponente(1), t('ag.tplT5'), area1, ponencia, ''],
    [dia2, '', '', t('ag.tplNat3'), ponente(5), t('ag.tplT5'), area1, ponencia, ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet(filas);
  ws['!cols'] = ANCHOS.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  // una sola hoja: al reimportarla no se pregunta cuál usar
  XLSX.utils.book_append_sheet(wb, ws, t('ag.section').slice(0, 31));
  return wb;
}

/** Descarga la plantilla (mismo patrón que `descargarExcel` de excel.ts). */
export async function descargarPlantillaAgenda(t: Traducir) {
  const XLSX = await import('xlsx');
  XLSX.writeFile(await libroPlantillaAgenda(t), ARCHIVO_PLANTILLA);
}
