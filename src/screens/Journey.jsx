import { useState } from 'react';
import { Icon } from '../components/Icon.jsx';
import { load, save } from '../lib/device.js';
import { timeAgo } from '../lib/format.js';

export const clock = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

const RING = 2 * Math.PI * 88;

export default function Journey({ j, loc, contacts, onTab, onPickLocation }) {
  const [dest, setDest] = useState(() => load('sakhi.lastDest', ''));
  const [ride, setRide] = useState({ service: '', vehicle: '', driver: '' });
  const [showRide, setShowRide] = useState(false);
  const { journey, left, overdue, busy, lastSync, serverSms, timeoutMs } = j;
  const windowText = timeoutMs >= 60000 ? `${Math.round(timeoutMs / 60000)} minutes` : `${Math.round(timeoutMs / 1000)} seconds`;

  async function start(e) {
    e.preventDefault();
    const d = dest.trim();
    if (!d) return;
    save('sakhi.lastDest', d);
    const r = showRide ? Object.fromEntries(Object.entries(ride).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)) : {};
    await j.start(d, r);
  }

  if (!journey) {
    return (
      <div className="screen">
        <h1 className="h1 fade-up">Journey</h1>
        <form className="card col gap12 fade-up" style={{ animationDelay: '.05s' }} onSubmit={start}>
          <label className="label" htmlFor="dest">Where are you going?</label>
          <input id="dest" className="input strong" value={dest} onChange={(e) => setDest(e.target.value)} placeholder="Home, PG, office…" maxLength={80} required />
          <span className="muted small">
            {contacts.length ? `${contacts.map((c) => c.name).join(', ')} will be alerted if something goes wrong.` : 'No trusted contacts yet.'}{' '}
            <button type="button" className="link-btn" onClick={() => onTab('settings')}>{contacts.length ? 'Edit' : 'Add them'}</button>
          </span>
          {!showRide ? (
            <button type="button" className="ride-toggle" onClick={() => setShowRide(true)}>
              <Icon name="car" size={18} /> Taking a cab or auto? Add ride details
            </button>
          ) : (
            <div className="ride-box col gap8 fade-up">
              <div className="row between">
                <span className="label">Ride details (go out with any SOS)</span>
                <button type="button" className="link-btn" onClick={() => setShowRide(false)}>Remove</button>
              </div>
              <div className="wrap gap6">
                {['Uber', 'Ola', 'Rapido', 'Auto', 'Taxi'].map((s) => (
                  <button type="button" key={s} className={ride.service === s ? 'chip sm on' : 'chip sm'} aria-pressed={ride.service === s} onClick={() => setRide((r) => ({ ...r, service: r.service === s ? '' : s }))}>{s}</button>
                ))}
              </div>
              <label className="sr-only" htmlFor="ride-vehicle">Vehicle number</label>
              <input id="ride-vehicle" className="input plate" placeholder="Vehicle number, e.g. KA 01 AB 1234" value={ride.vehicle} maxLength={16}
                onChange={(e) => { const v = e.target.value.toUpperCase(); setRide((r) => ({ ...r, vehicle: v })); }} />
              <label className="sr-only" htmlFor="ride-driver">Driver name</label>
              <input id="ride-driver" className="input" placeholder="Driver name (optional)" value={ride.driver} maxLength={40}
                onChange={(e) => { const v = e.target.value; setRide((r) => ({ ...r, driver: v })); }} />
            </div>
          )}
          {!loc && (
            <div className="banner warn small">
              <span className="grow">We need your location to start.</span>
              <button type="button" className="btn white xs" onClick={onPickLocation}>Pin it</button>
            </div>
          )}
          <button className="btn primary lg" disabled={busy || !loc || !dest.trim()}>{busy ? 'Starting…' : 'Start journey'}</button>
        </form>

        <div className="card col gap14 fade-up" style={{ animationDelay: '.1s' }}>
          <h2 className="h3">How it keeps you safe</h2>
          {[
            ['clock', `Check in every ${windowText}`, 'We remind you a minute before. One tap on "I\'m safe" restarts the timer.'],
            ['shield', 'Miss it, and SOS goes out by itself', 'Even if your phone is switched off or the battery dies. Sakhi\'s server notices the silence.'],
            ['radar', 'Your people get your last location', 'Contacts are texted, and Sakhi users within 200 m are alerted.'],
          ].map(([icon, t, d]) => (
            <div key={t} className="row gap12 how">
              <span className="icon-badge"><Icon name={icon} /></span>
              <div><b>{t}</b><div className="muted small">{d}</div></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const total = journey.timeoutMs;
  const frac = Math.max(0, Math.min(1, left / total));
  const tone = overdue || frac < 0.1 ? 'danger' : frac < 0.3 ? 'warn' : 'ok';

  return (
    <div className="screen">
      <header className="row between fade-up">
        <h1 className="h1">Journey</h1>
        <span className="loc-chip"><span className="dot live blink" />Live</span>
      </header>

      <section className="journey-hero pop">
        <span className="breathe hero-glow" aria-hidden="true" />
        <p className="small soft">Heading to</p>
        <h2 className="h2 light-text">{journey.dest}</h2>
        <p className="small soft">Started {timeAgo(journey.startedAt)}{lastSync ? ` · synced ${timeAgo(lastSync)}` : ''}</p>
        {(journey.ride?.vehicle || journey.ride?.driver) && (
          <p className="ride-line"><Icon name="car" size={16} /> {[journey.ride.service, journey.ride.vehicle, journey.ride.driver].filter(Boolean).join(' · ')}</p>
        )}
      </section>

      <section className={`card col center gap12 countdown-card ${tone} fade-up`} style={{ animationDelay: '.05s' }}>
        <div className="jring">
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <circle cx="100" cy="100" r="88" className="jring-track" />
            <circle cx="100" cy="100" r="88" className="jring-fill" style={{ strokeDasharray: RING, strokeDashoffset: RING * (1 - frac) }} />
          </svg>
          <div className="jring-label" role="timer" aria-live="off">
            <span className="small muted">{overdue ? 'Sending SOS' : 'Check in within'}</span>
            <strong>{overdue ? '00:00' : clock(left)}</strong>
          </div>
        </div>
        {tone !== 'ok' && !overdue && <p className="banner warn small pop">Are you OK? Tap "I'm safe" or an SOS goes out.</p>}
        <button className="btn safe lg block" onClick={j.checkIn} disabled={busy}>
          <Icon name="check" size={20} /> I'm safe
        </button>
        <p className="muted xsmall">
          If your phone goes quiet, the SOS goes out anyway.{' '}
          {serverSms ? 'Sakhi will text your contacts.' : 'Server SMS isn\'t set up, so only nearby users and the SOS screen are alerted.'}
        </p>
      </section>

      <button className="btn ghost" onClick={() => { if (window.confirm('End this journey? Automatic SOS will stop.')) j.end(); }} disabled={busy}>
        I've arrived, end journey
      </button>
    </div>
  );
}

export function JourneyPill({ j, onOpen }) {
  const { journey, left, overdue } = j;
  if (!journey || journey.status !== 'active') return null;
  const urgent = overdue || left < 60000;
  return (
    <div className={urgent ? 'journey-pill urgent drop-up' : 'journey-pill drop-up'}>
      <button className="grow row gap8 pill-main" onClick={onOpen}>
        <span className="dot live blink" />
        <span className="ellipsis">To {journey.dest}</span>
        <b className="mono">{overdue ? '00:00' : clock(left)}</b>
      </button>
      <button className="btn safe xs" onClick={j.checkIn}>I'm safe</button>
    </div>
  );
}
