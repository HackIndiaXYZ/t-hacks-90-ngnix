import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, qs } from '../lib/api.js';
import { distanceLabel, durationLabel } from '../lib/format.js';
import { Icon } from '../components/Icon.jsx';

const HELPLINES = [
  { num: '112', name: 'Emergency', sub: 'Police, fire, ambulance', red: true },
  { num: '1091', name: 'Women helpline', sub: 'Police, 24×7' },
  { num: '181', name: 'Women helpline', sub: 'Abuse and counselling' },
  { num: '100', name: 'Police', sub: 'Direct line' },
  { num: '108', name: 'Ambulance', sub: 'Medical emergency' },
  { num: '1930', name: 'Cyber crime', sub: 'Online harassment, fraud' },
];

const DELAYS = [[0, 'Now'], [30, 'In 30 s'], [120, 'In 2 min']];

function RouteSheet({ from, place, onClose }) {
  const el = useRef(null);
  const [route, setRoute] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ctl = new AbortController();
    api(`/route?${qs({ from: `${from.lat},${from.lng}`, to: `${place.lat},${place.lng}` })}`, { signal: ctl.signal })
      .then(setRoute)
      .catch((e) => e.name !== 'AbortError' && setError(e.message));
    return () => ctl.abort();
  }, [from.lat, from.lng, place.lat, place.lng]);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(m);
    const a = [from.lat, from.lng];
    const b = [place.lat, place.lng];
    L.circleMarker(a, { radius: 8, color: '#fff', weight: 3, fillColor: '#3B1F5C', fillOpacity: 1 }).addTo(m);
    L.circleMarker(b, { radius: 9, color: '#fff', weight: 3, fillColor: place.kind === 'police' ? '#14365E' : '#C62E33', fillOpacity: 1 }).addTo(m);
    let line = null;
    if (route) line = L.polyline(route.line, { color: '#3B1F5C', weight: 5, opacity: 0.85 }).addTo(m);
    m.fitBounds(line ? line.getBounds() : L.latLngBounds([a, b]), { padding: [30, 30] });
    return () => m.remove();
  }, [route, from.lat, from.lng, place]);

  return (
    <div className="sheet-backdrop dim-in" onClick={onClose}>
      <div className="sheet sheet-in" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Route to ${place.name}`}>
        <span className="grabber" aria-hidden="true" />
        <div className="row between">
          <div className="min0">
            <h2 className="h3">{place.name}</h2>
            <p className="muted small">
              {route ? `${durationLabel(route.duration)} walk · ${distanceLabel(route.distance)}` : error ? 'Could not load a walking route' : 'Finding a walking route…'}
            </p>
          </div>
          <button className="round-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        <div ref={el} className="route-map" />
        <div className="row gap8">
          {place.phone && <a className="btn safe grow" href={`tel:${place.phone.replace(/[^\d+]/g, '')}`}><Icon name="phone" size={16} /> Call</a>}
          <a className="btn primary grow" href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&travelmode=walking`} target="_blank" rel="noreferrer">
            <Icon name="send" size={16} /> Open in Maps
          </a>
        </div>
        <p className="muted xsmall">Route © OpenStreetMap contributors, OSRM. Check the route with your own judgement at night.</p>
      </div>
    </div>
  );
}

export default function Help({ loc, online, caller, onFakeCall, fakeCallAt, onCancelFakeCall, onPickLocation }) {
  const [kind, setKind] = useState('police');
  const [places, setPlaces] = useState(null);
  const [error, setError] = useState(null);
  const [slow, setSlow] = useState(false);
  const [route, setRoute] = useState(null);
  const [now, setNow] = useState(Date.now());

  const load = () => {
    if (!loc) return;
    setError(null);
    setPlaces(null);
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), 4000);
    api(`/help/nearby?${qs({ lat: loc.lat, lng: loc.lng, radius: 5000 })}`)
      .then((r) => setPlaces(r.places))
      .catch((e) => setError(e.message))
      .finally(() => clearTimeout(slowTimer));
  };
  useEffect(load, [loc?.lat?.toFixed(3), loc?.lng?.toFixed(3)]);

  useEffect(() => {
    if (!fakeCallAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [fakeCallAt]);

  const list = (places || []).filter((p) => p.kind === kind).sort((a, b) => (b.women - a.women) || a.distance - b.distance);

  return (
    <div className="screen">
      <h1 className="h1 fade-up">Help near you</h1>

      <section className="fade-up" style={{ animationDelay: '.03s' }}>
        <h2 className="eyebrow">Helplines · work without internet</h2>
        <div className="helpline-grid">
          {HELPLINES.map((h) => (
            <a key={h.num} className={h.red ? 'helpline red' : 'helpline'} href={`tel:${h.num}`}>
              <strong>{h.num}</strong>
              <span className="small">{h.name}</span>
              <span className="xsmall muted">{h.sub}</span>
            </a>
          ))}
        </div>
      </section>

      <section className="card col gap12 fade-up" style={{ animationDelay: '.06s' }}>
        <div className="row gap12">
          <span className="icon-badge"><Icon name="phoneIn" /></span>
          <div className="grow">
            <b>Need a way out?</b>
            <div className="muted small">Get a realistic call from “{caller}” so you can leave politely.</div>
          </div>
        </div>
        {fakeCallAt ? (
          <div className="banner brand">
            <span className="grow">Call coming in {Math.max(0, Math.ceil((fakeCallAt - now) / 1000))} s</span>
            <button className="btn white xs" onClick={onCancelFakeCall}>Cancel</button>
          </div>
        ) : (
          <div className="seg">
            {DELAYS.map(([s, label]) => (
              <button key={s} onClick={() => onFakeCall(s)}>{label}</button>
            ))}
          </div>
        )}
      </section>

      <section className="col gap10 fade-up" style={{ animationDelay: '.09s' }}>
        <div className="row between">
          <h2 className="eyebrow" style={{ margin: 0 }}>Nearest to you</h2>
          {places && <button className="link-btn" onClick={load}>Refresh</button>}
        </div>
        <div className="seg">
          <button className={kind === 'police' ? 'on' : ''} aria-pressed={kind === 'police'} onClick={() => setKind('police')}>Police</button>
          <button className={kind === 'hospital' ? 'on' : ''} aria-pressed={kind === 'hospital'} onClick={() => setKind('hospital')}>Hospitals</button>
        </div>

        {!loc && (
          <div className="banner warn">
            <span className="grow">Set your location to find the nearest help.</span>
            <button className="btn white xs" onClick={onPickLocation}>Pin it</button>
          </div>
        )}
        {loc && !online && <div className="banner warn">You are offline. Call a helpline above.</div>}
        {loc && online && !places && !error && (
          <div className="card col center gap10">
            <span className="spinner" />
            <span className="muted small">{slow ? 'Searching OpenStreetMap. The first search in an area can take up to 20 seconds.' : 'Finding help near you…'}</span>
          </div>
        )}
        {error && (
          <div className="banner warn">
            <span className="grow">{error}</span>
            <button className="btn white xs" onClick={load}>Retry</button>
          </div>
        )}
        {places && list.length === 0 && <div className="empty"><p>No {kind === 'police' ? 'police stations' : 'hospitals'} found within 5 km on OpenStreetMap.</p></div>}

        {list.slice(0, 10).map((p, i) => (
          <div key={p.id} className="place fade-up" style={{ animationDelay: `${Math.min(i * 0.04, 0.3)}s` }}>
            <span className={p.kind === 'police' ? 'icon-badge navy' : 'icon-badge red'}>
              <Icon name={p.kind === 'police' ? 'shield' : 'cross'} />
            </span>
            <div className="grow min0">
              <b className="clamp1">{p.name}</b>
              <div className="row gap6 wrap small muted">
                <span>{distanceLabel(p.distance)}</span>
                {p.women && <span className="pill women">Women's desk</span>}
                {p.open24 && <span className="pill">24×7</span>}
              </div>
            </div>
            {p.phone && (
              <a className="round-btn" href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${p.name}`}><Icon name="phone" size={16} /></a>
            )}
            <button className="round-btn brand" onClick={() => setRoute(p)} aria-label={`Walking route to ${p.name}`}><Icon name="walk" size={18} /></button>
          </div>
        ))}
        {places && <p className="muted xsmall">Places © OpenStreetMap contributors. Data can be incomplete; in danger, call 112.</p>}
      </section>

      {route && loc && <RouteSheet from={loc} place={route} onClose={() => setRoute(null)} />}
    </div>
  );
}
