'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import { useInstitucionFiltro } from '@/lib/institucion-context';
import { useI18n } from '@/lib/i18n';
import { propsValidacion } from '@/lib/validacion';
import type { EventoRow, LocalRow, SalonRow } from '@/lib/types';

const hoy = new Date();

export default function ReservasPage() {
  const { t } = useI18n();
  const { qs, nombreFiltro } = useInstitucionFiltro();
  const [locales, setLocales] = useState<LocalRow[]>([]);
  const [salones, setSalones] = useState<SalonRow[]>([]);
  const [idLocal, setIdLocal] = useState('');
  const [idSalon, setIdSalon] = useState('');
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth()); // 0-11
  const [eventos, setEventos] = useState<EventoRow[]>([]);
  const [dia, setDia] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setEventos(await api.get<EventoRow[]>(`/eventos${qs}`));
  }, [qs]);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
    api.get<LocalRow[]>(`/locales${qs}`).then(setLocales).catch(() => undefined);
  }, [cargar, qs]);

  useEffect(() => {
    setIdSalon('');
    if (!idLocal) return setSalones([]);
    api
      .get<SalonRow[]>(`/locales/${idLocal}/salones`)
      .then(setSalones)
      .catch(() => setSalones([]));
  }, [idLocal]);

  const delEspacio = useCallback(
    (e: EventoRow) => {
      if (idLocal && String(e.ID_LOCAL) !== idLocal) return false;
      if (idSalon && String(e.ID_SALON ?? '') !== idSalon) return false;
      return true;
    },
    [idLocal, idSalon],
  );

  const porDia = useMemo(() => {
    const m: Record<string, EventoRow[]> = {};
    const prefijo = `${anio}-${String(mes + 1).padStart(2, '0')}`;
    for (const e of eventos) {
      if (!delEspacio(e)) continue;
      // Un evento multi-día ocupa TODOS sus días reales (EVENTO_HORAS), no solo
      // FECHA_EVENTO — igual que el calendario. Si no, sus otros días se ven
      // "libres" e invitan a dobles reservas.
      const dias = (e.DIAS ? e.DIAS.split(',') : [e.FECHA_EVENTO ?? '']).filter(Boolean);
      for (const d of dias) {
        const f = d.slice(0, 10);
        if (!f.startsWith(prefijo)) continue;
        (m[f] ??= []).push(e);
      }
    }
    return m;
  }, [eventos, anio, mes, delEspacio]);

  const primerDia = new Date(anio, mes, 1);
  const diasMes = new Date(anio, mes + 1, 0).getDate();
  const offset = (primerDia.getDay() + 6) % 7; // lunes = 0
  const celdas: (string | null)[] = [
    ...Array<null>(offset).fill(null),
    ...Array.from({ length: diasMes }, (_, i) =>
      `${anio}-${String(mes + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
    ),
  ];
  const mesLabel = new Date(anio, mes, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  function cambiarMes(d: number) {
    const x = new Date(anio, mes + d, 1);
    setAnio(x.getFullYear());
    setMes(x.getMonth());
    setDia(null);
  }

  const sel = 'rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-sm text-text';

  return (
    <div>
      <h1 className="text-2xl font-bold text-text">{t('rsv.title')}</h1>
      <p className="text-sm text-text-2">
        {nombreFiltro ? t('us.filtering', { name: nombreFiltro }) : t('rsv.subtitle')}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select value={idLocal} onChange={(e) => setIdLocal(e.target.value)} className={sel}>
          <option value="">{t('rsv.venue')}</option>
          {locales.map((l) => (
            <option key={l.ID_LOCAL} value={l.ID_LOCAL}>{l.NOMBRE}</option>
          ))}
        </select>
        <select value={idSalon} onChange={(e) => setIdSalon(e.target.value)} className={sel} disabled={!idLocal}>
          <option value="">{t('rsv.all')}</option>
          {salones.map((s) => (
            <option key={s.ID_SALON} value={s.ID_SALON}>{s.NOMBRE}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => cambiarMes(-1)} className={sel}>‹</button>
          <span className="min-w-40 text-center text-sm font-semibold capitalize text-text">{mesLabel}</span>
          <button onClick={() => cambiarMes(1)} className={sel}>›</button>
        </div>
      </div>

      {error && <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {ok && <p className="mt-4 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{ok}</p>}

      <div className="mt-4 grid grid-cols-7 gap-1 rounded-2xl border border-border-app bg-surface p-3">
        {celdas.map((f, i) =>
          f === null ? (
            <div key={`x${i}`} />
          ) : (
            <button
              key={f}
              onClick={() => setDia(dia === f ? null : f)}
              className={`min-h-16 rounded-lg border p-1 text-left align-top text-xs transition ${
                dia === f ? 'border-brand bg-brand/10' : 'border-border-app/60 hover:bg-surface-2'
              }`}
            >
              <div className="font-semibold text-text-2">{Number(f.slice(8))}</div>
              {(porDia[f] ?? []).slice(0, 3).map((e) => (
                <div
                  key={e.ID_EVENTO}
                  className={`mt-0.5 truncate rounded px-1 text-[10px] font-semibold ${
                    e.NO_PUBLICAR === 'S' ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success'
                  }`}
                >
                  {e.HORA_INICIO} {e.TITULO}
                </div>
              ))}
              {(porDia[f]?.length ?? 0) > 3 && (
                <div className="text-[10px] text-text-muted">+{porDia[f].length - 3}</div>
              )}
            </button>
          ),
        )}
      </div>

      <div className="mt-3 flex gap-4 text-xs text-text-2">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-success" />{t('ev.title')}</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-danger" />{t('rsv.private')}</span>
      </div>

      {dia && (
        <DiaPanel
          fecha={dia}
          eventos={porDia[dia] ?? []}
          idLocal={idLocal}
          idSalon={idSalon}
          onHecho={(msg) => {
            setOk(msg);
            void cargar();
          }}
        />
      )}
    </div>
  );
}

function DiaPanel({
  fecha,
  eventos,
  idLocal,
  idSalon,
  onHecho,
}: {
  fecha: string;
  eventos: EventoRow[];
  idLocal: string;
  idSalon: string;
  onHecho: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [titulo, setTitulo] = useState('');
  const [horaInicio, setHoraInicio] = useState('09:00');
  const [horaFin, setHoraFin] = useState('12:00');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function reservar(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setError(null);
    if (!idLocal) return setError(t('rsv.pick'));
    setSending(true);
    try {
      // CreateEventoDto exige `dias: DiaDto[]` (fecha/horaInicio/horaFin por día);
      // el body plano anterior (fechaEvento/horaInicio/horaFin) devolvía 400 siempre.
      await api.post('/eventos', {
        titulo: titulo.trim(),
        dias: [{ fecha, horaInicio, horaFin }],
        idLocal: Number(idLocal),
        ...(idSalon ? { idSalon: Number(idSalon) } : {}),
        noPublicar: true,
      });
      setTitulo('');
      onHecho(t('rsv.created', { date: fecha }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSending(false);
    }
  }

  const inp = 'rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-sm text-text';
  return (
    <div className="mt-4 rounded-2xl border border-border-app bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold text-text">{fecha}</div>
        <Link
          href={`/panel/eventos?nuevo=${fecha}`}
          className="rounded-lg border border-border-app px-3 py-1.5 text-xs text-text-2 hover:bg-surface-2"
        >
          {t('rsv.fullEvent')}
        </Link>
      </div>
      <div className="mt-2 space-y-1">
        {eventos.map((e) => (
          <div key={e.ID_EVENTO} className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
              e.NO_PUBLICAR === 'S' ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'
            }`}>
              {e.NO_PUBLICAR === 'S' ? t('rsv.private') : t('ev.title')}
            </span>
            <span className="text-text-2">{e.HORA_INICIO}–{e.HORA_FIN}</span>
            <span className="text-text">{e.TITULO}</span>
            <span className="text-xs text-text-muted">{[e.LOCAL_NOMBRE, e.SALON_NOMBRE].filter(Boolean).join(' · ')}</span>
          </div>
        ))}
        {eventos.length === 0 && <p className="text-sm text-success">{t('rsv.free')}</p>}
      </div>
      <form onSubmit={reservar} className="mt-3 flex flex-wrap items-end gap-2 border-t border-border-app pt-3">
        <input required {...propsValidacion(t('common.requiredField'))} placeholder={t('rsv.name')} value={titulo} onChange={(e) => setTitulo(e.target.value)} className={`${inp} min-w-56 flex-1`} />
        <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className={inp} title={t('rsv.start')} />
        <input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className={inp} title={t('rsv.end')} />
        <button disabled={sending} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {sending ? t('c.saving') : t('rsv.reserve')}
        </button>
        {error && <p className="w-full rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      </form>
    </div>
  );
}
