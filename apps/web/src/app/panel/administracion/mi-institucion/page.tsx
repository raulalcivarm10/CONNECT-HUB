'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-context';
import { ImagenNas } from '@/components/ui/imagen-nas';
import { PerfilInstitucionForm } from '@/components/instituciones/perfil-form';
import type { PerfilInstitucion } from '@/lib/types';

export default function MiInstitucionPage() {
  const { user } = useAuth();
  const [perfil, setPerfil] = useState<PerfilInstitucion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (user?.idInstitucion == null) return;
    setPerfil(
      await api.get<PerfilInstitucion>(
        `/instituciones/${user.idInstitucion}/perfil`,
      ),
    );
  }, [user?.idInstitucion]);

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [cargar]);

  if (user?.idInstitucion == null) {
    return (
      <p className="text-text-muted">
        Como superadmin gestiona los perfiles desde la página Instituciones.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <ImagenNas
          tipoEntidad="INSTITUCION"
          id={user.idInstitucion}
          tipoArchivo="PORTADA"
          uploadPath={`/instituciones/${user.idInstitucion}/logo`}
          deletePath={`/instituciones/${user.idInstitucion}/logo`}
          etiqueta="Cambiar logo"
          className="h-16 w-16"
        />
        <div>
          <h1 className="text-2xl font-bold text-text">
            {perfil?.NOMBRE ?? 'Mi institución'}
          </h1>
          <p className="text-sm text-text-2">
            Perfil de la institución — edita sus datos y guarda.
          </p>
        </div>
      </div>

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

      <div className="mt-5">
        {perfil ? (
          <PerfilInstitucionForm
            perfil={perfil}
            onSaved={(msg) => {
              setOk(msg);
              void cargar();
            }}
          />
        ) : (
          <p className="text-text-muted">Cargando…</p>
        )}
      </div>
    </div>
  );
}
