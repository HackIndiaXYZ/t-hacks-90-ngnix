import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, qs } from '../lib/api.js';
import { LEVEL, distanceLabel, ratingHex } from '../lib/format.js';
import { Icon, ScoreRing } from '../components/Icon.jsx';

const FALLBACK = [12.9716, 77.5946];

const meIcon = L.divIcon({ className: 'me-marker', html: '<span></span>', iconSize: [22, 22] });
const sosIcon = L.divIcon({ className: 'sos-marker', html: '<span></span><b>SOS</b>', iconSize: [44, 44] });
const pickIcon = L.divIcon({ className: 'pick-marker', html: '<span></span>', iconSize: [28, 28], iconAnchor: [14, 28] });

function popupFor(pt, onOpenPlace) {
  const el = document.createElement('div');
  el.className = 'map-popup';
  const t = document.createElement('b');
  t.textContent = pt.title;
  const s = document.createElement('div');
  s.textContent = `${pt.place}${pt.rating ? ` · ${pt.rating}★` : ` · ${pt.flair}`}`;
  const btn = document.createElement('button');
  btn.textContent = 'Read posts here';
  btn.onclick = () => onOpenPlace(pt.place);
  el.append(t, s, btn);
  return el;
}

export default function MapScreen({ loc, status, mode, setMode, setManual, nearbySos, onCompose, onOpenPlace, onToast, refreshKey }) {
  const el = useRef(null);
  const map = useRef(null);
  const layers = useRef({});
  const handlers = useRef({});
  const [selected, setSelected] = useState(null);
  const [count, setCount] = useState(null);

  handlers.current = { mode, setManual, onCompose, onOpenPlace, setMode, onToast };

  useEffect(() => {
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView(loc ? [loc.lat, loc.lng] : FALLBACK, loc ? 15 : 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(m);
    L.control.zoom({ position: 'topright' }).addTo(m);
    layers.current = { heat: L.layerGroup().addTo(m), dots: L.layerGroup().addTo(m), sos: L.layerGroup().addTo(m) };
    map.current = m;

    let timer;
    const loadPoints = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const c = m.getCenter();
        const radius = Math.min(50000, Math.round(m.getBounds().getNorthEast().distanceTo(c)));
        try {
          const { points } = await api(`/points?${qs({ lat: c.lat, lng: c.lng, radius })}`);
          const { heat, dots } = layers.current;
          heat.clearLayers();
          dots.clearLayers();
          for (const pt of points) {
            const color = ratingHex(pt.rating, pt.flair);
            L.circle([pt.lat, pt.lng], { radius: 160, stroke: false, fillColor: color, fillOpacity: 0.16, interactive: false }).addTo(heat);
            L.circle([pt.lat, pt.lng], { radius: 70, stroke: false, fillColor: color, fillOpacity: 0.14, interactive: false }).addTo(heat);
            L.circleMarker([pt.lat, pt.lng], { radius: 6, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 })
              .bindPopup(() => popupFor(pt, (place) => handlers.current.onOpenPlace(place)))
              .addTo(dots);
          }
          setCount(points.length);
        } catch {
        }
      }, 250);
    };
    m.on('moveend', loadPoints);
    m.on('click', (e) => {
      const { lat, lng } = e.latlng;
      const h = handlers.current;
      if (h.mode === 'locate') {
        h.setManual(lat, lng);
        h.setMode(null);
        h.onToast('Location pinned. SOS and scores will use this spot.');
      } else if (h.mode === 'post') {
        h.setMode(null);
        h.onCompose({ lat, lng, source: 'map' });
      } else {
        setSelected({ lat, lng, safety: null });
      }
    });
    loadPoints();
    m._reload = loadPoints;
    return () => {
      clearTimeout(timer);
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => { map.current?._reload(); }, [refreshKey]);

  const centred = useRef(!!loc);
  useEffect(() => {
    const m = map.current;
    if (!m || !loc) return;
    if (!layers.current.me) layers.current.me = L.marker([loc.lat, loc.lng], { icon: meIcon, keyboard: false, interactive: false }).addTo(m);
    else layers.current.me.setLatLng([loc.lat, loc.lng]);
    if (!centred.current) {
      centred.current = true;
      m.setView([loc.lat, loc.lng], 15);
    }
  }, [loc?.lat, loc?.lng]);

  useEffect(() => {
    const g = layers.current.sos;
    if (!g) return;
    g.clearLayers();
    for (const s of nearbySos) L.marker([s.lat, s.lng], { icon: sosIcon, zIndexOffset: 1000 }).addTo(g);
  }, [nearbySos]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (layers.current.pick) { layers.current.pick.remove(); layers.current.pick = null; }
    if (!selected) return;
    layers.current.pick = L.marker([selected.lat, selected.lng], { icon: pickIcon, interactive: false }).addTo(m);
    if (selected.safety) return;
    api(`/safety?${qs({ lat: selected.lat, lng: selected.lng, radius: 500 })}`)
      .then((safety) => setSelected((s) => (s && s.lat === selected.lat ? { ...s, safety } : s)))
      .catch(() => {});
  }, [selected]);

  useEffect(() => { if (mode) setSelected(null); }, [mode]);

  const recenter = () => (loc ? map.current?.flyTo([loc.lat, loc.lng], 16) : setMode('locate'));
  const s = selected?.safety;
  const lv = LEVEL[s?.level || 'unknown'];

  return (
    <div className="map-screen">
      <div ref={el} className="map" />

      <div className="map-top">
        {mode ? (
          <div className="banner dark pop">
            <Icon name="pin" size={18} />
            <span className="grow">{mode === 'post' ? 'Tap the map where this happened' : 'Tap the map where you are'}</span>
            <button className="btn white xs" onClick={() => setMode(null)}>Cancel</button>
          </div>
        ) : (
          <div className="map-legend fade-up">
            <span><i style={{ background: '#0B7A5E' }} />Safe</span>
            <span><i style={{ background: '#D08A10' }} />Mixed</span>
            <span><i style={{ background: '#C62E33' }} />Unsafe</span>
            {count != null && <span className="muted">{count} reports</span>}
          </div>
        )}
      </div>

      <div className="map-actions">
        <button className="fab" onClick={recenter} aria-label={loc ? 'Centre on me' : 'Set my location'}><Icon name="locate" /></button>
        <button className="fab brand" onClick={() => setMode('post')} aria-label="Post about a spot"><Icon name="plus" /></button>
      </div>

      {!loc && !mode && status !== 'locating' && (
        <div className="map-card pop">
          <b>Where are you?</b>
          <p className="muted small">GPS is off or blocked. Turn it on, or tap the map to pin yourself.</p>
          <button className="btn primary" onClick={() => setMode('locate')}>Pin my location</button>
        </div>
      )}

      {selected && !mode && (
        <div className="map-card pop">
          <button className="round-btn close" onClick={() => setSelected(null)} aria-label="Close"><Icon name="x" size={16} /></button>
          <div className="row gap14">
            <ScoreRing score={s?.score} color={lv.color} size={64} />
            <div className="col gap2">
              <b style={{ color: lv.color }}>{s ? s.label : 'Checking…'}</b>
              <span className="muted small">
                {s ? (s.reviews ? `${s.reviews} reviews within 500 m` : 'No one has reviewed this spot yet') : ''}
                {loc && s ? ` · ${distanceLabel(L.latLng(loc.lat, loc.lng).distanceTo([selected.lat, selected.lng]))} from you` : ''}
              </span>
            </div>
          </div>
          <div className="row gap8">
            <button className="btn primary grow" onClick={() => onCompose({ lat: selected.lat, lng: selected.lng, source: 'map' })}>Review this spot</button>
            <button className="btn ghost" onClick={() => { setManual(selected.lat, selected.lng); setSelected(null); onToast('Location pinned here'); }}>I'm here</button>
          </div>
        </div>
      )}
    </div>
  );
}
