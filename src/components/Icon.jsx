const PATHS = {
  shield: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  home: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>,
  chat: <><path d="M4 5h12v8H8l-4 3z" /><path d="M20 9v8l-3-2h-6" /></>,
  map: <><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>,
  pin: <><path d="M12 21s-7-6-7-11a7 7 0 0114 0c0 5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2" />,
  up: <path d="M12 19V5M5 12l7-7 7 7" />,
  down: <path d="M12 5v14M5 12l7 7 7-7" />,
  comment: <path d="M4 5h16v11H8l-4 4z" />,
  share: <path d="M4 12v7h16v-7M12 3v12M7 8l5-5 5 5" />,
  send: <path d="M3 11l18-8-8 18-2-8z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12l5 5 9-10" />,
  pen: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></>,
  locate: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="8" /></>,
  wifiOff: <><path d="M3 3l18 18" /><path d="M8.5 12.5a8 8 0 013-1.5M5 9a15 15 0 015-2.5M19 9a15 15 0 00-4-2.3M12 18h.01" /></>,
  radar: <><circle cx="12" cy="12" r="2" /><path d="M7 7a7 7 0 000 10M17 7a7 7 0 010 10M4 4a11 11 0 000 16M20 4a11 11 0 010 16" /></>,
  msg: <><path d="M4 5h16v11H8l-4 4z" /><path d="M8 10h8" /></>,
  link: <><path d="M10 14a4 4 0 006 0l3-3a4 4 0 00-6-6l-1 1" /><path d="M14 10a4 4 0 00-6 0l-3 3a4 4 0 006 6l1-1" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>,
  bell: <><path d="M6 16V11a6 6 0 0112 0v5l2 2H4z" /><path d="M10 20a2 2 0 004 0" /></>,
  alert: <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></>,
  chevron: <path d="M9 6l6 6-6 6" />,
  flag: <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>,
  car: <><path d="M4 16v-4l2-5h12l2 5v4z" /><circle cx="7.5" cy="16.5" r="1.5" /><circle cx="16.5" cy="16.5" r="1.5" /></>,
  cross: <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" /></>,
  help: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6" /></>,
  phoneIn: <><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2" /><path d="M21 3l-6 6M15 4v5h5" /></>,
  phoneOff: <><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2" /><path d="M3 3l18 18" /></>,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  walk: <><circle cx="13" cy="4" r="2" /><path d="M10 21l2-6-3-3 1-5 4 3 3 1M9 12l-2 3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  route: <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h7a3 3 0 000-6H9a3 3 0 010-6h7" /></>,
};

export function Icon({ name, size = 20, className, style }) {
  return (
    <svg className={`ic ${className || ''}`} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={style}>
      {PATHS[name]}
    </svg>
  );
}

const STAR = 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z';

export function Stars({ value, size = 16 }) {
  return (
    <span className="stars" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((k) => (
        <svg key={k} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
          <path d={STAR} className={k <= value ? 'star on' : 'star'} />
        </svg>
      ))}
    </span>
  );
}

export function StarInput({ value, onChange }) {
  return (
    <div className="star-input" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          aria-label={`${k} out of 5`}
          onClick={() => onChange(value === k ? 0 : k)}
        >
          <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true" className={k === value ? 'pop' : ''}>
            <path d={STAR} className={k <= value ? 'star on' : 'star'} />
          </svg>
        </button>
      ))}
    </div>
  );
}

export function ScoreRing({ score, color, size = 92 }) {
  const c = 327;
  const off = score == null ? c : Math.round(c * (1 - score / 100));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
        <circle cx="60" cy="60" r="52" className="ring-track" />
        <circle cx="60" cy="60" r="52" className="ring-fill" style={{ stroke: color, strokeDashoffset: off }} />
      </svg>
      <span>{score ?? '–'}</span>
    </div>
  );
}
