/**
 * Agenda detallada de UN día del evento (congresos con varias salas en paralelo).
 *
 * El campo `sesiones` de cada día es OPCIONAL y puede no venir (API todavía sin
 * desplegar): `sesionesDeDia()` devuelve [] en ese caso, el día no se vuelve
 * tocable y el detalle del evento se comporta EXACTAMENTE como antes.
 *
 * Los textos llegan en MAYÚSCULAS desde la base (el panel los guarda tal cual),
 * por eso todo lo que se pinta pasa por `tituloCase()`.
 */
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  CharlaSesion,
  DiaEvento,
  PonenteSesion,
  SesionAgenda,
} from '@connecthub/shared-types';
import { AppText } from '@/design-system/components';
import { useTheme, palette } from '@/design-system/theme';
import { fontSize, fontWeight, radius, shadow, spacing } from '@/design-system/tokens';
import { useI18n, type Lang } from '@/i18n';
import { shortDate, weekday } from '@/lib/fecha';

/* ---------- lectura defensiva del campo nuevo ---------- */

/**
 * Lee `dia.sesiones` sin asumir nada: el campo es NUEVO y puede no existir (API
 * sin desplegar), venir null o no ser un array (respuesta cacheada anterior).
 * Devuelve [] en todos esos casos, nunca lanza.
 */
export function sesionesDeDia(dia: DiaEvento): SesionAgenda[] {
  const raw: unknown = dia?.sesiones;
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is SesionAgenda => !!s && typeof s === 'object');
}

/* ---------- capitalización conservadora ---------- */

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
 * Pasa un texto de la base (MAYÚSCULAS) a algo legible, sin destrozar siglas ni
 * nombres propios. Si el texto YA trae minúsculas se respeta tal cual: significa
 * que quien lo cargó lo escribió con su formato.
 */
export function tituloCase(texto?: string | null): string {
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

/* ---------- color por área ---------- */

const TONOS_AREA = [
  { bg: 'rgba(166,77,247,0.16)', light: palette.brand700, dark: palette.brand300 },
  { bg: 'rgba(34,211,238,0.16)', light: '#0E7490', dark: palette.cyan400 },
  { bg: 'rgba(236,72,153,0.16)', light: '#BE185D', dark: palette.pink500 },
  { bg: 'rgba(245,158,11,0.18)', light: '#B45309', dark: palette.amber500 },
  { bg: 'rgba(34,197,94,0.16)', light: palette.green600, dark: palette.green500 },
  { bg: 'rgba(99,102,241,0.18)', light: '#4338CA', dark: '#A5B4FC' },
] as const;

/** Mismo área -> mismo color, de forma estable entre días y renders. */
function tonoArea(area: string) {
  const k = area.trim().toUpperCase();
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return TONOS_AREA[h % TONOS_AREA.length];
}

function EtiquetaArea({ area }: { area: string }) {
  const t = useTheme();
  const tono = tonoArea(area);
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: tono.bg,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs + 1,
        borderRadius: radius.full,
      }}
    >
      <AppText
        color={t.mode === 'dark' ? tono.dark : tono.light}
        style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold }}
      >
        {area}
      </AppText>
    </View>
  );
}

/* ---------- agrupado por horario ---------- */

interface BloqueHorario {
  clave: string;
  horaInicio: string;
  /** Vacío cuando las sesiones del bloque no terminan a la misma hora. */
  horaFin: string;
  sesiones: SesionAgenda[];
}

function esDescanso(s: SesionAgenda): boolean {
  const tipo = (s.tipo ?? '').trim().toUpperCase();
  return tipo === 'DESCANSO' || tipo === 'PROTOCOLO';
}

/**
 * Las sesiones ya vienen ordenadas por hora y, a igual hora, por salón: basta
 * agrupar las consecutivas que comparten hora de inicio para que las salas en
 * paralelo queden una debajo de otra bajo el mismo horario.
 */
function agruparPorHora(sesiones: SesionAgenda[]): BloqueHorario[] {
  const bloques: BloqueHorario[] = [];
  for (const s of sesiones) {
    const ini = (s.horaInicio ?? '').trim();
    const ultimo = bloques[bloques.length - 1];
    if (ultimo && ultimo.horaInicio === ini) ultimo.sesiones.push(s);
    else bloques.push({ clave: `${ini}#${bloques.length}`, horaInicio: ini, horaFin: '', sesiones: [s] });
  }
  for (const b of bloques) {
    const fines = new Set(b.sesiones.map((s) => (s.horaFin ?? '').trim()).filter(Boolean));
    b.horaFin = fines.size === 1 ? [...fines][0] : '';
  }
  return bloques;
}

/* ---------- piezas ---------- */

function Ponente({ p }: { p: PonenteSesion }) {
  const t = useTheme();
  const nombre = tituloCase(p?.nombre);
  const nacionalidad = tituloCase(p?.nacionalidad);
  if (!nombre && !nacionalidad) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs }}>
      {nombre ? (
        <AppText variant="caption" style={{ fontWeight: fontWeight.medium }}>
          {nombre}
        </AppText>
      ) : null}
      {nacionalidad ? (
        <AppText variant="caption" color={t.colors.textFaint}>
          {nombre ? `· ${nacionalidad}` : nacionalidad}
        </AppText>
      ) : null}
    </View>
  );
}

/** Sesión normal (ponencia) como tarjeta. */
function TarjetaSesion({ sesion, mostrarFin }: { sesion: SesionAgenda; mostrarFin: boolean }) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const area = tituloCase(sesion.area);
  const salon = tituloCase(sesion.salon);
  const fin = (sesion.horaFin ?? '').trim();
  const charlas = (sesion.charlas ?? []).filter((c): c is CharlaSesion => !!c && typeof c === 'object');
  // En las ponencias el contenido va en `charlas` y `titulo` es null; si llegara
  // una ponencia sin charlas, el rótulo de `titulo` evita una tarjeta vacía.
  const titulo = charlas.length === 0 ? tituloCase(sesion.titulo) : '';
  const meta = [salon, mostrarFin && fin ? `${tr('agendaDia.until')} ${fin}` : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <View
      style={[
        {
          backgroundColor: t.colors.card,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: t.colors.border,
          padding: spacing.md,
          gap: spacing.sm,
        },
        shadow.card,
      ]}
    >
      {area ? <EtiquetaArea area={area} /> : null}

      {meta ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Ionicons
            name="location-outline"
            size={14}
            color={t.colors.textMuted}
            accessibilityLabel={tr('agendaDia.room')}
          />
          <AppText variant="caption" muted style={{ flex: 1 }} numberOfLines={2}>
            {meta}
          </AppText>
        </View>
      ) : null}

      {titulo ? <AppText variant="bodyStrong">{titulo}</AppText> : null}

      {charlas.map((c, i) => {
        const tema = tituloCase(c.tema);
        const ponentes = (c.ponentes ?? []).filter((p): p is PonenteSesion => !!p && typeof p === 'object');
        return (
          <View key={i} style={{ gap: 3 }}>
            {/* varias charlas distintas en la misma sesión: línea fina entre ellas */}
            {i > 0 ? (
              <View
                style={{
                  height: StyleSheet.hairlineWidth,
                  backgroundColor: t.colors.border,
                  marginBottom: spacing.sm,
                }}
              />
            ) : null}
            {tema ? <AppText variant="bodyStrong">{tema}</AppText> : null}
            {ponentes.map((p, j) => (
              <Ponente key={j} p={p} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

/** Coffee break / almuerzo / inauguración: fila fina, sin tarjeta. */
function FilaDescanso({ sesion }: { sesion: SesionAgenda }) {
  const t = useTheme();
  const { t: tr } = useI18n();
  // En los DESCANSO/PROTOCOLO el rótulo va en `titulo` y `charlas` viene vacío.
  const desdeCharlas = (sesion.charlas ?? []).find((c) => !!c?.tema && c.tema.trim())?.tema ?? '';
  const texto = tituloCase(sesion.titulo || desdeCharlas || sesion.area) || tr('agendaDia.break');
  const salon = tituloCase(sesion.salon);
  const icono = (sesion.tipo ?? '').trim().toUpperCase() === 'PROTOCOLO' ? 'star-outline' : 'cafe-outline';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: t.colors.surfaceAlt,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Ionicons name={icono} size={15} color={t.colors.textMuted} />
      <AppText variant="caption" muted style={{ flex: 1 }} numberOfLines={2}>
        {[texto, salon].filter(Boolean).join(' · ')}
      </AppText>
    </View>
  );
}

function BloqueAgenda({ bloque }: { bloque: BloqueHorario }) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const enParalelo = bloque.sesiones.filter((s) => !esDescanso(s)).length > 1;
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md }}>
      {/* columna estrecha de horario: inicio arriba, fin debajo más tenue */}
      <View style={{ width: 54, paddingTop: 2 }}>
        {bloque.horaInicio ? <AppText variant="bodyStrong">{bloque.horaInicio}</AppText> : null}
        {bloque.horaFin ? (
          <AppText variant="caption" color={t.colors.textFaint}>
            {bloque.horaFin}
          </AppText>
        ) : null}
      </View>

      <View style={{ flex: 1, gap: spacing.sm }}>
        {enParalelo ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Ionicons name="git-branch-outline" size={13} color={t.colors.brand} />
            <AppText variant="label" color={t.colors.brandText} style={{ flex: 1 }}>
              {tr('agendaDia.parallel')}
            </AppText>
          </View>
        ) : null}
        {bloque.sesiones.map((s, i) =>
          esDescanso(s) ? (
            <FilaDescanso key={i} sesion={s} />
          ) : (
            <TarjetaSesion key={i} sesion={s} mostrarFin={!bloque.horaFin} />
          ),
        )}
      </View>
    </View>
  );
}

/* ---------- hoja de la agenda del día ---------- */

export function AgendaDiaSheet({
  dia,
  indice,
  lang,
  onClose,
}: {
  dia: DiaEvento | null;
  indice: number;
  lang: Lang;
  onClose: () => void;
}) {
  const t = useTheme();
  const { t: tr } = useI18n();
  const insets = useSafeAreaInsets();
  const sesiones = useMemo(() => (dia ? sesionesDeDia(dia) : []), [dia]);
  const bloques = useMemo(() => agruparPorHora(sesiones), [sesiones]);
  const n = sesiones.length;

  return (
    <Modal visible={!!dia} transparent animationType="slide" onRequestClose={onClose}>
      {/* El fondo va como hermano DETRÁS de la hoja, no como padre. Antes la
          hoja colgaba de un Pressable con stopPropagation y ese componente se
          quedaba con el gesto de arrastre en iOS: la agenda no scrolleaba y
          solo se veían las primeras horas del día. */}
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={tr('common.close')}
          style={[StyleSheet.absoluteFill, { backgroundColor: t.colors.overlay }]}
        />
        <View
          style={{
            backgroundColor: t.colors.bgElevated,
            borderTopLeftRadius: radius['2xl'],
            borderTopRightRadius: radius['2xl'],
            paddingBottom: insets.bottom + spacing.md,
            maxHeight: '92%',
          }}
        >
          {/* grabber + cerrar */}
          <View style={{ alignItems: 'center', paddingTop: spacing.sm }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.colors.border }} />
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={tr('common.close')}
            style={{ position: 'absolute', top: spacing.md, right: spacing.md, zIndex: 2 }}
          >
            <Ionicons name="close" size={24} color={t.colors.textMuted} />
          </Pressable>

          {/* encabezado */}
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, gap: 2 }}>
            <AppText variant="title">{`${tr('event.day')} ${indice + 1}`}</AppText>
            {dia ? (
              <AppText muted variant="caption">
                {`${weekday(dia.fecha, lang)} · ${shortDate(dia.fecha, lang)}`}
                {n > 0 ? ` · ${n} ${n === 1 ? tr('agendaDia.session') : tr('agendaDia.sessions')}` : ''}
              </AppText>
            ) : null}
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.xl,
              gap: spacing.lg,
            }}
          >
            {bloques.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: spacing['2xl'], gap: spacing.sm }}>
                <Ionicons name="calendar-clear-outline" size={32} color={t.colors.textFaint} />
                <AppText muted variant="caption">
                  {tr('agendaDia.empty')}
                </AppText>
              </View>
            ) : (
              bloques.map((b) => <BloqueAgenda key={b.clave} bloque={b} />)
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
