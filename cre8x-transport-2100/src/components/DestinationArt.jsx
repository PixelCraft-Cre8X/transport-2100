// Stylised destination illustration; a lighthouse coast for Galle, a skyline elsewhere.
export default function DestinationArt({ landmark }) {
  return (
    <svg
      className="dest-art"
      viewBox="0 0 296 119"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="dest-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b5f93" />
          <stop offset="0.7" stopColor="#8ec3e6" />
          <stop offset="1" stopColor="#f3d9b6" />
        </linearGradient>
        <linearGradient id="dest-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f7fa8" />
          <stop offset="1" stopColor="#123f62" />
        </linearGradient>
      </defs>
      <rect width="296" height="119" fill="url(#dest-sky)" />
      <ellipse cx="60" cy="26" rx="34" ry="7" fill="#fff" opacity="0.55" />
      <ellipse cx="96" cy="32" rx="26" ry="5" fill="#fff" opacity="0.4" />
      <ellipse cx="238" cy="18" rx="30" ry="6" fill="#fff" opacity="0.4" />
      <rect y="70" width="296" height="49" fill="url(#dest-sea)" />
      <path
        d="M0 84c30-4 60 4 90 0s60-4 90 0 70 4 116-1"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.25"
      />
      {landmark === "lighthouse" ? (
        <>
          <path d="M108 92 132 74h92l28 18v27H108z" fill="#c9b79a" />
          <path d="M132 74h92v6h-92z" fill="#e3d4b9" />
          <path d="M120 88h132v31H120z" fill="#b9a482" />
          <path d="M168 44h20l4 38h-28z" fill="#f5f1e8" />
          <path d="M170 60h16l1 5h-18zM172 76h12l1 4h-14z" fill="#c8483c" />
          <rect x="169" y="36" width="18" height="8" fill="#2a3b4f" />
          <path d="M166 36h24l-12-12z" fill="#c8483c" />
          <rect x="176" y="52" width="4" height="7" fill="#2a3b4f" />
          <path d="M96 100c20-9 44-9 62-2l-4 21H88z" fill="#6f6250" />
          <path d="M222 96c24-6 44-4 74 6v17h-80z" fill="#6f6250" />
        </>
      ) : (
        <>
          <g fill="#173a5c">
            <rect x="40" y="52" width="26" height="40" />
            <rect x="72" y="36" width="22" height="56" />
            <rect x="100" y="58" width="30" height="34" />
            <rect x="136" y="26" width="20" height="66" />
            <rect x="162" y="48" width="28" height="44" />
            <rect x="196" y="40" width="22" height="52" />
            <rect x="224" y="60" width="32" height="32" />
          </g>
          <g fill="#f5d98a" opacity="0.8">
            <rect x="78" y="44" width="4" height="5" />
            <rect x="86" y="58" width="4" height="5" />
            <rect x="142" y="36" width="4" height="5" />
            <rect x="142" y="52" width="4" height="5" />
            <rect x="170" y="58" width="4" height="5" />
            <rect x="202" y="50" width="4" height="5" />
          </g>
          <rect x="0" y="90" width="296" height="6" fill="#0e2b47" />
        </>
      )}
    </svg>
  );
}
