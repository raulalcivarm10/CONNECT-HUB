'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import { useDialogo } from '@/lib/dialogo';
import { useI18n } from '@/lib/i18n';
import {
  agruparSesiones,
  hojasDelExcel,
  ordenarYNumerar,
  parsearAgendaExcel,
  resumenAgenda,
  type FilaAgenda,
  type ResultadoAgendaExcel,
  type SesionAgenda,
} from '@/lib/agenda-excel';

/**
 * Agenda detallada del evento: se importa del Excel del cliente (parseo en el
 * navegador, el archivo no se sube), se corrige a mano y se guarda entera con
 * un PUT que REEMPLAZA la agenda del evento.
 *
 * UNA HOJA POR EVENTO. El libro del cliente trae la agenda principal y una hoja
 * "WORKSHOP", pero los workshops se dan de alta como EVENTOS APARTE (hijos), así
 * que fusionar las hojas metería la agenda de un evento dentro de otro. Si el
 * libro tiene más de una hoja se pregunta cuál importar; con una sola, no se
 * molesta al usuario.
 */

/** Fila con identidad local estable: reordenar/borrar no debe hacer que React
 *  reutilice inputs de otra fila (se perdería el foco y el valor tecleado). */
interface FilaLocal extends FilaAgenda {
  uid: string;
}

type CampoTexto =
  | 'horaInicio'
  | 'horaFin'
  | 'salon'
  | 'area'
  | 'tema'
  | 'conferencista'
  | 'nacionalidad'
  | 'tipo'
  | 'patrocinador';

let contadorUid = 0;
const conUid = (f: FilaAgenda): FilaLocal => ({ ...f, uid: `ag${++contadorUid}` });

const FILA_VACIA = (diaOrden: number, base?: FilaAgenda): FilaAgenda => ({
  diaOrden,
  horaInicio: base?.horaInicio ?? '',
  horaFin: base?.horaFin ?? '',
  salon: base?.salon ?? '',
  area: '',
  tema: '',
  conferencista: '',
  nacionalidad: '',
  tipo: 'PONENCIA',
  patrocinador: '',
  orden: 0,
});

/**
 * Renumera `orden` (1..n por día) y compacta `diaOrden` sin huecos, RESPETANDO
 * el orden del array. A diferencia de `ordenarYNumerar` (que ordena por hora al
 * importar), aquí no se reordena nada: si el usuario movió una fila a mano, se
 * queda donde la puso.
 */
function renumerar(lista: FilaLocal[]): FilaLocal[] {
  const compacto = new Map<number, number>();
  const contador = new Map<number, number>();
  return lista.map((f) => {
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

/** Agrupa por día (filas o sesiones), en orden ascendente. */
function porDia<T extends { diaOrden: number }>(filas: T[]): Array<[number, T[]]> {
  const m = new Map<number, T[]>();
  for (const f of filas) {
    const l = m.get(f.diaOrden);
    if (l) l.push(f);
    else m.set(f.diaOrden, [f]);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

/* ── capitalización conservadora (copia del criterio de la app móvil) ──
 * La agenda la escribe el CLIENTE en su Excel y se guarda TAL CUAL
 * (`api.putTalCual`), así que su capitalización original es información: no se
 * toca. Solo se recapitaliza lo que llega TODO EN MAYÚSCULAS.
 *
 * Ojo: esto NO puede hacerse con CSS. `capitalize` aplicado a un texto ya
 * redactado ("Cleft care in Bauru") lo destrozaría ("Cleft Care In Bauru"), y
 * `text-transform` no distingue un texto gritado de uno bien escrito. Va en JS.
 *
 * Debe dar el MISMO resultado que `tituloCase()` de
 * apps/mobile/src/features/eventos/agenda-dia.tsx: el asistente ve la agenda en
 * la app y el organizador la ve aquí, y no pueden verse distintas.
 */

const RE_MINUSCULA = /[a-zà-öø-ÿ]/;
const RE_LETRA = /[A-Za-zÀ-ÖØ-öø-ÿ]/;
const RE_BORDES = /^[^A-Za-zÀ-ÖØ-öø-ÿ0-9]+|[^A-Za-zÀ-ÖØ-öø-ÿ0-9]+$/g;
const RE_VOCAL = /[AEIOUÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÄËÏÖÜÃÕ]/;

/** Tratamientos: se escriben con formato propio, no en mayúsculas. */
const HONORIFICOS: Record<string, string> = {
  DR: 'Dr', DRA: 'Dra', PROF: 'Prof', PROFA: 'Profa', MTRO: 'Mtro', MTRA: 'Mtra',
  LIC: 'Lic', LICDA: 'Licda', ING: 'Ing', MG: 'Mg', MGS: 'Mgs', ESP: 'Esp',
  MSC: 'MSc', PHD: 'PhD', SR: 'Sr', SRA: 'Sra', OD: 'Od',
};

/** Siglas con vocales que se destruirían al capitalizar (ATM -> "Atm"). */
const SIGLAS = new Set([
  'ATM', 'CAD', 'CAM', 'TAC', 'TAO', 'PRP', 'PRF', 'MTA', 'ADA', 'FDI', 'AAO',
  'ITI', 'ONG', 'UEES', 'USA', 'UK', 'LED', 'ISO', 'PDF', 'IA', 'AI', 'ORL',
  'CBCT', 'OPG', 'RX', 'TMD', 'TMJ', 'ATP', 'UV', 'CO2', 'AM', 'PM',
]);

/** Numerales romanos frecuentes en títulos de congreso (XV Congreso…). */
const ROMANOS = new Set([
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX',
]);

/** Conectores que van en minúscula salvo al inicio. */
const CONECTORES = new Set([
  'de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'o', 'u', 'en', 'a', 'al',
  'con', 'por', 'para', 'un', 'una', 'sin', 'no', 'da', 'das', 'do', 'dos',
  'the', 'of', 'and', 'in', 'for', 'to', 'on', 'at', 'with',
  'le', 'les', 'du', 'des', 'et', 'aux', 'sur',
]);

function capitalizar(tok: string): string {
  return tok
    .toLowerCase()
    .replace(/(^|[-'’.])([a-zà-öø-ÿ])/g, (_m, pre: string, c: string) => pre + c.toUpperCase());
}

function palabra(tok: string, primera: boolean, ultima: boolean): string {
  const nucleo = tok.replace(RE_BORDES, '');
  if (!nucleo || !RE_LETRA.test(nucleo)) return tok;
  // códigos y siglas compuestas: COVID-19, 3D, CAD/CAM, I+D
  if (/[0-9]/.test(nucleo) || /[/+&]/.test(tok)) return tok;
  const clave = nucleo.toUpperCase();
  const hon = HONORIFICOS[clave];
  if (hon) return tok.replace(nucleo, hon);
  if (SIGLAS.has(clave) || ROMANOS.has(clave)) return tok;
  // siglas sin vocales: TMJ, PRF, CBCT
  if (nucleo.length >= 2 && nucleo.length <= 5 && !RE_VOCAL.test(clave)) return tok;
  // Una letra suelta no es el conector "a"/"y": o es la inicial de un nombre
  // ("LUIS A. RAMÍREZ") o identifica algo y va al final ("SALÓN A", "AULA B").
  // En medio de una frase sí puede serlo ("ATENCIÓN A PACIENTES"), así que solo
  // se rescata cuando lleva punto o cierra el texto.
  const esIdentificador = nucleo.length === 1 && (tok.includes('.') || ultima);
  if (!primera && !esIdentificador && CONECTORES.has(clave.toLowerCase())) {
    return tok.toLowerCase();
  }
  return capitalizar(tok);
}

/**
 * Texto de la agenda listo para pintar. Si YA trae minúsculas se devuelve tal
 * cual: significa que el cliente lo escribió con su formato y es el bueno.
 * Solo lo que viene gritado se recapitaliza, sin destrozar siglas ni nombres.
 */
function tituloCase(texto?: string | null): string {
  const s = (texto ?? '').trim();
  if (!s) return '';
  if (RE_MINUSCULA.test(s)) return s;
  let primera = true;
  const trozos = s.split(/(\s+)/);
  const ultimoTexto = trozos.reduce(
    (acc, tok, i) => (tok && !/^\s+$/.test(tok) ? i : acc),
    -1,
  );
  return trozos
    .map((tok, i) => {
      if (!tok || /^\s+$/.test(tok)) return tok;
      const out = palabra(tok, primera, i === ultimoTexto);
      primera = false;
      return out;
    })
    .join('');
}

/** Paleta fija (tonos medios que se leen bien en claro y en oscuro). */
const PALETA = [
  '#7c3aed',
  '#0891b2',
  '#ea580c',
  '#16a34a',
  '#db2777',
  '#ca8a04',
  '#4f46e5',
  '#0d9488',
];

/** Color estable por área: la misma área siempre pinta igual. */
function colorArea(area: string): string {
  let h = 0;
  for (let i = 0; i < area.length; i++) h = (h * 31 + area.charCodeAt(i)) >>> 0;
  return PALETA[h % PALETA.length];
}

const hhmm = (h: string) => h || '--:--';

/** TIPO de bloque que admite el API (EVENTO_AGENDA.TIPO). */
const TIPOS = ['PONENCIA', 'DESCANSO', 'PROTOCOLO'] as const;

/**
 * Etiqueta traducida del tipo. Los valores viajan en MAYÚSCULAS y en castellano
 * (son los del API), así que pintarlos crudos metía "PROTOCOLO" tal cual en un
 * panel en inglés; solo se cae al valor bruto si llega uno desconocido.
 */
function etiquetaTipo(
  t: (k: string, v?: Record<string, string | number>) => string,
  tipo: string,
): string {
  return (TIPOS as readonly string[]).includes(tipo) ? t(`ag.t${tipo}`) : tipo;
}

/* ───────────────────────── componente principal ───────────────────────── */

export function AgendaEvento({ idEvento }: { idEvento: number }) {
  const { t } = useI18n();
  const dialogo = useDialogo();
  const [filas, setFilas] = useState<FilaLocal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sucio, setSucio] = useState(false);
  const [vista, setVista] = useState<'editar' | 'asistente'>('editar');
  const [previa, setPrevia] = useState<ResultadoAgendaExcel | null>(null);
  // libro con varias hojas: hay que elegir cuál se importa ANTES de parsear
  const [libro, setLibro] = useState<{ archivo: File; hojas: string[] } | null>(null);
  const [hojaSel, setHojaSel] = useState('');
  const [msg, setMsg] = useState<{ txt: string; tono: 'ok' | 'warn' | 'err' } | null>(null);

  const aviso = (txt: string, tono: 'ok' | 'warn' | 'err' = 'ok') => setMsg({ txt, tono });

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await api.get<{ items: FilaAgenda[] }>(`/eventos/${idEvento}/agenda`);
      const items = [...(res?.items ?? [])].sort(
        (a, b) => a.diaOrden - b.diaOrden || a.orden - b.orden,
      );
      setFilas(renumerar(items.map(conUid)));
      setSucio(false);
    } catch (err) {
      setMsg({
        txt: err instanceof Error ? err.message : t('ag.loadError'),
        tono: 'err',
      });
    } finally {
      setCargando(false);
    }
  }, [idEvento, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /**
   * Guarda de salida SOLO mientras haya cambios sin guardar (las ediciones
   * manuales sí necesitan pulsar Guardar; la importación ya guarda sola).
   * El listener se quita al desmontar y en cuanto `sucio` vuelve a false tras
   * guardar, para que no salte cuando no hay nada pendiente.
   */
  useEffect(() => {
    if (!sucio) return;
    const alSalir = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome sigue exigiendo returnValue para mostrar su diálogo nativo
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', alSalir);
    return () => window.removeEventListener('beforeunload', alSalir);
  }, [sucio]);

  const dias = useMemo(() => porDia(filas), [filas]);

  /* ── mutaciones locales (nada viaja al API hasta Guardar) ── */

  function mutar(fn: (l: FilaLocal[]) => FilaLocal[]) {
    setFilas((l) => renumerar(fn(l)));
    setSucio(true);
  }

  function actualizar(uid: string, campo: CampoTexto, valor: string) {
    setFilas((l) => l.map((f) => (f.uid === uid ? { ...f, [campo]: valor } : f)));
    setSucio(true);
  }

  function mover(uid: string, delta: number) {
    mutar((l) => {
      const i = l.findIndex((f) => f.uid === uid);
      const j = i + delta;
      // no se salta de día: mover fuera del bloque del día no tendría sentido
      if (i < 0 || j < 0 || j >= l.length || l[j].diaOrden !== l[i].diaOrden) return l;
      const copia = [...l];
      copia[i] = l[j];
      copia[j] = l[i];
      return copia;
    });
  }

  function eliminarFila(uid: string) {
    mutar((l) => l.filter((f) => f.uid !== uid));
  }

  function agregarFila(dia: number) {
    mutar((l) => {
      let pos = l.length;
      for (let i = l.length - 1; i >= 0; i--) {
        if (l[i].diaOrden === dia) {
          pos = i + 1;
          break;
        }
      }
      const base = pos > 0 && l[pos - 1]?.diaOrden === dia ? l[pos - 1] : undefined;
      return [...l.slice(0, pos), conUid(FILA_VACIA(dia, base)), ...l.slice(pos)];
    });
  }

  function agregarDia() {
    const max = filas.reduce((m, f) => Math.max(m, f.diaOrden), 0);
    mutar((l) => [...l, conUid(FILA_VACIA(max + 1))]);
  }

  async function eliminarDia(dia: number) {
    const ok = await dialogo.confirmar({
      titulo: t('ag.dayDeleteTitle', { n: dia }),
      mensaje: t('ag.dayDeleteMsg'),
      tono: 'danger',
      confirmar: t('c.delete'),
    });
    if (!ok) return;
    mutar((l) => l.filter((f) => f.diaOrden !== dia));
  }

  /* ── importación del Excel ── */

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el MISMO archivo
    if (!archivo) return;
    setBusy(true);
    setMsg(null);
    setPrevia(null);
    setLibro(null);
    try {
      const hojas = await hojasDelExcel(archivo);
      if (hojas.length === 0) {
        aviso(t('ag.readError'), 'err');
        return;
      }
      // una sola hoja: no hay nada que elegir, se importa directo
      if (hojas.length === 1) {
        await leerHoja(archivo, hojas[0]);
        return;
      }
      setLibro({ archivo, hojas });
      setHojaSel(hojas[0]);
    } catch {
      aviso(t('ag.readError'), 'err');
    } finally {
      setBusy(false);
    }
  }

  /** Parsea UNA hoja del libro: cada hoja es la agenda de UN evento. */
  async function leerHoja(archivo: File, hoja: string) {
    const res = await parsearAgendaExcel(archivo, hoja);
    if (res.filas.length === 0) {
      aviso(
        res.hojas.length === 0
          ? t('ag.noColumns', { sheet: hoja })
          : t('ag.noRows', { sheet: hoja }),
        'warn',
      );
      return;
    }
    setPrevia(res);
    setLibro(null);
  }

  async function confirmarHoja() {
    if (!libro) return;
    setBusy(true);
    setMsg(null);
    try {
      await leerHoja(libro.archivo, hojaSel);
    } catch {
      aviso(t('ag.readError'), 'err');
    } finally {
      setBusy(false);
    }
  }

  /**
   * IMPORTAR = GUARDAR. La importación en dos pasos era una trampa: parecía
   * completada, el usuario salía de la pantalla y la agenda se evaporaba sin
   * decir nada (EVENTO_AGENDA quedaba vacía). El aviso de que REEMPLAZA ya está
   * en la vista previa, así que confirmar allí completa el guardado.
   */
  async function importarYGuardar() {
    if (!previa) return;
    const nuevas = ordenarYNumerar(previa.filas).map(conUid);
    setFilas(nuevas);
    setPrevia(null);
    // si el PUT falla queda marcado como pendiente: ni se pierde lo importado
    // ni se puede salir sin que la guarda de `beforeunload` avise
    setSucio(true);
    if (await enviarAgenda(nuevas)) {
      aviso(t('ag.importedAndSaved', { n: nuevas.length }));
      await cargar();
    }
  }

  /* ── persistencia ── */

  /**
   * Manda la agenda completa al API. Si falla NO toca lo que hay en pantalla:
   * el usuario conserva su trabajo, ve el motivo y puede reintentar.
   */
  async function enviarAgenda(lista: FilaLocal[]): Promise<boolean> {
    // filas sin contenido no se guardan (el usuario pudo dejar una en blanco)
    const limpias = renumerar(
      lista.filter((f) => f.tema.trim() !== '' || f.conferencista.trim() !== ''),
    );
    if (limpias.length === 0) {
      aviso(t('ag.nothingToSave'), 'warn');
      return false;
    }
    setBusy(true);
    setMsg(null);
    try {
      // `putTalCual` y no `put`: la agenda la redacta el cliente en su Excel y
      // hay que guardarla EXACTAMENTE como la escribió. Con la política general
      // de mayúsculas se perderían las siglas (CAD/CAM, IADR, LPF) y luego
      // habría que adivinarlas al mostrarla.
      await api.putTalCual(`/eventos/${idEvento}/agenda`, {
        items: limpias.map((f) => ({
          diaOrden: f.diaOrden,
          horaInicio: f.horaInicio,
          horaFin: f.horaFin,
          salon: f.salon,
          area: f.area,
          tema: f.tema,
          conferencista: f.conferencista,
          nacionalidad: f.nacionalidad,
          tipo: f.tipo,
          patrocinador: f.patrocinador,
          orden: f.orden,
        })),
      });
      return true;
    } catch (err) {
      // el motivo del API va dentro del aviso: sin él el usuario cree que guardó
      aviso(
        t('ag.saveError', {
          reason: err instanceof Error ? err.message : t('c.error'),
        }),
        'err',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function guardar() {
    const ok = await dialogo.confirmar({
      titulo: t('ag.saveTitle'),
      mensaje: t('ag.saveMsg', { n: filas.length }),
      tono: 'warning',
      confirmar: t('ag.save'),
    });
    if (!ok) return;
    if (await enviarAgenda(filas)) {
      aviso(t('ag.saved'));
      await cargar();
    }
  }

  async function vaciar() {
    const ok = await dialogo.confirmar({
      titulo: t('ag.clearTitle'),
      mensaje: t('ag.clearMsg'),
      tono: 'danger',
      confirmar: t('ag.clear'),
    });
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.del(`/eventos/${idEvento}/agenda`);
      setFilas([]);
      setSucio(false);
      aviso(t('ag.cleared'));
    } catch (err) {
      aviso(
        t('ag.clearError', {
          reason: err instanceof Error ? err.message : t('c.error'),
        }),
        'err',
      );
    } finally {
      setBusy(false);
    }
  }

  /* ── render ── */

  if (cargando) {
    return (
      <div className="rounded-lg border border-border-app bg-surface-2 p-3 sm:col-span-2 lg:col-span-3">
        <div className="mb-3 h-4 w-56 animate-pulse rounded bg-surface" />
        <div className="mb-3 flex gap-2">
          <div className="h-8 w-32 animate-pulse rounded-lg bg-surface" />
          <div className="h-8 w-24 animate-pulse rounded-lg bg-surface" />
        </div>
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-surface" />
          ))}
        </div>
      </div>
    );
  }

  const total = filas.length;

  return (
    <div className="rounded-lg border border-border-app bg-surface-2 p-3 sm:col-span-2 lg:col-span-3">
      <p className="mb-2 text-xs text-text-muted">{t('ag.desc')}</p>
      {/* los workshops son eventos hijos: su hoja se importa desde SU evento */}
      <p className="mb-3 rounded-lg border border-border-app bg-surface px-3 py-2 text-xs text-text-2">
        {t('ag.workshopNote')}
      </p>

      {/* barra de acciones */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label
          className={`inline-flex cursor-pointer items-center rounded-lg border border-border-app bg-surface px-3 py-1.5 text-sm font-semibold text-text hover:border-brand ${
            busy ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          {busy ? t('ag.reading') : t('ag.import')}
          <input
            type="file"
            accept=".xlsx,.xls,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={onArchivo}
            className="hidden"
          />
        </label>

        <div className="flex overflow-hidden rounded-lg border border-border-app">
          {(['editar', 'asistente'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVista(v)}
              className={`px-3 py-1.5 text-sm font-semibold transition ${
                vista === v
                  ? 'bg-brand text-white'
                  : 'bg-surface text-text-2 hover:bg-surface-2'
              }`}
            >
              {v === 'editar' ? t('ag.tabEdit') : t('ag.tabAttendee')}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-muted">
            {t('ag.rowsCount', { n: total })}
          </span>
          <button
            type="button"
            onClick={vaciar}
            disabled={busy || total === 0}
            className="rounded-lg border border-border-app px-3 py-1.5 text-sm font-semibold text-danger hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('ag.clear')}
          </button>
          {/* con cambios pendientes el botón resalta; sin ellos queda apagado */}
          <button
            type="button"
            onClick={guardar}
            disabled={busy || total === 0}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              sucio
                ? 'bg-brand text-white ring-2 ring-brand/40 hover:opacity-90'
                : 'border border-border-app bg-surface text-text-2 hover:bg-surface-2'
            }`}
          >
            {busy ? t('c.saving') : t('ag.save')}
          </button>
        </div>
      </div>

      {/* aviso GRANDE de cambios pendientes: el pill discreto pasaba inadvertido
          y la agenda se perdía al salir de la pantalla */}
      {sucio && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2">
          <span className="text-sm font-semibold text-amber-500">{t('ag.dirty')}</span>
          <span className="text-xs text-text-2">{t('ag.dirtyMsg')}</span>
          <button
            type="button"
            onClick={guardar}
            disabled={busy || total === 0}
            className="ml-auto rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? t('c.saving') : t('ag.saveNow')}
          </button>
        </div>
      )}

      {/* el libro trae varias hojas: cada una es la agenda de un evento distinto */}
      {libro && (
        <div className="mb-3 rounded-lg border border-brand/40 bg-brand/5 p-3">
          <p className="text-sm font-semibold text-text">{t('ag.sheetPickTitle')}</p>
          <p className="mt-0.5 text-xs text-text-2">
            {t('ag.sheetPickMsg', { n: libro.hojas.length })}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-text-2">{t('ag.sheetLabel')}</span>
            <select
              value={hojaSel}
              onChange={(e) => setHojaSel(e.target.value)}
              aria-label={t('ag.sheetLabel')}
              className="rounded-md border border-border-app bg-surface px-2 py-1 text-sm text-text outline-none focus:border-brand"
            >
              {libro.hojas.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={confirmarHoja}
              disabled={busy}
              className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? t('ag.reading') : t('ag.sheetContinue')}
            </button>
            <button
              type="button"
              onClick={() => setLibro(null)}
              className="rounded-lg border border-border-app bg-surface px-3 py-1.5 text-sm font-semibold text-text-2 hover:bg-surface-2"
            >
              {t('ag.discard')}
            </button>
          </div>
        </div>
      )}

      {previa && (
        <PanelPrevia
          res={previa}
          busy={busy}
          onImportar={importarYGuardar}
          onDescartar={() => setPrevia(null)}
        />
      )}

      {total === 0 ? (
        <p className="rounded-lg border border-dashed border-border-app px-3 py-6 text-center text-sm text-text-muted">
          {t('ag.empty')}
        </p>
      ) : vista === 'editar' ? (
        <div className="flex flex-col gap-4">
          {dias.map(([dia, lista]) => (
            <TablaDia
              key={dia}
              dia={dia}
              lista={lista}
              onCampo={actualizar}
              onMover={mover}
              onEliminar={eliminarFila}
              onAgregar={() => agregarFila(dia)}
              onEliminarDia={() => eliminarDia(dia)}
            />
          ))}
          <div>
            <button
              type="button"
              onClick={agregarDia}
              className="rounded-lg border border-border-app bg-surface px-3 py-1.5 text-sm font-semibold text-text-2 hover:border-brand"
            >
              {t('ag.addDay')}
            </button>
          </div>
        </div>
      ) : (
        <VistaAsistente dias={dias} />
      )}

      {/* el fallo del guardado va con borde y en negrita: si pasa inadvertido,
          el usuario se va creyendo que guardó */}
      {msg && (
        <p
          role={msg.tono === 'err' ? 'alert' : undefined}
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            msg.tono === 'ok'
              ? 'bg-success/10 text-success'
              : msg.tono === 'warn'
                ? 'bg-amber-500/10 text-amber-500'
                : 'border border-danger/50 bg-danger/10 font-semibold text-danger'
          }`}
        >
          {msg.txt}
        </p>
      )}
    </div>
  );
}

/* ───────────────────────── vista previa del import ───────────────────────── */

function PanelPrevia({
  res,
  busy,
  onImportar,
  onDescartar,
}: {
  res: ResultadoAgendaExcel;
  busy: boolean;
  onImportar: () => void;
  onDescartar: () => void;
}) {
  const { t } = useI18n();
  const r = useMemo(() => resumenAgenda(res.filas), [res]);
  const sesionesPorDia = useMemo(
    () => porDia(agruparSesiones(res.filas)),
    [res],
  );

  return (
    <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <p className="text-sm font-semibold text-text">{t('ag.previewTitle')}</p>
      <p className="mt-0.5 text-sm text-text-2">
        {t('ag.previewSheet', { name: res.hojas[0] ?? '' })}
      </p>
      <p className="mt-0.5 text-sm text-text-2">
        {t('ag.previewCount', { rows: r.filas, sessions: r.sesiones, days: r.dias })}
      </p>
      {res.omitidas > 0 && (
        <p className="mt-0.5 text-xs text-text-muted">
          {t('ag.previewSkipped', { n: res.omitidas })}
        </p>
      )}
      <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-500">
        {t('ag.replaceWarn')}
      </p>

      <div className="mt-2 max-h-80 overflow-auto rounded-lg border border-border-app bg-surface p-2">
        {sesionesPorDia.map(([dia, sesiones]) => (
          <div key={dia} className="mb-2 last:mb-0">
            <p className="mb-1 text-xs font-semibold text-text">
              {t('ag.day', { n: dia })}
              <span className="ml-2 font-normal text-text-muted">
                {t('ag.sessionsCount', { n: sesiones.length })}
              </span>
            </p>
            <ul className="space-y-0.5">
              {sesiones.map((s) => (
                <li key={s.clave} className="flex flex-wrap items-baseline gap-1.5 text-xs">
                  <span className="tabular-nums text-text-2">
                    {hhmm(s.horaInicio)}
                    {s.horaFin ? `–${s.horaFin}` : ''}
                  </span>
                  {s.esDescanso ? (
                    <span className="text-text-muted">
                      {tituloCase(s.filas[0]?.tema)}
                    </span>
                  ) : (
                    <>
                      <span className="text-text">{tituloCase(s.salon) || '—'}</span>
                      {s.area && (
                        <EtiquetaArea area={s.area} />
                      )}
                      <span className="text-text-muted">
                        {t('ag.talksCount', { n: s.filas.length })}
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        {/* importa Y GUARDA en un paso: no hay un segundo botón que descubrir */}
        <button
          type="button"
          onClick={onImportar}
          disabled={busy}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? t('c.saving') : t('ag.useImport')}
        </button>
        <button
          type="button"
          onClick={onDescartar}
          disabled={busy}
          className="rounded-lg border border-border-app bg-surface px-3 py-1.5 text-sm font-semibold text-text-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('ag.discard')}
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── edición manual ───────────────────────── */

/**
 * `normal-case` es OBLIGATORIO aquí. globals.css pinta todos los inputs del
 * panel en MAYÚSCULAS porque el cliente API los subía a mayúsculas al guardar;
 * la agenda ya no pasa por ahí (`api.putTalCual`), así que sin esta clase el
 * input MENTIRÍA: mostraría "CLEFT CARE IN BAURU" mientras guarda "Cleft care
 * in Bauru", y quien reescribiera la celda perdería la capitalización del
 * cliente sin enterarse. globals.css contempla justo este caso ("campos con
 * case sensible usan la clase `normal-case`").
 */
const INP =
  'w-full rounded-md border border-border-app bg-surface px-2 py-1 text-sm text-text normal-case outline-none focus:border-brand';

function TablaDia({
  dia,
  lista,
  onCampo,
  onMover,
  onEliminar,
  onAgregar,
  onEliminarDia,
}: {
  dia: number;
  lista: FilaLocal[];
  onCampo: (uid: string, campo: CampoTexto, valor: string) => void;
  onMover: (uid: string, delta: number) => void;
  onEliminar: (uid: string) => void;
  onAgregar: () => void;
  onEliminarDia: () => void;
}) {
  const { t } = useI18n();

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-text">{t('ag.day', { n: dia })}</span>
        <span className="text-xs text-text-muted">
          {t('ag.rowsCount', { n: lista.length })}
        </span>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={onAgregar}
            className="rounded-lg border border-border-app bg-surface px-2 py-1 text-xs font-semibold text-text-2 hover:border-brand"
          >
            {t('ag.addRow')}
          </button>
          <button
            type="button"
            onClick={onEliminarDia}
            title={t('ag.dayDelete')}
            aria-label={t('ag.dayDelete')}
            className="rounded-lg border border-border-app bg-surface px-2 py-1 text-xs text-danger hover:bg-surface-2"
          >
            &#10005;
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border-app bg-surface">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="bg-surface-2 text-xs text-text-muted">
            <tr>
              <th className="w-16 p-1.5" />
              <th className="w-24 p-1.5">{t('ag.start')}</th>
              <th className="w-24 p-1.5">{t('ag.end')}</th>
              <th className="w-40 p-1.5">{t('ag.room')}</th>
              <th className="w-36 p-1.5">{t('ag.area')}</th>
              <th className="p-1.5">{t('ag.topic')}</th>
              <th className="w-48 p-1.5">{t('ag.speaker')}</th>
              <th className="w-28 p-1.5">{t('ag.nationality')}</th>
              <th className="w-32 p-1.5">{t('ag.type')}</th>
              <th className="w-36 p-1.5">{t('ag.sponsor')}</th>
              <th className="w-10 p-1.5" />
            </tr>
          </thead>
          <tbody>
            {lista.map((f, i) => (
              <tr
                key={f.uid}
                className={`border-t border-border-app ${
                  f.tipo === 'DESCANSO' ? 'bg-surface-2/50' : ''
                }`}
              >
                <td className="p-1">
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => onMover(f.uid, -1)}
                      disabled={i === 0}
                      title={t('ag.rowUp')}
                      aria-label={t('ag.rowUp')}
                      className="rounded border border-border-app px-1 text-xs text-text-2 hover:border-brand disabled:opacity-30"
                    >
                      &#9650;
                    </button>
                    <button
                      type="button"
                      onClick={() => onMover(f.uid, 1)}
                      disabled={i === lista.length - 1}
                      title={t('ag.rowDown')}
                      aria-label={t('ag.rowDown')}
                      className="rounded border border-border-app px-1 text-xs text-text-2 hover:border-brand disabled:opacity-30"
                    >
                      &#9660;
                    </button>
                  </div>
                </td>
                <td className="p-1">
                  <input
                    type="time"
                    value={f.horaInicio}
                    onChange={(e) => onCampo(f.uid, 'horaInicio', e.target.value)}
                    aria-label={t('ag.start')}
                    className={INP}
                  />
                </td>
                <td className="p-1">
                  <input
                    type="time"
                    value={f.horaFin}
                    onChange={(e) => onCampo(f.uid, 'horaFin', e.target.value)}
                    aria-label={t('ag.end')}
                    className={INP}
                  />
                </td>
                <td className="p-1">
                  <input
                    value={f.salon}
                    maxLength={120}
                    onChange={(e) => onCampo(f.uid, 'salon', e.target.value)}
                    aria-label={t('ag.room')}
                    className={INP}
                  />
                </td>
                <td className="p-1">
                  <input
                    value={f.area}
                    maxLength={80}
                    onChange={(e) => onCampo(f.uid, 'area', e.target.value)}
                    aria-label={t('ag.area')}
                    className={INP}
                  />
                </td>
                <td className="p-1">
                  <input
                    value={f.tema}
                    maxLength={600}
                    onChange={(e) => onCampo(f.uid, 'tema', e.target.value)}
                    aria-label={t('ag.topic')}
                    className={INP}
                  />
                </td>
                <td className="p-1">
                  <input
                    value={f.conferencista}
                    maxLength={200}
                    onChange={(e) => onCampo(f.uid, 'conferencista', e.target.value)}
                    aria-label={t('ag.speaker')}
                    className={INP}
                  />
                </td>
                <td className="p-1">
                  <input
                    value={f.nacionalidad}
                    maxLength={80}
                    onChange={(e) => onCampo(f.uid, 'nacionalidad', e.target.value)}
                    aria-label={t('ag.nationality')}
                    className={INP}
                  />
                </td>
                <td className="p-1">
                  <select
                    value={f.tipo}
                    onChange={(e) => onCampo(f.uid, 'tipo', e.target.value)}
                    aria-label={t('ag.type')}
                    className={INP}
                  >
                    {TIPOS.map((tp) => (
                      <option key={tp} value={tp}>
                        {t(`ag.t${tp}`)}
                      </option>
                    ))}
                    {!(TIPOS as readonly string[]).includes(f.tipo) && (
                      <option value={f.tipo}>{f.tipo}</option>
                    )}
                  </select>
                </td>
                <td className="p-1">
                  <input
                    value={f.patrocinador}
                    maxLength={160}
                    onChange={(e) => onCampo(f.uid, 'patrocinador', e.target.value)}
                    aria-label={t('ag.sponsor')}
                    className={INP}
                  />
                </td>
                <td className="p-1">
                  <button
                    type="button"
                    onClick={() => onEliminar(f.uid)}
                    title={t('ag.rowDelete')}
                    aria-label={t('ag.rowDelete')}
                    className="rounded-lg border border-border-app px-2 py-1 text-xs text-danger hover:bg-surface-2"
                  >
                    &#10005;
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────────────────── vista del asistente ───────────────────────── */

function EtiquetaArea({ area }: { area: string }) {
  const c = colorArea(area.toUpperCase());
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
      style={{ color: c, backgroundColor: `${c}1f`, borderColor: `${c}55` }}
    >
      {tituloCase(area)}
    </span>
  );
}

interface Franja {
  clave: string;
  inicio: string;
  fin: string;
  salas: SesionAgenda[];
  descansos: SesionAgenda[];
}

/** Sesiones de un día agrupadas por franja horaria (las salas en paralelo caen
 *  en la misma franja y se pintan una junto a otra). */
function franjasDelDia(filas: FilaAgenda[]): Franja[] {
  const m = new Map<string, Franja>();
  for (const s of agruparSesiones(filas)) {
    const clave = `${s.horaInicio}|${s.horaFin}`;
    let fr = m.get(clave);
    if (!fr) {
      fr = { clave, inicio: s.horaInicio, fin: s.horaFin, salas: [], descansos: [] };
      m.set(clave, fr);
    }
    if (s.esDescanso) fr.descansos.push(s);
    else fr.salas.push(s);
  }
  return [...m.values()].sort((a, b) =>
    (a.inicio || '99:99').localeCompare(b.inicio || '99:99'),
  );
}

function VistaAsistente({ dias }: { dias: Array<[number, FilaLocal[]]> }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-text-muted">{t('ag.parallelHint')}</p>
      {dias.map(([dia, lista]) => (
        <div key={dia}>
          <p className="mb-2 text-sm font-semibold text-text">{t('ag.day', { n: dia })}</p>
          {lista.length === 0 ? (
            <p className="text-xs text-text-muted">{t('ag.dayEmpty')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {franjasDelDia(lista).map((fr) => (
                <div key={fr.clave} className="flex flex-col gap-2">
                  {/* descansos y actos: líneas finas, sin tarjeta */}
                  {fr.descansos.map((d) => (
                    <div key={d.clave} className="flex items-center gap-2 py-0.5">
                      <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-text-muted">
                        {hhmm(d.horaInicio)}
                      </span>
                      <span className="h-px flex-1 bg-border-app" />
                      <span className="shrink-0 text-[11px] text-text-muted">
                        {tituloCase(d.filas[0]?.tema)}
                      </span>
                      <span className="h-px flex-1 bg-border-app" />
                    </div>
                  ))}

                  {fr.salas.length > 0 && (
                    <div className="flex gap-3">
                      <div className="w-16 shrink-0 pt-2 text-right">
                        <div className="text-sm font-semibold tabular-nums text-text">
                          {hhmm(fr.inicio)}
                        </div>
                        {fr.fin && (
                          <div className="text-[11px] tabular-nums text-text-muted">
                            {fr.fin}
                          </div>
                        )}
                      </div>
                      <div
                        className={`grid min-w-0 flex-1 gap-2 ${
                          fr.salas.length > 1 ? 'sm:grid-cols-2 xl:grid-cols-3' : ''
                        }`}
                      >
                        {fr.salas.map((s) => (
                          <TarjetaSesion key={s.clave} sesion={s} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TarjetaSesion({ sesion }: { sesion: SesionAgenda }) {
  const { t } = useI18n();
  return (
    <div className="min-w-0 rounded-lg border border-border-app bg-surface p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        {sesion.salon && (
          <span className="truncate text-xs font-semibold text-text">
            {tituloCase(sesion.salon)}
          </span>
        )}
        {sesion.area && <EtiquetaArea area={sesion.area} />}
      </div>
      <ul className="flex flex-col gap-1.5">
        {sesion.filas.map((f, i) => (
          <li key={i} className="border-l-2 border-border-app pl-2">
            <div className="text-sm leading-snug text-text">
              {tituloCase(f.tema)}
            </div>
            {(f.conferencista || f.nacionalidad) && (
              <div className="text-[11px] text-text-muted">
                {tituloCase(f.conferencista)}
                {f.conferencista && f.nacionalidad ? ' · ' : ''}
                {tituloCase(f.nacionalidad)}
              </div>
            )}
            <div className="mt-0.5 flex flex-wrap gap-1">
              {f.tipo !== 'PONENCIA' && f.tipo !== 'DESCANSO' && (
                <span className="rounded-full border border-border-app px-1.5 py-0.5 text-[10px] text-text-2">
                  {etiquetaTipo(t, f.tipo)}
                </span>
              )}
              {f.patrocinador && (
                <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-text-muted">
                  {tituloCase(f.patrocinador)}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
