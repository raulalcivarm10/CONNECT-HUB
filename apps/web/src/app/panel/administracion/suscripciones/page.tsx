'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { useInstitucionesCatalogo } from '@/lib/catalogos';
import { useDebounce } from '@/lib/debounce';
import { useDialogo } from '@/lib/dialogo';
import { descargarExcel } from '@/lib/excel';
import { useI18n } from '@/lib/i18n';
import type { InstitucionRow } from '@/lib/types';
import { propsValidacion } from '@/lib/validacion';
import {
  ESTADOS_SUSCRIPCION,
  etiquetaCatalogo,
  esVerdadero,
  fechaLegible,
  hoyISO,
  tonoVencimiento,
  usePlanesCatalogo,
  type EstadoSuscripcion,
  type PlanRow,
  type SuscripcionesResp,
  type SuscripcionRow,
} from '@/lib/suscripciones';

const ESTADO_STYLE: Record<EstadoSuscripcion, string> = {
  ACTIVA: 'bg-success/10 text-success',
  VENCIDA: 'bg-danger/10 text-danger',
  CANCELADA: 'bg-surface-2 text-text-muted',
  REEMPLAZADA: 'bg-surface-2 text-text-muted',
};

/** tinte de la fila según lo que le queda de vigencia */
const TONO_FILA = {
  danger: 'bg-danger/5',
  warning: 'bg-amber-500/5',
} as const;

/** color del número de días restantes */
const TONO_DIAS = {
  danger: 'text-danger font-bold',
  warning: 'text-amber-500 font-semibold',
} as const;

const inputCls =
  'rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-brand';
const campoCls =
  'w-full rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-text outline-none focus:border-brand';

/**
 * Lo que está por vencer, arriba: orden ascendente por días restantes.
 *
 * Las canceladas y reemplazadas se van al final aunque su número sea el más
 * bajo: ya no son vigencia viva y, mezcladas, coparían las primeras filas con
 * ruido justo donde se quiere ver qué clientes hay que renovar.
 */
function ordenPorVencer(a: SuscripcionRow, b: SuscripcionRow): number {
  const inerte = (s: SuscripcionRow) =>
    s.estado === 'CANCELADA' || s.estado === 'REEMPLAZADA' ? 1 : 0;
  const d = inerte(a) - inerte(b);
  return d !== 0 ? d : a.diasRestantes - b.diasRestantes;
}

/** Filas fantasma mientras llega la respuesta (evita el flash de "sin datos"). */
function FilasSkeleton({ cols, filas = 6 }: { cols: number; filas?: number }) {
  return (
    <>
      {Array.from({ length: filas }, (_, i) => (
        <tr key={i} className="border-b border-border-app/60">
          <td colSpan={cols} className="px-4 py-3">
            <div className="h-4 animate-pulse rounded bg-surface-2" />
          </td>
        </tr>
      ))}
    </>
  );
}

function Tarjeta({
  titulo,
  valor,
  cargando,
  tono,
}: {
  titulo: string;
  valor: number;
  cargando: boolean;
  tono?: 'danger' | 'warning' | 'success';
}) {
  const color =
    tono === 'danger'
      ? 'text-danger'
      : tono === 'warning'
        ? 'text-amber-500'
        : tono === 'success'
          ? 'text-success'
          : 'text-text';
  return (
    <div className="rounded-2xl border border-border-app bg-surface p-4">
      <div className="text-sm text-text-muted">{titulo}</div>
      {cargando ? (
        <div className="mt-1 h-8 w-16 animate-pulse rounded bg-surface-2" />
      ) : (
        <div className={`mt-1 text-2xl font-bold ${color}`}>{valor}</div>
      )}
    </div>
  );
}

export default function SuscripcionesPage() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const dialogo = useDialogo();
  const esSuper = !!user?.esSuper;

  const { instituciones } = useInstitucionesCatalogo(esSuper);
  const { planes } = usePlanesCatalogo(esSuper);

  const [items, setItems] = useState<SuscripcionRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // filtros del servidor
  const [fInstitucion, setFInstitucion] = useState('');
  const [fEstado, setFEstado] = useState('');
  // buscador por correo: el API no lo soporta, se filtra en cliente
  const [correo, setCorreo] = useState('');
  const correoBuscar = useDebounce(correo.trim().toLowerCase(), 300);

  const [crear, setCrear] = useState(false);
  const [editar, setEditar] = useState<SuscripcionRow | null>(null);

  const cargar = useCallback(async () => {
    const qs = new URLSearchParams();
    if (fInstitucion) qs.set('idInstitucion', fInstitucion);
    if (fEstado) qs.set('estado', fEstado);
    const s = qs.toString();
    const res = await api.get<SuscripcionesResp>(
      `/suscripciones${s ? `?${s}` : ''}`,
    );
    setItems(res.items ?? []);
  }, [fInstitucion, fEstado]);

  useEffect(() => {
    if (!esSuper) return;
    setCargando(true);
    setError(null);
    cargar()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setCargando(false));
  }, [cargar, esSuper]);

  const filtradas = useMemo(() => {
    const base = correoBuscar
      ? items.filter((s) =>
          (s.compradorEmail ?? '').toLowerCase().includes(correoBuscar),
        )
      : items;
    return [...base].sort(ordenPorVencer);
  }, [items, correoBuscar]);

  // resumen "de un golpe": cuántos clientes están bien, cuántos aprietan
  const resumen = useMemo(() => {
    let activas = 0;
    let porVencer = 0;
    let vencidas = 0;
    for (const s of filtradas) {
      if (s.estado === 'ACTIVA') activas++;
      if (s.estado === 'VENCIDA') vencidas++;
      if (s.estado === 'ACTIVA' && s.diasRestantes <= 7) porVencer++;
    }
    return { activas, porVencer, vencidas, total: filtradas.length };
  }, [filtradas]);

  async function cancelar(s: SuscripcionRow) {
    const confirmado = await dialogo.confirmar({
      titulo: t('sub.cancelTitle', { name: s.institucion }),
      mensaje: t('sub.cancelMsg', { date: fechaLegible(s.fechaFin, locale) }),
      tono: 'danger',
      confirmar: t('sub.cancelDo'),
    });
    if (!confirmado) return;
    setError(null);
    setOk(null);
    try {
      await api.post(`/suscripciones/${s.idSuscripcion}/cancelar`);
      setOk(t('sub.cancelled', { name: s.institucion }));
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('c.error'));
    }
  }

  function exportar() {
    void descargarExcel('subscriptions', [
      {
        nombre: t('sub.xSheet'),
        filas: filtradas.map((s) => ({
          [t('sub.institution')]: s.institucion,
          [t('sub.buyer')]: (s.compradorEmail ?? '').toLowerCase(),
          [t('sub.buyerName')]: s.compradorNombre,
          [t('sub.plan')]: s.plan,
          [t('sub.purchased')]: s.fechaCompra,
          [t('sub.start')]: s.fechaInicio,
          [t('sub.end')]: s.fechaFin,
          [t('sub.days')]: s.dias,
          [t('sub.daysLeft')]: s.diasRestantes,
          [t('c.state')]: etiquetaCatalogo(t, 'sub.st', s.estado),
          [t('sub.amount')]: s.monto,
          [t('sub.currency')]: s.moneda,
          [t('sub.reference')]: s.referenciaPago,
          [t('sub.notes')]: s.notas,
        })),
      },
    ]);
  }

  if (!esSuper) {
    return <p className="text-text-muted">{t('sub.onlySuper')}</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">{t('sub.title')}</h1>
          <p className="text-sm text-text-2">{t('sub.subtitle')}</p>
        </div>
        <button
          onClick={() => {
            setCrear((v) => !v);
            setEditar(null);
          }}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          {crear ? t('c.cancel') : t('sub.new')}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta
          titulo={t('sub.cardTotal')}
          valor={resumen.total}
          cargando={cargando}
        />
        <Tarjeta
          titulo={t('sub.cardActive')}
          valor={resumen.activas}
          cargando={cargando}
          tono="success"
        />
        <Tarjeta
          titulo={t('sub.cardSoon')}
          valor={resumen.porVencer}
          cargando={cargando}
          tono="warning"
        />
        <Tarjeta
          titulo={t('sub.cardExpired')}
          valor={resumen.vencidas}
          cargando={cargando}
          tono="danger"
        />
      </div>

      {crear && (
        <NuevaSuscripcionForm
          instituciones={instituciones}
          planes={planes}
          onCancel={() => setCrear(false)}
          onDone={(msg) => {
            setCrear(false);
            setOk(msg);
            setError(null);
            void cargar();
          }}
        />
      )}

      {editar && (
        <EditarSuscripcionForm
          key={editar.idSuscripcion}
          suscripcion={editar}
          onCancel={() => setEditar(null)}
          onDone={(msg) => {
            setEditar(null);
            setOk(msg);
            setError(null);
            void cargar();
          }}
        />
      )}

      {error && (
        <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {ok && (
        <p className="mt-4 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          {ok}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <select
          value={fInstitucion}
          onChange={(e) => setFInstitucion(e.target.value)}
          className={inputCls}
          title={t('sub.institution')}
        >
          <option value="">{t('sub.allInstitutions')}</option>
          {instituciones.map((i) => (
            <option key={i.ID_INSTITUCION} value={i.ID_INSTITUCION}>
              {i.NOMBRE}
            </option>
          ))}
        </select>
        <select
          value={fEstado}
          onChange={(e) => setFEstado(e.target.value)}
          className={inputCls}
          title={t('c.state')}
        >
          <option value="">{t('sub.allStates')}</option>
          {ESTADOS_SUSCRIPCION.map((e) => (
            <option key={e} value={e}>
              {etiquetaCatalogo(t, 'sub.st', e)}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder={t('sub.searchBuyer')}
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          className={`${inputCls} normal-case min-w-56`}
        />
        <button
          onClick={exportar}
          disabled={filtradas.length === 0}
          className="rounded-lg bg-success/15 px-4 py-2 text-sm font-semibold text-success hover:bg-success/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ⬇️ {t('c.excel')}
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border-app bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-app text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="px-3 py-3">{t('sub.institution')}</th>
              <th className="px-3 py-3">{t('sub.buyer')}</th>
              <th className="px-3 py-3">{t('sub.plan')}</th>
              <th className="px-3 py-3">{t('sub.purchased')}</th>
              <th className="px-3 py-3">{t('sub.start')}</th>
              <th className="px-3 py-3">{t('sub.end')}</th>
              <th className="px-3 py-3">{t('sub.daysLeft')}</th>
              <th className="px-3 py-3">{t('c.state')}</th>
              <th className="px-3 py-3">{t('sub.amount')}</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {cargando && <FilasSkeleton cols={10} />}
            {!cargando &&
              filtradas.map((s) => {
                const tono = tonoVencimiento(s.diasRestantes, s.estado);
                return (
                  <tr
                    key={s.idSuscripcion}
                    className={`border-b border-border-app/60 ${tono ? TONO_FILA[tono] : ''}`}
                  >
                    <td className="px-3 py-2 font-medium text-text">
                      {s.institucion}
                    </td>
                    {/* el API guarda el correo en minúsculas; se muestra así
                        para que no se vea gritado como el resto de textos */}
                    <td className="px-3 py-2 text-text-2">
                      <span className="lowercase">
                        {(s.compradorEmail ?? '').toLowerCase()}
                      </span>
                      {s.compradorNombre && (
                        <div className="text-xs text-text-muted">
                          {s.compradorNombre}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-text-2">
                      {s.plan ?? '—'}
                      <div className="text-xs text-text-muted">
                        {t('sub.nDays', { days: s.dias })}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-text-2">
                      {fechaLegible(s.fechaCompra, locale)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-text-2">
                      {fechaLegible(s.fechaInicio, locale)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-text-2">
                      {fechaLegible(s.fechaFin, locale)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <DiasRestantes suscripcion={s} />
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold ${ESTADO_STYLE[s.estado] ?? 'bg-surface-2 text-text-2'}`}
                      >
                        {etiquetaCatalogo(t, 'sub.st', s.estado)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-text-2">
                      {s.monto != null
                        ? `${s.monto.toFixed(2)} ${s.moneda ?? ''}`.trim()
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditar(s);
                            setCrear(false);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="rounded-lg border border-border-app px-3 py-1 text-xs text-text-2 hover:bg-surface-2"
                        >
                          {t('c.edit')}
                        </button>
                        {s.estado !== 'CANCELADA' && (
                          <button
                            onClick={() => cancelar(s)}
                            className="rounded-lg border border-border-app px-3 py-1 text-xs text-danger hover:bg-surface-2"
                          >
                            {t('sub.cancelDo')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            {!cargando && filtradas.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-text-muted">
                  {t('sub.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-text-muted">{t('sub.legend')}</p>
    </div>
  );
}

/** Días restantes en palabras: "12 d", "today", "expired 5 d ago". */
function DiasRestantes({ suscripcion }: { suscripcion: SuscripcionRow }) {
  const { t } = useI18n();
  const d = suscripcion.diasRestantes;

  if (suscripcion.estado === 'CANCELADA' || suscripcion.estado === 'REEMPLAZADA') {
    return <span className="text-text-muted">—</span>;
  }
  const tono = tonoVencimiento(d, suscripcion.estado);
  const cls = tono ? TONO_DIAS[tono] : 'text-text';
  const texto =
    d < 0
      ? t('sub.expiredAgo', { days: Math.abs(d) })
      : d === 0
        ? t('sub.endsToday')
        : t('sub.nDays', { days: d });
  return <span className={cls}>{texto}</span>;
}

function NuevaSuscripcionForm({
  instituciones,
  planes,
  onDone,
  onCancel,
}: {
  instituciones: InstitucionRow[];
  planes: PlanRow[];
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [idInstitucion, setIdInstitucion] = useState('');
  const [idPlan, setIdPlan] = useState('');
  const [dias, setDias] = useState('');
  const [compradorEmail, setCompradorEmail] = useState('');
  const [compradorNombre, setCompradorNombre] = useState('');
  const [fechaCompra, setFechaCompra] = useState(hoyISO());
  const [fechaInicio, setFechaInicio] = useState('');
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState('USD');
  const [referenciaPago, setReferenciaPago] = useState('');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const plan = planes.find((p) => String(p.idPlan) === idPlan) ?? null;

  /** al elegir plan se copian sus días y precio (el precio solo si está vacío) */
  function elegirPlan(valor: string) {
    setIdPlan(valor);
    const p = planes.find((x) => String(x.idPlan) === valor);
    if (!p) return;
    setDias(String(p.dias));
    if (p.precio != null) setMonto(String(p.precio));
    if (p.moneda) setMoneda(p.moneda);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setError(null);
    setSending(true);
    try {
      await api.post('/suscripciones', {
        idInstitucion: Number(idInstitucion),
        // o el plan del catálogo, o los días sueltos: el API acepta cualquiera
        ...(plan ? { idPlan: plan.idPlan } : { dias: Number(dias) }),
        compradorEmail: compradorEmail.trim(),
        ...(compradorNombre.trim()
          ? { compradorNombre: compradorNombre.trim() }
          : {}),
        fechaCompra,
        ...(fechaInicio ? { fechaInicio } : {}),
        ...(monto !== '' ? { monto: Number(monto) } : {}),
        ...(moneda.trim() ? { moneda: moneda.trim() } : {}),
        ...(referenciaPago.trim()
          ? { referenciaPago: referenciaPago.trim() }
          : {}),
        ...(notas.trim() ? { notas: notas.trim() } : {}),
      });
      const nombre =
        instituciones.find((i) => String(i.ID_INSTITUCION) === idInstitucion)
          ?.NOMBRE ?? '';
      onDone(t('sub.created', { name: nombre }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('err.create'));
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 rounded-2xl border border-brand/40 bg-surface p-5"
    >
      <div className="font-semibold text-text">{t('sub.newTitle')}</div>
      <p className="mt-1 text-sm text-text-2">{t('sub.newHint')}</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-text-2">
            {t('sub.institution')}
          </label>
          <select
            required
            {...propsValidacion(t('common.requiredField'))}
            value={idInstitucion}
            onChange={(e) => setIdInstitucion(e.target.value)}
            className={campoCls}
          >
            <option value="">{t('c.select')}</option>
            {instituciones.map((i) => (
              <option key={i.ID_INSTITUCION} value={i.ID_INSTITUCION}>
                {i.NOMBRE}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-2">
            {t('sub.plan')}
          </label>
          <select
            value={idPlan}
            onChange={(e) => elegirPlan(e.target.value)}
            className={campoCls}
          >
            <option value="">{t('sub.customPlan')}</option>
            {planes.map((p) => (
              <option key={p.idPlan} value={p.idPlan}>
                {p.nombre} · {t('sub.nDays', { days: p.dias })}
                {esVerdadero(p.esOnpremise) ? ` · ${t('sub.onprem')}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-2">
            {t('sub.days')}
          </label>
          <input
            type="number"
            min={1}
            required
            {...propsValidacion(t('common.requiredField'))}
            value={dias}
            onChange={(e) => setDias(e.target.value)}
            disabled={!!plan}
            className={`${campoCls} ${plan ? 'cursor-not-allowed text-text-muted' : ''}`}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-2">
            {t('sub.buyer')}
          </label>
          <input
            type="email"
            required
            {...propsValidacion(t('common.requiredField'))}
            value={compradorEmail}
            onChange={(e) => setCompradorEmail(e.target.value)}
            className={`${campoCls} normal-case`}
            placeholder={t('sub.buyerPh')}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-2">
            {t('sub.buyerName')}
          </label>
          <input
            value={compradorNombre}
            onChange={(e) => setCompradorNombre(e.target.value)}
            className={campoCls}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-2">
            {t('sub.purchased')}
          </label>
          <input
            type="date"
            required
            {...propsValidacion(t('common.requiredField'))}
            value={fechaCompra}
            onChange={(e) => setFechaCompra(e.target.value)}
            className={campoCls}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-2">
            {t('sub.start')}
          </label>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className={campoCls}
          />
          <p className="mt-1 text-xs text-text-muted">{t('sub.startHint')}</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-2">
            {t('sub.amount')}
          </label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className={campoCls}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-2">
            {t('sub.currency')}
          </label>
          <input
            maxLength={3}
            value={moneda}
            onChange={(e) => setMoneda(e.target.value)}
            className={campoCls}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-text-2">
            {t('sub.reference')}
          </label>
          <input
            maxLength={100}
            value={referenciaPago}
            onChange={(e) => setReferenciaPago(e.target.value)}
            className={campoCls}
            placeholder={t('sub.referencePh')}
          />
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <label className="mb-1 block text-sm font-medium text-text-2">
            {t('sub.notes')}
          </label>
          <textarea
            rows={2}
            maxLength={500}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className={campoCls}
          />
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={sending}
          className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {sending ? t('c.saving') : t('sub.register')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border-app px-4 py-2 text-sm text-text-2 hover:bg-surface-2"
        >
          {t('c.cancel')}
        </button>
      </div>
    </form>
  );
}

function EditarSuscripcionForm({
  suscripcion,
  onDone,
  onCancel,
}: {
  suscripcion: SuscripcionRow;
  onDone: (msg: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [fechaInicio, setFechaInicio] = useState(suscripcion.fechaInicio ?? '');
  const [fechaFin, setFechaFin] = useState(suscripcion.fechaFin ?? '');
  const [estado, setEstado] = useState<EstadoSuscripcion>(suscripcion.estado);
  const [compradorEmail, setCompradorEmail] = useState(
    (suscripcion.compradorEmail ?? '').toLowerCase(),
  );
  const [compradorNombre, setCompradorNombre] = useState(
    suscripcion.compradorNombre ?? '',
  );
  const [monto, setMonto] = useState(
    suscripcion.monto != null ? String(suscripcion.monto) : '',
  );
  const [referenciaPago, setReferenciaPago] = useState(
    suscripcion.referenciaPago ?? '',
  );
  const [notas, setNotas] = useState(suscripcion.notas ?? '');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setError(null);
    setSending(true);
    try {
      await api.patch(`/suscripciones/${suscripcion.idSuscripcion}`, {
        fechaInicio,
        fechaFin,
        estado,
        compradorEmail: compradorEmail.trim(),
        compradorNombre: compradorNombre.trim() || null,
        monto: monto !== '' ? Number(monto) : null,
        referenciaPago: referenciaPago.trim() || null,
        notas: notas.trim() || null,
      });
      onDone(t('sub.updated', { name: suscripcion.institucion }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('err.save'));
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 rounded-2xl border border-brand/40 bg-surface p-5"
    >
      <div className="font-semibold text-text">
        {t('sub.editTitle', { name: suscripcion.institucion })}
      </div>
      <p className="mt-1 text-sm text-text-2">{t('sub.editHint')}</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-text-2">
            {t('sub.start')}
          </label>
          <input
            type="date"
            required
            {...propsValidacion(t('common.requiredField'))}
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className={campoCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-2">
            {t('sub.end')}
          </label>
          <input
            type="date"
            required
            {...propsValidacion(t('common.requiredField'))}
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            className={campoCls}
          />
          <p className="mt-1 text-xs text-text-muted">{t('sub.moveHint')}</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-2">
            {t('c.state')}
          </label>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoSuscripcion)}
            className={campoCls}
          >
            {ESTADOS_SUSCRIPCION.map((s) => (
              <option key={s} value={s}>
                {etiquetaCatalogo(t, 'sub.st', s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-2">
            {t('sub.buyer')}
          </label>
          <input
            type="email"
            required
            {...propsValidacion(t('common.requiredField'))}
            value={compradorEmail}
            onChange={(e) => setCompradorEmail(e.target.value)}
            className={`${campoCls} normal-case`}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-2">
            {t('sub.buyerName')}
          </label>
          <input
            value={compradorNombre}
            onChange={(e) => setCompradorNombre(e.target.value)}
            className={campoCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-2">
            {t('sub.amount')}
          </label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className={campoCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text-2">
            {t('sub.reference')}
          </label>
          <input
            maxLength={100}
            value={referenciaPago}
            onChange={(e) => setReferenciaPago(e.target.value)}
            className={campoCls}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="mb-1 block text-sm font-medium text-text-2">
            {t('sub.notes')}
          </label>
          <textarea
            rows={2}
            maxLength={500}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className={campoCls}
          />
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={sending}
          className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {sending ? t('c.saving') : t('ld.saveChanges')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border-app px-4 py-2 text-sm text-text-2 hover:bg-surface-2"
        >
          {t('c.cancel')}
        </button>
      </div>
    </form>
  );
}
