'use client';

import { FormEvent, useState } from 'react';
import { api } from '@/lib/api/client';
import type { PerfilInstitucion } from '@/lib/types';

const inputCls =
  'w-full rounded-lg border border-border-app bg-surface-2 px-3 py-2 text-text outline-none focus:border-brand';
const labelCls = 'mb-1 block text-sm font-medium text-text-2';

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
  const [nombre, setNombre] = useState(perfil.NOMBRE ?? '');
  const [direccion, setDireccion] = useState(perfil.DIRECCION ?? '');
  const [ciudad, setCiudad] = useState(perfil.CIUDAD ?? '');
  const [pais, setPais] = useState(perfil.PAIS ?? '');
  const [codigoConexion, setCodigoConexion] = useState(
    perfil.CODIGO_CONEXION ?? '',
  );
  const [proveedorPago, setProveedorPago] = useState(
    perfil.PROVEEDOR_PAGO ?? '',
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

  const totalConfiguradas =
    perfil.TIENE_USUARIO_PASARELA +
    perfil.TIENE_CONTRASENA_PASARELA +
    perfil.TIENE_TOKEN_PASARELA +
    perfil.TIENE_APP_CODE_TOKENIZATION +
    perfil.TIENE_APP_KEY_TOKENIZATION +
    perfil.TIENE_APP_CODE_CHECKOUT +
    perfil.TIENE_APP_KEY_CHECKOUT;

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
        codigoConexion: codigoConexion.trim() || undefined,
        proveedorPago: proveedorPago.trim() || undefined,
        paymentEnvironment: paymentEnvironment.trim() || undefined,
        urlCodPago: urlCodPago.trim() || undefined,
        urlProcesoPago: urlProcesoPago.trim() || undefined,
        ...credenciales,
      });
      onSaved(
        Object.keys(credenciales).length
          ? 'Perfil y credenciales de pasarela actualizados'
          : 'Perfil actualizado',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-4 rounded-2xl border border-border-app bg-surface p-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      <div className="sm:col-span-2">
        <label className={labelCls}>Nombre de la institución</label>
        <input required maxLength={150} value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Código de conexión</label>
        <input maxLength={20} value={codigoConexion} onChange={(e) => setCodigoConexion(e.target.value)} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Dirección</label>
        <input maxLength={250} value={direccion} onChange={(e) => setDireccion(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Ciudad</label>
        <input maxLength={100} value={ciudad} onChange={(e) => setCiudad(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>País</label>
        <input maxLength={100} value={pais} onChange={(e) => setPais(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Proveedor de pago</label>
        <input maxLength={100} value={proveedorPago} onChange={(e) => setProveedorPago(e.target.value)} className={inputCls} placeholder="p. ej. PAYMENTEZ" />
      </div>
      <div>
        <label className={labelCls}>Ambiente de pago</label>
        <select value={paymentEnvironment} onChange={(e) => setPaymentEnvironment(e.target.value)} className={inputCls}>
          <option value="">Sin definir</option>
          <option value="stg">stg (pruebas)</option>
          <option value="prod">prod (producción)</option>
        </select>
      </div>
      <div className="sm:col-span-2 lg:col-span-1">
        <label className={labelCls}>URL código de pago</label>
        <input maxLength={500} value={urlCodPago} onChange={(e) => setUrlCodPago(e.target.value)} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>URL proceso de pago</label>
        <input maxLength={500} value={urlProcesoPago} onChange={(e) => setUrlProcesoPago(e.target.value)} className={inputCls} />
      </div>

      <div className="sm:col-span-2 lg:col-span-3">
        <button
          type="button"
          onClick={() => setVerCredenciales((v) => !v)}
          className="text-sm font-semibold text-brand hover:underline"
        >
          {verCredenciales ? '▾' : '▸'} Credenciales de pasarela (
          {totalConfiguradas} de 7 configuradas)
        </button>
        {verCredenciales && (
          <>
            <p className="mb-2 mt-2 text-xs text-text-muted">
              Por seguridad los valores guardados nunca se muestran: escribe
              solo los que quieras registrar o reemplazar y guarda.
            </p>
            <div className="grid gap-3 rounded-lg border border-border-app bg-surface-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ['usuarioPasarela', 'Usuario pasarela', perfil.TIENE_USUARIO_PASARELA],
              ['contrasenaPasarela', 'Contraseña pasarela', perfil.TIENE_CONTRASENA_PASARELA],
              ['tokenPasarela', 'Token pasarela', perfil.TIENE_TOKEN_PASARELA],
              ['appCodeTokenization', 'APP_CODE_TOKENIZATION', perfil.TIENE_APP_CODE_TOKENIZATION],
              ['appKeyTokenization', 'APP_KEY_TOKENIZATION', perfil.TIENE_APP_KEY_TOKENIZATION],
              ['appCodeCheckout', 'APP_CODE_CHECKOUT', perfil.TIENE_APP_CODE_CHECKOUT],
              ['appKeyCheckout', 'APP_KEY_CHECKOUT', perfil.TIENE_APP_KEY_CHECKOUT],
            ] as const
          ).map(([campo, etiqueta, configurada]) => (
            <div key={campo}>
              <label className={`${labelCls} flex items-center justify-between`}>
                <span>{etiqueta}</span>
                <span
                  className={`text-[10px] font-semibold ${
                    configurada ? 'text-success' : 'text-text-muted'
                  }`}
                >
                  {configurada ? '● configurada' : '○ sin configurar'}
                </span>
              </label>
              <input
                type="password"
                autoComplete="new-password"
                placeholder={
                  configurada
                    ? '•••••• (escribir solo para reemplazar)'
                    : 'Sin configurar — escribe el valor'
                }
                value={cred[campo]}
                onChange={(e) =>
                  setCred((c) => ({ ...c, [campo]: e.target.value }))
                }
                className={inputCls}
              />
            </div>
          ))}
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
          {sending ? 'Guardando…' : 'Guardar perfil'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border-app px-4 py-2 text-text-2 hover:bg-surface-2"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
