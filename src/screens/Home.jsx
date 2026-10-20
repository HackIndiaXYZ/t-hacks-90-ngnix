import { useEffect, useState } from 'react';
import { api, qs } from '../lib/api.js';
import { LEVEL } from '../lib/format.js';
import { Icon, ScoreRing } from '../components/Icon.jsx';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function LocationChip({ status, loc, onFix }) {
  const label =
    status === 'gps' ? `GPS · within ${loc?.accuracy ?? '?'} m`
      : status === 'locating' ? 'Finding you…'
        : loc ? 'Pinned location' : 'Set your location';
  const live = status === 'gps';
  return (
    <button className="loc-chip" onClick={onFix} aria-label={`Location: ${label}`}>
      <span className={live ? 'dot live blink' : 'dot'} />
      {label}
    </button>
  );
}

export default function Home({ loc, status, online, contacts, journeyLive, onSos, onCompose, onTab, onFixLocation, refreshKey }) {
  const [safety, setSafety] = useState(null);

  useEffect(() => {
    if (!loc) return;
    const ctl = new AbortController();
    api(`/safety?${qs({ lat: loc.lat, lng: loc.lng })}`, { signal: ctl.signal }).then(setSafety).catch(() => {});
    return () => ctl.abort();
  }, [loc?.lat, loc?.lng, refreshKey]);

  const lv = LEVEL[safety?.level || 'unknown'];

  return (
    <div className="screen">
      <header className="row between fade-up">
        <div>
          <p className="muted small">{greeting()}</p>
          <h1 className="h1">You're covered</h1>
        </div>
        <LocationChip status={status} loc={loc} onFix={onFixLocation} />
      </header>

      {!online && (
        <div className="banner warn fade-up">
          <Icon name="wifiOff" size={18} /> No internet. SOS will still go out by SMS.
        </div>
      )}

      <button className="card score-card fade-up" style={{ animationDelay: '.05s' }} onClick={() => (loc ? onTab('map') : onFixLocation())}>
        <ScoreRing score={safety?.score} color={lv.color} />
        <div className="col gap4">
          <span className="muted small">Safety score around you</span>
          <span className="score-label" style={{ color: lv.color }}>
            {!loc ? 'Location needed' : safety ? safety.label : 'Checking…'}
          </span>
          <span className="muted small">
            {!loc ? 'Tap to set where you are'
              : safety?.reviews ? `From ${safety.reviews} reviews within ${safety.radius} m${safety.recentAlerts ? ` · ${safety.recentAlerts} recent alerts` : ''}`
                : 'Be the first to review this area'}
          </span>
        </div>
      </button>

      <div className="sos-wrap fade-up" style={{ animationDelay: '.1s' }}>
        <div className="sos-big">
          <span className="ripple" aria-hidden="true" />
          <span className="ripple" aria-hidden="true" style={{ animationDelay: '.9s' }} />
          <span className="ripple" aria-hidden="true" style={{ animationDelay: '1.8s' }} />
          <button onClick={onSos} aria-label="Send SOS">
            <strong>SOS</strong>
            <span>Tap · 5 s to cancel</span>
          </button>
        </div>
        {!contacts.length && (
          <button className="link-btn" onClick={() => onTab('settings')}>
            Add trusted contacts so SOS can text them
          </button>
        )}
      </div>

      <div className="tile-grid">
        <button className="tile fade-up" style={{ animationDelay: '.15s' }} onClick={() => onCompose()}>
          <span className="icon-badge"><Icon name="pen" /></span>
          <b>Write a review</b><span className="muted small">Anonymous, with #tags</span>
        </button>
        <button className="tile fade-up" style={{ animationDelay: '.2s' }} onClick={() => onTab('map')}>
          <span className="icon-badge"><Icon name="map" /></span>
          <b>Safety map</b><span className="muted small">Heatmap from reviews</span>
        </button>
        <button className="tile fade-up" style={{ animationDelay: '.25s' }} onClick={() => onTab('journey')}>
          <span className="icon-badge"><Icon name="route" /></span>
          <b>{journeyLive ? 'Journey live' : 'Start journey'}</b>
          <span className="muted small">{journeyLive ? 'Tap to check in' : 'Auto SOS if you go silent'}</span>
        </button>
        <a className="tile fade-up" style={{ animationDelay: '.3s' }} href="tel:112">
          <span className="icon-badge red"><Icon name="phone" /></span>
          <b>Call 112</b><span className="muted small">National emergency</span>
        </a>
      </div>
    </div>
  );
}
