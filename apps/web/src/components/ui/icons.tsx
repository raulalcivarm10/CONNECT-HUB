import type { ComponentType, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const IconHome = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M9 21v-6h6v6" />
  </svg>
);

export const IconUsers = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <path d="M16 8.2a3 3 0 0 1 0 5.6" />
    <path d="M17 20a5.5 5.5 0 0 0-2.5-4.6" />
  </svg>
);

export const IconBuilding = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="4" y="3" width="12" height="18" rx="1" />
    <path d="M16 8h4v13H4" />
    <path d="M8 7h1M12 7h1M8 11h1M12 11h1M8 15h1M12 15h1" />
  </svg>
);

export const IconFinance = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M3 3v18h18" />
    <path d="M7 15l3.5-4 3 3L21 7" />
  </svg>
);

export const IconVenue = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M3 21V9l9-6 9 6v12" />
    <path d="M3 21h18" />
    <rect x="9" y="13" width="6" height="8" />
  </svg>
);

export const IconCalendar = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="3" y="4.5" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 3v3M16 3v3" />
    <path d="M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2" />
  </svg>
);

export const IconTicket = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4 2 2 0 0 1 0-4Z" />
    <path d="M14 6v12" strokeDasharray="2 2" />
  </svg>
);

export const IconBuildingProfile = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M6 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
    <path d="M4 21h16" />
    <path d="M9 7h1M13 7h1M9 11h1M13 11h1M10 21v-4h3v4" />
  </svg>
);

export const IconChart = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M3 3v18h18" />
    <rect x="7" y="11" width="3" height="6" />
    <rect x="12" y="7" width="3" height="10" />
    <rect x="17" y="13" width="3" height="4" />
  </svg>
);

export const MODULE_ICONS: Record<string, ComponentType<IconProps>> = {
  administracion: IconUsers,
  financiero: IconFinance,
  operativa: IconVenue,
  eventos: IconTicket,
};
