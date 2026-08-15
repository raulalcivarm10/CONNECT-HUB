'use client';

import { FormEvent, useState } from 'react';
import { api } from '@/lib/api/client';
import { useI18n } from '@/lib/i18n';
import { propsValidacion } from '@/lib/validacion';
import type { PerfilInstitucion } from '@/lib/types';

const inputCls =
  'w-full rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-text outline-none focus:border-brand';
const labelCls = 'mb-1 block text-sm font-medium text-text-2';

type CredKey =
  | 'usuarioPasarela'
  | 'contrasenaPasarela'
  | 'tokenPasarela'
  | 'appCodeTokenization'
  | 'appKeyTokenization'
  | 'appCodeCheckout'
  | 'appKeyCheckout';

/**
 * Proveedores de pago (tipos quemados). Cada uno declara los campos que pide,
 * mapeados a las columnas genéricas de credenciales que ya existen en la BD.
 * En producción solo Nuvei procesa pagos; el resto queda disponible en la UI.
 */
const PROVEEDORES: Record<
  string,
  { label: string; campos: [CredKey, string][] }
> = {
  NUVEI: {
    label: 'Nuvei',
    campos: [
      ['appCodeTokenization', 'pf.appCodeTok'],
      ['appKeyTokenization', 'pf.appKeyTok'],
      ['appCodeCheckout', 'pf.appCodeCheckout'],
      ['appKeyCheckout', 'pf.appKeyCheckout'],
      ['usuarioPasarela', 'pf.serverAppCode'],
      ['contrasenaPasarela', 'pf.serverAppKey'],
    ],
  },
  PAYPAL: {
    label: 'PayPal',
    campos: [
      ['appCodeTokenization', 'pf.clientId'],
      ['appKeyTokenization', 'pf.clientSecret'],
      ['tokenPasarela', 'pf.webhookId'],
    ],
  },
  PAYPHONE: {
    label: 'PayPhone',
    campos: [
      ['tokenPasarela', 'pf.apiToken'],
      ['usuarioPasarela', 'pf.storeId'],
    ],
  },
  STRIPE: {
    label: 'Stripe',
    campos: [
      ['appCodeTokenization', 'pf.publishableKey'],
      ['appKeyTokenization', 'pf.secretKey'],
      ['tokenPasarela', 'pf.webhookSecret'],
    ],
  },
  SQUARE: {
    label: 'Square',
    campos: [
      ['appCodeTokenization', 'pf.applicationId'],
      ['appKeyTokenization', 'pf.accessToken'],
      ['usuarioPasarela', 'pf.locationId'],
    ],
  },
  AUTHNET: {
    label: 'Authorize.Net',
    campos: [
      ['appCodeTokenization', 'pf.apiLoginId'],
      ['appKeyTokenization', 'pf.transactionKey'],
    ],
  },
};

const TIENE: Record<CredKey, keyof PerfilInstitucion> = {
  usuarioPasarela: 'TIENE_USUARIO_PASARELA',
  contrasenaPasarela: 'TIENE_CONTRASENA_PASARELA',
  tokenPasarela: 'TIENE_TOKEN_PASARELA',
  appCodeTokenization: 'TIENE_APP_CODE_TOKENIZATION',
  appKeyTokenization: 'TIENE_APP_KEY_TOKENIZATION',
  appCodeCheckout: 'TIENE_APP_CODE_CHECKOUT',
  appKeyCheckout: 'TIENE_APP_KEY_CHECKOUT',
};

/**
 * Formulario de perfil de institución. Las credenciales de pasarela son de
 * solo escritura: los campos van vacíos y solo se envían si se llenan.
 */
export function PerfilInstitucionForm({
  perfil,
  onSaved,
  onCancel,
}: {
  perfil: PerfilInstitucion;
  onSaved: (msg: string) => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const [nombre, setNombre] = useState(perfil.NOMBRE ?? '');
  const [direccion, setDireccion] = useState(perfil.DIRECCION ?? '');
  const [ciudad, setCiudad] = useState(perfil.CIUDAD ?? '');
  const [pais, setPais] = useState(perfil.PAIS ?? '');
  // Solo lectura: el código de conexión es único y lo genera el sistema.
  // Se mantiene en estado únicamente para MOSTRAR el valor, nunca se edita ni se envía.
  const [codigoConexion] = useState(perfil.CODIGO_CONEXION ?? '');
  const provInicial = (perfil.PROVEEDOR_PAGO ?? '').toUpperCase();
  const [proveedorPago, setProveedorPago] = useState(
    PROVEEDORES[provInicial] ? provInicial : 'NUVEI',
  );
  const [paymentEnvironment, setPaymentEnvironment] = useState(
    perfil.PAYMENT_ENVIROMENT ?? '',
  );
  const [urlCodPago, setUrlCodPago] = useState(perfil.URL_COD_PAGO ?? '');
  const [urlProcesoPago, setUrlProcesoPago] = useState(
    perfil.URL_PROCESO_PAGO ?? '',
  );
  const [cred, setCred] = useState({
    usuarioPasarela: '',
    contrasenaPasarela: '',
    tokenPasarela: '',
    appCodeTokenization: '',
    appKeyTokenization: '',
    appCodeCheckout: '',
    appKeyCheckout: '',
  });
  const [verCredenciales, setVerCredenciales] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const proveedor = PROVEEDORES[proveedorPago];
  const configuradasProv = proveedor.campos.filter(
    ([c]) => perfil[TIENE[c]],
  ).length;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setError(null);
    setSending(true);
    const credenciales = Object.fromEntries(
      Object.entries(cred).filter(([, v]) => v.trim() !== ''),
    );
    try {
      await api.patch(`/instituciones/${perfil.ID_INSTITUCION}`, {
        nombre: nombre.trim(),
        direccion: direccion.trim() || undefined,
        ciudad: ciudad.trim() || undefined,
        pais: pais.trim() || undefined,
        proveedorPago: proveedorPago.trim() || undefined,
        paymentEnvironment: paymentEnvironment.trim() || undefined,
        urlCodPago: urlCodPago.trim() || undefined,
        urlProcesoPago: urlProcesoPago.trim() || undefined,
        ...credenciales,
      });
      onSaved(
        Object.keys(credenciales).length ? t('pf.savedCreds') : t('pf.saved'),
      );
      // limpia los inputs write-only tras guardar
      setCred({
        usuarioPasarela: '',
        contrasenaPasarela: '',
        tokenPasarela: '',
        appCodeTokenization: '',
        appKeyTokenization: '',
        appCodeCheckout: '',
        appKeyCheckout: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('c.error'));
    } finally {
      // libera el botón siempre (en Mi institución el form no se desmonta)
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-4 rounded-2xl border border-border-app bg-surface p-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      <div className="sm:col-span-2">
        <label className={labelCls}>{t('pf.name')}</label>
        <input required maxLength={150} {...propsValidacion(t('common.requiredField'))} value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>{t('pf.connCode')}</label>
        <input
          readOnly
          maxLength={20}
          value={codigoConexion}
          className={`${inputCls} normal-case bg-surface-2 text-text-muted cursor-not-allowed`}
        />
        <p className="mt-1 text-xs text-text-muted">
          {t('pf.connCodeHint')}
        </p>
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>{t('pf.address')}</label>
        <input maxLength={250} value={direccion} onChange={(e) => setDireccion(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>{t('pf.city')}</label>
        <input maxLength={100} value={ciudad} onChange={(e) => setCiudad(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>{t('pf.country')}</label>
        <input maxLength={100} value={pais} onChange={(e) => setPais(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>{t('pf.provider')}</label>
        <select
          value={proveedorPago}
          onChange={(e) => setProveedorPago(e.target.value)}
          className={inputCls}
        >
          {Object.entries(PROVEEDORES).map(([key, p]) => (
            <option key={key} value={key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>{t('pf.environment')}</label>
        <select value={paymentEnvironment} onChange={(e) => setPaymentEnvironment(e.target.value)} className={inputCls}>
          <option value="">{t('pf.envNone')}</option>
          <option value="stg">{t('pf.envStg')}</option>
          <option value="prod">{t('pf.envProd')}</option>
        </select>
      </div>
      {proveedorPago === 'NUVEI' && (
        <>
          <div className="sm:col-span-2 lg:col-span-1">
            <label className={labelCls}>{t('pf.urlCode')}</label>
            <input maxLength={500} value={urlCodPago} onChange={(e) => setUrlCodPago(e.target.value)} className={`${inputCls} normal-case`} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>{t('pf.urlProcess')}</label>
            <input maxLength={500} value={urlProcesoPago} onChange={(e) => setUrlProcesoPago(e.target.value)} className={`${inputCls} normal-case`} />
          </div>
        </>
      )}

      <div className="sm:col-span-2 lg:col-span-3">
        <button
          type="button"
          onClick={() => setVerCredenciales((v) => !v)}
          className="text-sm font-semibold text-brand hover:underline"
        >
          {verCredenciales ? '▾' : '▸'}{' '}
          {t('pf.creds', {
            prov: proveedor.label,
            n: configuradasProv,
            total: proveedor.campos.length,
          })}
        </button>
        {verCredenciales && (
          <>
            <p className="mb-2 mt-2 text-xs text-text-muted">
              {t(`pf.note${proveedorPago}`)} {t('pf.credsHint')}
            </p>
            <div className="grid gap-3 rounded-lg border border-border-app bg-surface-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {proveedor.campos.map(([campo, etiqueta]) => {
                const configurada = !!perfil[TIENE[campo]];
                return (
                  <div key={campo}>
                    <label className={`${labelCls} flex items-center justify-between`}>
                      <span>{t(etiqueta)}</span>
                      <span
                        className={`text-[10px] font-semibold ${
                          configurada ? 'text-success' : 'text-text-muted'
                        }`}
                      >
                        {configurada ? t('pf.configured') : t('pf.notConfigured')}
                      </span>
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      placeholder={
                        configurada ? t('pf.replacePh') : t('pf.setPh')
                      }
                      value={cred[campo]}
                      onChange={(e) =>
                        setCred((c) => ({ ...c, [campo]: e.target.value }))
                      }
                      className={inputCls}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger sm:col-span-2 lg:col-span-3">
          {error}
        </p>
      )}

      <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
        <button
          type="submit"
          disabled={sending}
          className="rounded-lg bg-brand px-5 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {sending ? t('c.saving') : t('pf.saveProfile')}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border-app px-4 py-2 text-text-2 hover:bg-surface-2"
          >
            {t('c.cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
