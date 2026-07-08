'use client';

import { useI18n } from '@/lib/i18n';

/**
 * Panel ilustrado del login: escena animada del dominio CONNECT-HUB
 * (reservar espacios, publicar eventos, entradas QR). Todo CSS/SVG,
 * sin binarios.
 */
export function LoginArt() {
  const { t } = useI18n();
  return (
    <div className="relative hidden overflow-hidden bg-gradient-to-br from-violet-700 via-purple-700 to-indigo-900 lg:flex lg:w-1/2 lg:flex-col lg:justify-between">
      {/* blobs de fondo */}
      <div className="anim-blob absolute -left-24 -top-24 h-96 w-96 rounded-full bg-fuchsia-500/30 blur-3xl" />
      <div
        className="anim-blob absolute -bottom-32 -right-20 h-[28rem] w-[28rem] rounded-full bg-indigo-400/25 blur-3xl"
        style={{ animationDelay: '-8s' }}
      />
      <div className="anim-pulse absolute right-1/3 top-1/4 h-40 w-40 rounded-full bg-purple-300/20 blur-2xl" />

      {/* marca */}
      <div className="relative z-10 p-10">
        <div className="text-sm font-bold uppercase tracking-[0.3em] text-white/80">
          Connect-Hub
        </div>
      </div>

      {/* escena flotante */}
      <div className="relative z-10 mx-auto h-80 w-full max-w-md">
        {/* tarjeta calendario */}
        <div
          className="anim-float absolute left-4 top-0 w-56 rounded-2xl border border-white/20 bg-white/10 p-4 shadow-2xl backdrop-blur-md"
          style={{ ['--tilt' as string]: '-4deg' }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/70">
              September
            </span>
            <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-bold text-white">
              TODAY
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 21 }).map((_, i) => (
              <div
                key={i}
                className={`h-4 rounded ${
                  i === 9
                    ? 'bg-fuchsia-400'
                    : i === 12 || i === 17
                      ? 'bg-white/50'
                      : 'bg-white/15'
                }`}
              />
            ))}
          </div>
          <div className="mt-3 rounded-lg bg-white/15 px-2 py-1.5 text-xs text-white">
            📅 Innovation Summit · 09:00
          </div>
        </div>

        {/* ticket */}
        <div
          className="anim-float-fast absolute right-0 top-14 w-52 rounded-2xl border border-white/20 bg-white/10 shadow-2xl backdrop-blur-md"
          style={{ ['--tilt' as string]: '5deg' }}
        >
          <div className="border-b border-dashed border-white/30 p-3">
            <div className="text-[10px] uppercase tracking-widest text-white/60">
              Ticket
            </div>
            <div className="text-sm font-bold text-white">
              Electronic Concert
            </div>
          </div>
          <div className="flex items-center justify-between p-3">
            <div className="text-xs text-white/70">
              Regent Hall
              <br />
              A + B
            </div>
            <div className="font-mono text-lg font-bold text-white">
              #0042
            </div>
          </div>
        </div>

        {/* QR con línea de escaneo */}
        <div
          className="anim-float-slow absolute bottom-0 left-16 rounded-2xl border border-white/20 bg-white/10 p-3 shadow-2xl backdrop-blur-md"
          style={{ ['--tilt' as string]: '3deg' }}
        >
          <div className="relative grid grid-cols-5 gap-1 overflow-hidden rounded-md bg-white p-2">
            {[
              1, 1, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1,
              0, 1, 1, 1,
            ].map((v, i) => (
              <div
                key={i}
                className={`h-2.5 w-2.5 rounded-[2px] ${v ? 'bg-indigo-900' : 'bg-white'}`}
              />
            ))}
            <div className="anim-scan absolute inset-x-1 top-1/2 h-0.5 rounded bg-fuchsia-500 shadow-[0_0_8px_2px_rgba(217,70,239,0.7)]" />
          </div>
          <div className="mt-2 text-center text-[10px] font-semibold uppercase tracking-widest text-white/70">
            Check-in
          </div>
        </div>

        {/* pin de ubicación */}
        <div
          className="anim-float absolute bottom-16 right-10 flex items-center gap-2 rounded-full border border-white/20 bg-white/10 py-1.5 pl-2 pr-4 shadow-xl backdrop-blur-md"
          style={{ ['--tilt' as string]: '0deg', animationDelay: '-2s' }}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-fuchsia-500 text-sm">
            📍
          </span>
          <span className="text-xs font-semibold text-white">
            Downtown Venue · Regent Hall
          </span>
        </div>
      </div>

      {/* mensaje */}
      <div className="relative z-10 p-10">
        <h2 className="text-3xl font-bold leading-tight text-white">
          {t('login.headline')}
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/75">
          {t('login.tagline')}
        </p>
        <div className="mt-4 flex gap-1.5">
          <span className="h-1.5 w-8 rounded-full bg-fuchsia-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
        </div>
      </div>
    </div>
  );
}
