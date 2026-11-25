import type { SVGProps } from "react";

const paths = {
  dashboard: <><rect x="3.5" y="3.5" width="6" height="7" rx="1.4"/><rect x="14.5" y="3.5" width="6" height="4" rx="1.4"/><rect x="3.5" y="15.5" width="6" height="5" rx="1.4"/><rect x="14.5" y="12.5" width="6" height="8" rx="1.4"/></>,
  book: <><path d="M4 4.5h6a3 3 0 0 1 3 3v13a4 4 0 0 0-3-1.5H4V4.5Z"/><path d="M13 7.5a3 3 0 0 1 3-3h5V19h-5a4 4 0 0 0-3 1.5M7 9h3M7 12h3M16 9h2M16 12h2"/></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M7.5 3v4M16.5 3v4M3.5 10h17M7.5 14h2M14.5 14h2M7.5 17h2"/></>,
  list: <><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 3.5v17M3.5 9h17M3.5 14.5h17"/></>,
  chart: <><path d="M4 3.5v17h17M8 16v-5M13 16V6M18 16V9"/></>,
  notebook: <><path d="M6 3.5h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2ZM8 3.5v17M2.5 8H5M2.5 13H5M2.5 18H5M11.5 8.5h5M11.5 12h4"/></>,
  wallet: <><path d="M20 8V5a1.5 1.5 0 0 0-1.5-1.5h-13A2.5 2.5 0 0 0 3 6v12a2 2 0 0 0 2 2h15V8H5.5A2.5 2.5 0 0 1 3 5.5"/><path d="M20 12h-4v4h4M16.5 14h.1"/></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  arrowUp: <><path d="M6 17 18 5M6 5h12v12"/></>,
  chevron: <path d="m9 5 7 7-7 7"/>,
  down: <path d="m6 9 6 6 6-6"/>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="8.75" cy="9.5" r="1.75"/><path d="m4.5 17 4.5-5 3.5 3.5 2.5-2.5 4.5 4.5"/></>,
  link: <><path d="M10 13.5a4 4 0 0 0 5.7.3l3-3a4 4 0 0 0-5.7-5.7l-1.4 1.4"/><path d="M14 10.5a4 4 0 0 0-5.7-.3l-3 3a4 4 0 0 0 5.7 5.7l1.4-1.4"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  panel: <><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M9.5 4.5v15"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  pen: <><path d="m15.5 4.5 4 4M4 20l4.5-1 12-12a2.8 2.8 0 0 0-4-4l-12 12L4 20Z"/><path d="M13.5 20H21"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  checkCircle: <><circle cx="12" cy="12" r="8.5"/><path d="m8 12 2.5 2.5 5-5"/></>,
  info: <><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.5v.1"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/></>,
  sparkles: <><path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3ZM20 2v4M18 4h4"/></>,
  flag: <><path d="M5 21V4m0 0c5-5 9 5 15 0v10c-6 5-10-5-15 0"/></>,
  settings: <><path d="m10 3-1 3-3 1-3 3 2 2-1 3 3 3 3-1 2 2 3-1 3-3-1-3 2-2-3-3-3-1-1-3h-2Z"/><circle cx="11.5" cy="11.5" r="3"/></>,
  smile: <><circle cx="12" cy="12" r="9"/><path d="M8 14.5a4.5 4.5 0 0 0 8 0M8.5 9h.1M15.5 9h.1"/></>,
  clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></>,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
