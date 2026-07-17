import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de Privacidad · ConnectHub',
  description: 'Cómo ConnectHub recopila, usa y protege tus datos personales.',
};

const VIGENCIA = '17 de julio de 2026';
const CONTACTO = 'support@fourstacklabs.com';

function H({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 20, fontWeight: 700, margin: '32px 0 10px', color: '#1e1033' }}>{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: '10px 0', lineHeight: 1.7 }}>{children}</p>;
}
function LI({ children }: { children: React.ReactNode }) {
  return <li style={{ margin: '6px 0', lineHeight: 1.6 }}>{children}</li>;
}

export default function Privacy() {
  return (
    <main style={{ minHeight: '100vh', background: '#faf7fc', color: '#25203a', padding: '48px 20px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', background: '#fff', borderRadius: 20, padding: '40px 32px', boxShadow: '0 10px 40px rgba(80,20,140,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: '#7e00dd', display: 'inline-block' }} />
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>ConnectHub</span>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: '18px 0 6px', color: '#1e1033' }}>Política de Privacidad</h1>
        <p style={{ color: '#6b6480', margin: 0 }}>Última actualización: {VIGENCIA}</p>

        <P>
          Esta Política de Privacidad describe cómo <strong>ConnectHub</strong> (operada por FourStackLabs, la
          &quot;Aplicación&quot;, &quot;nosotros&quot;) recopila, usa, comparte y protege los datos personales de las
          personas que usan la aplicación móvil y los servicios asociados (los &quot;Servicios&quot;). Al usar
          ConnectHub aceptas las prácticas descritas aquí.
        </p>

        <H>1. Responsable del tratamiento</H>
        <P>
          FourStackLabs es responsable del tratamiento de los datos personales recopilados a través de ConnectHub. Para
          cualquier consulta puedes escribirnos a <a href={`mailto:${CONTACTO}`} style={{ color: '#7e00dd' }}>{CONTACTO}</a>.
        </P>

        <H>2. Datos que recopilamos</H>
        <ul>
          <LI><strong>Datos de cuenta:</strong> nombre, apellido, correo electrónico y contraseña (almacenada de forma cifrada, nunca en texto plano).</LI>
          <LI><strong>Inicio de sesión con terceros:</strong> si usas <em>Sign in with Apple</em> o Google, recibimos tu nombre y correo (o el correo privado de retransmisión que provee Apple). No accedemos a tu contraseña de Apple/Google.</LI>
          <LI><strong>Datos de perfil (opcionales):</strong> foto, teléfono, profesión, empresa, biografía, enlace de LinkedIn y preferencia de visibilidad (público/privado).</LI>
          <LI><strong>Documento de identidad:</strong> tipo y número de identificación (p. ej. cédula), requerido por la pasarela de pago para procesar compras.</LI>
          <LI><strong>Datos de eventos:</strong> instituciones y eventos a los que te vinculas, inscripciones, entradas (código QR) y asistencia.</LI>
          <LI><strong>Datos de pago:</strong> las compras se procesan mediante una pasarela de pago externa. Tus tarjetas se <em>tokenizan</em>: guardamos solo datos no sensibles (últimos 4 dígitos, marca, vencimiento) y un token; <strong>nunca almacenamos el número completo de la tarjeta</strong>.</LI>
          <LI><strong>Datos de comunidad y networking:</strong> mensajes que publicas en la comunidad de un evento, solicitudes de conexión y mensajes en chats privados.</LI>
          <LI><strong>Notificaciones:</strong> un token de notificaciones push (Expo) para enviarte avisos de eventos.</LI>
          <LI><strong>Datos técnicos:</strong> idioma, preferencias de la app y registros técnicos básicos para el funcionamiento y la seguridad.</LI>
        </ul>
        <P>No recopilamos tu ubicación GPS ni contactos del dispositivo.</P>

        <H>3. Cómo usamos tus datos</H>
        <ul>
          <LI>Crear y gestionar tu cuenta e inicio de sesión.</LI>
          <LI>Mostrarte eventos de tus instituciones, permitir inscripciones y emitir tu entrada con QR.</LI>
          <LI>Procesar pagos de eventos a través de la pasarela.</LI>
          <LI>Habilitar funciones de comunidad y networking (perfiles, conexiones, chats) según tu configuración de privacidad.</LI>
          <LI>Enviarte notificaciones y correos relacionados con tus eventos y tu cuenta.</LI>
          <LI>Garantizar la seguridad, prevenir fraude y cumplir obligaciones legales.</LI>
        </ul>

        <H>4. Cómo compartimos tus datos</H>
        <P>No vendemos tus datos personales. Los compartimos únicamente con:</P>
        <ul>
          <LI><strong>Pasarela de pago:</strong> para procesar tus compras de forma segura.</LI>
          <LI><strong>Proveedores de inicio de sesión (Apple, Google):</strong> solo para verificar tu identidad al autenticarte.</LI>
          <LI><strong>Almacenamiento de archivos:</strong> las imágenes (p. ej. tu foto de perfil) se guardan en nuestro proveedor de almacenamiento.</LI>
          <LI><strong>Servicio de notificaciones (Expo):</strong> para entregar las notificaciones push.</LI>
          <LI><strong>Las instituciones organizadoras</strong> de los eventos en los que te inscribes, para gestionar tu participación.</LI>
          <LI><strong>Autoridades</strong> cuando la ley lo exija.</LI>
        </ul>

        <H>5. Perfiles públicos y networking</H>
        <P>
          Si configuras tu perfil como <strong>público</strong>, otros asistentes del mismo evento podrán ver tu nombre,
          foto y profesión, y enviarte solicitudes de conexión. Si lo configuras como <strong>privado</strong>, tu perfil
          no aparece en las listas de participantes y no es visible salvo que aceptes una conexión. Puedes cambiar esta
          preferencia en cualquier momento desde tu perfil.
        </P>

        <H>6. Retención y eliminación de datos</H>
        <P>
          Conservamos tus datos mientras tu cuenta esté activa. Puedes <strong>eliminar tu cuenta</strong> en cualquier
          momento desde la app: <em>Perfil → Eliminar cuenta</em>. Al hacerlo, borramos de forma permanente tus datos
          personales (nombre, correo, teléfono, foto, documento de identidad, perfil, conexiones, chats, tarjetas
          guardadas y datos de comunidad) y se bloquea el acceso con ese correo. Por obligaciones contables y legales,
          los registros de transacciones (pagos, entradas, asistencia) pueden conservarse de forma <strong>anonimizada</strong>,
          sin datos que te identifiquen.
        </P>

        <H>7. Seguridad</H>
        <P>
          Aplicamos medidas técnicas y organizativas razonables para proteger tus datos: cifrado de contraseñas,
          tokenización de tarjetas, control de acceso por roles y conexiones seguras (HTTPS). Ningún sistema es 100%
          infalible, pero trabajamos para mantener tus datos protegidos.
        </P>

        <H>8. Tus derechos</H>
        <P>
          Puedes acceder, corregir o eliminar tus datos, así como oponerte o limitar su tratamiento. La mayoría de estas
          acciones están disponibles directamente en la app (editar perfil, eliminar cuenta). Para otras solicitudes,
          escríbenos a <a href={`mailto:${CONTACTO}`} style={{ color: '#7e00dd' }}>{CONTACTO}</a>.
        </P>

        <H>9. Menores de edad</H>
        <P>
          ConnectHub no está dirigida a menores de 13 años. Si crees que un menor nos ha proporcionado datos, contáctanos
          para eliminarlos.
        </P>

        <H>10. Cambios a esta política</H>
        <P>
          Podemos actualizar esta política ocasionalmente. Publicaremos la versión vigente en esta página con su fecha de
          actualización. El uso continuado de los Servicios implica la aceptación de los cambios.
        </P>

        <H>11. Contacto</H>
        <P>
          Si tienes preguntas sobre esta Política de Privacidad o sobre el tratamiento de tus datos, escríbenos a{' '}
          <a href={`mailto:${CONTACTO}`} style={{ color: '#7e00dd' }}>{CONTACTO}</a>.
        </P>

        <p style={{ marginTop: 36, paddingTop: 16, borderTop: '1px solid #eee', color: '#9a94a8', fontSize: 13 }}>
          © {new Date().getFullYear()} ConnectHub · FourStackLabs
        </p>
      </div>
    </main>
  );
}
