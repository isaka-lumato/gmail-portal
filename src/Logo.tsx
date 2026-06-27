/*
  LumatoTech "Restricted Email" mark.
  A keyed envelope: the envelope flap lines converge into a keyhole,
  signalling mail that only opens for one trusted key. The bright
  center point nods to "Lumato" (light).
*/
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="Restricted Email"
    >
      {/* envelope body */}
      <rect
        x="2.5"
        y="4.5"
        width="19"
        height="15"
        rx="3.2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      {/* flap lines converging toward the keyhole */}
      <path
        d="M3.4 5.6 L12 11.4 L20.6 5.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />
      {/* keyhole — restricted access */}
      <circle cx="12" cy="12.4" r="2.1" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 14.3 L12 16.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* light point */}
      <circle cx="12" cy="12.4" r="0.7" fill="currentColor" />
    </svg>
  );
}
