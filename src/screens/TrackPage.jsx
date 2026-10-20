import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
import { mapsLink } from '../lib/sms.js';
import { Icon } from '../components/Icon.jsx';

const sosIcon = L.divIcon({ className: 'sos-marker', html: '<span></span><b>SOS</b>', iconSize: [44, 44] });

export default function TrackPage({ id }) {
  const [sos, setSos] = useState(null);
  const [error, setError] = useState(null);
  const [offline, setOffline] = useState(false);
  const el = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const [, tick] = useState(0);

  useEffect(() => {
    let stop = false;
    const load = () =>
      api(`/sos/${encodeURIComponent(id)}`)
        .then((r) => {
          if (stop) return;
          setSos(r.sos);
          setOffline(false);
          setError(null);
        })
        .catch((e) => {
          if (stop) return;
          if (e instanceof TypeError || !navigator.onLine) setOffline(true);
          else setError(e.message);
        });
    load();
    const t = setInterval(load, 10000);
    window.addEventListener('online', load);
    const t2 = setInterval(() => tick((n) => n + 1), 5000);
    return () => { stop = true; clearInterval(t); clearInterval(t2); window.removeEventListener('online', load); };
  }, [id]);

  useEffect(() => {
    if (!sos || !el.current) return;
    if (!map.current) {
      map.current = L.map(el.current, { zoomControl: false }).setView([sos.lat, sos.lng], 17);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map.current);
      marker.current = L.marker([sos.lat, sos.lng], { icon: sosIcon }).addTo(map.current);
    } else {
      marker.current.setLatLng([sos.lat, sos.lng]);
      map.current.panTo([sos.lat, sos.lng]);
    }
    if (sos.accuracy) {
      marker.current._acc?.remove();
      marker.current._acc = L.circle([sos.lat, sos.lng], { radius: sos.accuracy, color: '#E0353B', weight: 1, fillOpacity: 0.08 }).addTo(map.current);
    }
  }, [sos]);

  if (error) {
    return (
      <div className="track">
        <div className="track-card"><b>This SOS link isn't valid.</b><p className="muted small">{error}</p><a className="btn sos" href="tel:112">Call 112</a></div>
      </div>
    );
  }

  return (
    <div className="track">
      <div ref={el} className="map" />
      <div className="track-card pop">
        {offline && <div className="banner warn small">No internet connection. Retrying every 10 seconds{sos ? '; showing the last known location.' : '.'}</div>}
        {!sos ? (
          <p className="muted">{offline ? 'Waiting for a connection to load their location.' : 'Loading location…'}</p>
        ) : sos.resolved ? (
          <>
            <span className="banner safe"><Icon name="check" size={18} /> They marked themselves safe</span>
            <p className="muted small">Last location shown, from {timeAgo(sos.updatedAt)}.</p>
          </>
        ) : (
          <>
            <p className="eyebrow red"><span className="dot red blink" />{sos.auto ? 'Automatic SOS' : 'Live SOS'}</p>
            <h1 className="h2">{sos.auto ? 'Their phone stopped checking in' : 'Someone you know needs help'}</h1>
            {sos.auto && <p className="small">They were on a journey and didn't confirm they were safe in time. The pin shows where their phone was last heard from.</p>}
            <p className="muted small">{sos.auto ? 'Last seen' : 'Location updated'} {timeAgo(sos.updatedAt)}{sos.accuracy ? ` · accurate to ${Math.round(sos.accuracy)} m` : ''}. This page refreshes by itself.</p>
            <div className="row gap8">
              <a className="btn primary grow" href={mapsLink(sos.lat, sos.lng)} target="_blank" rel="noreferrer"><Icon name="send" size={16} /> Directions</a>
              <a className="btn sos grow" href="tel:112"><Icon name="phone" size={16} /> Call 112</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
