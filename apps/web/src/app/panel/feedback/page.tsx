'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { descargarExcel } from '@/lib/excel';
import { useI18n } from '@/lib/i18n';
import { propsValidacion } from '@/lib/validacion';

interface FeedbackRow {
  ID_FEEDBACK: number;
  USUARIO: string;
  INSTITUCION: string | null;
  TIPO: string;
  MENSAJE: string;
  ESTADO: string;
  FECHA: string;
  RESPUESTA?: string | null;
  FECHA_RESPUESTA?: string | null;
  RESPONDIDO_POR?: string | null;
}

const TIPOS = ['SUGGESTION', 'PROBLEM', 'OTHER'] as const;
const ESTADOS = ['NEW', 'REVIEWED', 'PLANNED', 'DONE'] as const;

const ESTADO_BADGE: Record<string, string> = {
  NEW: 'bg-brand/10 text-brand',
  REVIEWED: 'bg-amber-500/10 text-amber-500',
  PLANNED: 'bg-success/10 text-success',
  DONE: 'bg-surface-2 text-text-muted',
};

export default function FeedbackPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [tipo, setTipo] = useState<string>('SUGGESTION');
  const [mensaje, setMensaje] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const cargar = useCallback(async () => {
    const qs = filtroEstado ? `?estado=${filtroEstado}` : '';
    setItems(await api.get<FeedbackRow[]>(`/feedback${qs}`));
  }, [filtroEstado]);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setError(null);
    setOk(null);
    setSending(true);
    try {
      await api.post('/feedback', { tipo, mensaje: mensaje.trim() });
      setMensaje('');
      setOk(t('fb.sent'));
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('c.error'));
    } finally {
      setSending(false);
    }
  }

  async function cambiarEstado(f: FeedbackRow, estado: string) {
    setError(null);
    try {
      await api.patch(`/feedback/${f.ID_FEEDBACK}/estado`, { estado });
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('c.error'));
    }
  }

  const inp =
    'rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-brand';

  return (
    <div>
      <h1 className="text-2xl font-bold text-text">{t('fb.title')}</h1>
      <p className="text-sm text-text-2">
        {user?.esSuper ? t('fb.subtitleSuper') : t('fb.subtitle')}
      </p>

      {!user?.esSuper && (
        <form
          onSubmit={enviar}
          className="mt-4 rounded-2xl border border-border-app bg-surface p-4"
        >
          <div className="flex flex-wrap gap-2">
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inp}>
              {TIPOS.map((x) => (
                <option key={x} value={x}>{t(`fb.type${x}`)}</option>
              ))}
            </select>
          </div>
          <textarea
            required
            minLength={5}
            maxLength={2000}
            {...propsValidacion(t('common.requiredField'))}
            rows={4}
            placeholder={t('fb.placeholder')}
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            className={`${inp} mt-2 w-full`}
          />
          <button
            disabled={sending}
            className="mt-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {sending ? t('c.saving') : t('fb.send')}
          </button>
        </form>
      )}

      {user?.esSuper && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className={inp}>
            <option value="">{t('fb.allStates')}</option>
            {ESTADOS.map((x) => (
              <option key={x} value={x}>{t(`fb.state${x}`)}</option>
            ))}
          </select>
          <button
            onClick={() =>
              void descargarExcel('feedback', [
                {
                  nombre: t('fb.title'),
                  filas: items.map((f) => ({
                    [t('aud.date')]: f.FECHA,
                    [t('aud.user')]: f.USUARIO,
                    [t('ct.fInst')]: f.INSTITUCION,
                    [t('ct.fTipo')]: t(`fb.type${f.TIPO}`),
                    [t('rep.status')]: t(`fb.state${f.ESTADO}`),
                    [t('fb.title')]: f.MENSAJE,
                    [t('fb.response')]: f.RESPUESTA ?? '',
                  })),
                },
              ])
            }
            disabled={items.length === 0}
            className="rounded-lg bg-success/15 px-4 py-2 text-sm font-semibold text-success hover:bg-success/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ⬇️ {t('c.excel')}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}
      {ok && (
        <p className="mt-4 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{ok}</p>
      )}

      <div className="mt-4 space-y-3">
        {items.map((f) => (
          <div
            key={f.ID_FEEDBACK}
            className="rounded-2xl border border-border-app bg-surface p-4"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span className={`rounded px-2 py-0.5 font-semibold ${ESTADO_BADGE[f.ESTADO] ?? ''}`}>
                {t(`fb.state${f.ESTADO}`)}
              </span>
              <span className="rounded bg-surface-2 px-2 py-0.5 font-semibold text-text-2">
                {t(`fb.type${f.TIPO}`)}
              </span>
              <span>{f.FECHA}</span>
              {user?.esSuper && (
                <span className="text-text-2">
                  {f.USUARIO}
                  {f.INSTITUCION ? ` · ${f.INSTITUCION}` : ''}
                </span>
              )}
              {user?.esSuper && (
                <select
                  value={f.ESTADO}
                  onChange={(e) => cambiarEstado(f, e.target.value)}
                  className="ml-auto rounded-lg border border-border-app bg-surface-2 px-2 py-1 text-xs text-text"
                >
                  {ESTADOS.map((x) => (
                    <option key={x} value={x}>{t(`fb.state${x}`)}</option>
                  ))}
                </select>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-text">{f.MENSAJE}</p>

            {user?.esSuper ? (
              <RespuestaEditor f={f} inp={inp} onSaved={cargar} />
            ) : (
              f.RESPUESTA && (
                <div className="mt-3 rounded-lg border border-border-app bg-surface-2 p-3">
                  <p className="text-xs font-semibold text-text-2">
                    {t('fb.response')}
                    {f.FECHA_RESPUESTA
                      ? ` · ${t('fb.respondedOn', { date: f.FECHA_RESPUESTA })}`
                      : ''}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-text">
                    {f.RESPUESTA}
                  </p>
                </div>
              )
            )}
          </div>
        ))}
        {items.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border-app bg-surface p-8 text-center text-sm text-text-muted">
            {t('fb.empty')}
          </p>
        )}
      </div>
    </div>
  );
}

function RespuestaEditor({
  f,
  inp,
  onSaved,
}: {
  f: FeedbackRow;
  inp: string;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [respuesta, setRespuesta] = useState(f.RESPUESTA ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function guardar() {
    if (saving || !respuesta.trim()) return;
    setErr(null);
    setOk(null);
    setSaving(true);
    try {
      await api.patch(`/feedback/${f.ID_FEEDBACK}/responder`, {
        respuesta: respuesta.trim(),
      });
      setOk(t('fb.responseSaved'));
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('c.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3">
      <textarea
        rows={3}
        maxLength={4000}
        placeholder={t('fb.responsePh')}
        value={respuesta}
        onChange={(e) => setRespuesta(e.target.value)}
        className={`${inp} w-full`}
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={saving || !respuesta.trim()}
          onClick={guardar}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? t('c.saving') : t('fb.respond')}
        </button>
        {f.FECHA_RESPUESTA && (
          <span className="text-xs text-text-muted">
            {t('fb.respondedOn', { date: f.FECHA_RESPUESTA })}
          </span>
        )}
      </div>
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
      {ok && <p className="mt-1 text-xs text-success">{ok}</p>}
    </div>
  );
}
