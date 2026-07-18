import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Eliminar cuenta · ConnectHub',
  description: 'Cómo eliminar tu cuenta de ConnectHub y qué datos se borran.',
};

const CONTACTO = 'support@fourstacklabs.com';

function H({ children }: { children: ReactNode }) {
  return <h2 style={{ fontSize: 20, fontWeight: 700, margin: '32px 0 10px', color: '#1e1033' }}>{children}</h2>;
}
function P({ children }: { children: ReactNode }) {
  return <p style={{ margin: '10px 0', lineHeight: 1.7 }}>{children}</p>;
}
function LI({ children }: { children: ReactNode }) {
  return <li style={{ margin: '6px 0', lineHeight: 1.6 }}>{children}</li>;
}

export default function EliminarCuenta() {
  const asunto = encodeURIComponent('Solicitud de eliminación de cuenta ConnectHub');
  const cuerpo = encodeURIComponent(
    'Solicito eliminar mi cuenta de ConnectHub y mis datos personales.\n\nCorreo de la cuenta: \nNombre: \n',
  );
  return (
    <main style={{ minHeight: '100vh', background: '#faf7fc', color: '#25203a', padding: '48px 20px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', background: '#fff', borderRadius: 20, padding: '40px 32px', boxShadow: '0 10px 40px rgba(80,20,140,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: '#7e00dd', display: 'inline-block' }} />
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>ConnectHub</span>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: '18px 0 6px', color: '#1e1033' }}>Eliminar tu cuenta</h1>
        <p style={{ color: '#6b6480', margin: 0 }}>Solicitud de eliminación de cuenta y datos de ConnectHub</p>

        <P>
          En ConnectHub puedes eliminar tu cuenta y tus datos personales en cualquier momento. Hay dos formas de hacerlo.
        </P>

        <H>Opción 1 — Desde la app (recomendada)</H>
        <P>Si tienes la app instalada, es inmediato:</P>
        <ol>
          <LI>Abre <strong>ConnectHub</strong> e inicia sesión.</LI>
          <LI>Ve a la pestaña <strong>Perfil</strong>.</LI>
          <LI>Toca <strong>Eliminar cuenta</strong> y confirma.</LI>
        </ol>
        <P>La eliminación se aplica de inmediato y se cierra el acceso con ese correo.</P>

        <H>Opción 2 — Por correo (sin la app)</H>
        <P>
          Si no tienes la app, escríbenos desde el correo de tu cuenta a{' '}
          <a href={`mailto:${CONTACTO}?subject=${asunto}&body=${cuerpo}`} style={{ color: '#7e00dd', fontWeight: 600 }}>{CONTACTO}</a>{' '}
          con el asunto «Solicitud de eliminación de cuenta ConnectHub», indicando el correo asociado a tu cuenta.
          Verificaremos tu identidad y procesaremos la eliminación en un plazo máximo de <strong>30 días</strong>.
        </P>
        <P>
          <a
            href={`mailto:${CONTACTO}?subject=${asunto}&body=${cuerpo}`}
            style={{ display: 'inline-block', marginTop: 6, background: '#7e00dd', color: '#fff', padding: '12px 20px', borderRadius: 12, fontWeight: 700, textDecoration: 'none' }}
          >
            Solicitar eliminación por correo
          </a>
        </P>

        <H>Qué datos se eliminan</H>
        <P>Al eliminar tu cuenta borramos de forma permanente tus datos personales:</P>
        <ul>
          <LI>Correo de contacto, teléfono y foto de perfil.</LI>
          <LI>Datos de perfil (profesión, empresa, biografía, LinkedIn) y preferencias.</LI>
          <LI>Conexiones, mensajes de comunidad y chats privados.</LI>
        </ul>
        <P>Y se bloquea el acceso con ese correo.</P>

        <H>Qué se conserva (control de eventos)</H>
        <P>
          Por obligaciones contables/legales y para el <strong>control de asistencia a eventos</strong>, se conserva un
          registro de tu participación —tu nombre y los eventos en los que te inscribiste o asististe— junto con los
          registros de transacciones (pagos, entradas). Es un control interno del organizador de eventos: no se usa
          para contactarte con fines comerciales ni es visible para otros usuarios.
        </P>

        <H>Contacto</H>
        <P>
          ¿Dudas sobre la eliminación o el tratamiento de tus datos? Escríbenos a{' '}
          <a href={`mailto:${CONTACTO}`} style={{ color: '#7e00dd' }}>{CONTACTO}</a>. Consulta también nuestra{' '}
          <a href="/privacy" style={{ color: '#7e00dd' }}>Política de Privacidad</a>.
        </P>

        <p style={{ marginTop: 36, paddingTop: 16, borderTop: '1px solid #eee', color: '#9a94a8', fontSize: 13 }}>
          © {new Date().getFullYear()} ConnectHub · FourStackLabs
        </p>
      </div>
    </main>
  );
}
