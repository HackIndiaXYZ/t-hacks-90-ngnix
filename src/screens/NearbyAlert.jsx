import { Icon } from '../components/Icon.jsx';
import { distanceLabel, timeAgo } from '../lib/format.js';
import { mapsLink } from '../lib/sms.js';

export default function NearbyAlert({ alert, onDismiss, onShowMap }) {
  return (
    <div className="nearby-alert drop-in" role="alert">
      <div className="row gap10">
        <span className="alert-pulse"><Icon name="radar" size={20} /></span>
        <div className="grow">
          <b>Someone near you needs help</b>
          <div className="small soft">{distanceLabel(alert.distance)} away · started {timeAgo(alert.startedAt)}</div>
        </div>
        <button className="round-btn on-dark" onClick={onDismiss} aria-label="Dismiss"><Icon name="x" size={16} /></button>
      </div>
      <div className="row gap8">
        <a className="btn white sm grow" href={mapsLink(alert.lat, alert.lng)} target="_blank" rel="noreferrer"><Icon name="send" size={14} /> Directions</a>
        <button className="btn glass sm" onClick={onShowMap}>Map</button>
        <a className="btn glass sm" href="tel:112"><Icon name="phone" size={14} /> 112</a>
      </div>
    </div>
  );
}
