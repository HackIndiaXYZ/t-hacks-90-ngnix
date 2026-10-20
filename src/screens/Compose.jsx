import { useEffect, useState } from 'react';
import { api, qs } from '../lib/api.js';
import { distanceLabel, tagsIn } from '../lib/format.js';
import { Icon, StarInput } from '../components/Icon.jsx';

const TYPES = ['Review', 'Alert', 'Tip'];
const SUGGESTED = ['WellLit', 'PoorlyLit', 'PoliceNearby', 'SafeForSolo', 'AvoidAtNight', 'Crowded', 'Isolated', 'Harassment', 'SafeRide'];
const RATING_WORDS = ['How safe did it feel?', 'Felt unsafe', 'Not great', 'Okay', 'Felt safe', 'Very safe'];

export default function Compose({ at, me, onClose, onPosted, onPickLocation, onToast }) {
  const [type, setType] = useState('Review');
  const [rating, setRating] = useState(0);
  const [place, setPlace] = useState(at?.place || '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [places, setPlaces] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [osmName, setOsmName] = useState(null);

  useEffect(() => {
    if (!at) return;
    api(`/places?${qs({ lat: at.lat, lng: at.lng, radius: 1500 })}`).then((r) => setPlaces(r.places)).catch(() => {});
    api(`/geo/reverse?${qs({ lat: at.lat, lng: at.lng })}`)
      .then((r) => {
        if (!r.name) return;
        setOsmName(r.name);
        setPlace((p) => p || r.name);
      })
      .catch(() => {});
  }, [at?.lat, at?.lng]);

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const tags = tagsIn(`${title} ${body}`);
  const has = (t) => tags.some((x) => x.toLowerCase() === t.toLowerCase());
  function toggleTag(t) {
    if (has(t)) setBody(body.replace(new RegExp(`\\s*#${t}(?![\\p{L}\\p{N}_])`, 'iu'), ''));
    else setBody(`${body.trimEnd()}${body.trim() ? ' ' : ''}#${t}`);
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (type === 'Review' && !rating) return setError('Tap the stars to rate how safe it felt.');
    setBusy(true);
    try {
      const r = await api('/posts', { method: 'POST', body: { lat: at.lat, lng: at.lng, place, flair: type, rating, title, body } });
      onPosted(r.post);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop dim-in" onClick={onClose}>
      <form className="sheet sheet-in" onClick={(e) => e.stopPropagation()} onSubmit={submit} aria-labelledby="compose-title">
        <span className="grabber" aria-hidden="true" />
        <div className="row between">
          <h2 id="compose-title" className="h2">New post</h2>
          <button type="button" className="round-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        <p className="muted xsmall">Posting anonymously as <b className="ink">{me || '…'}</b></p>

        {!at ? (
          <div className="banner warn">
            <span className="grow">We need to know where this is.</span>
            <button type="button" className="btn white xs" onClick={onPickLocation}>Pick on map</button>
          </div>
        ) : (
          <div className="banner brand small">
            <Icon name="pin" size={16} />
            <span className="grow">{at.source === 'map' ? 'Pinned to the spot you picked on the map' : at.source === 'gps' ? 'Pinned to where you are now' : 'Pinned to your saved location'}</span>
            <button type="button" className="link-btn" onClick={onPickLocation}>Change</button>
          </div>
        )}

        <div className="seg">
          {TYPES.map((t) => (
            <button type="button" key={t} className={type === t ? 'on' : ''} aria-pressed={type === t} onClick={() => setType(t)}>{t}</button>
          ))}
        </div>

        <div className="field">
          <label htmlFor="place">Place</label>
          <input id="place" className="input" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Metro Exit B, Lake Park" maxLength={60} required minLength={2} />
          {(places.length > 0 || osmName) && (
            <div className="wrap gap6">
              {osmName && !places.some((p) => p.place.toLowerCase() === osmName.toLowerCase()) && (
                <button type="button" className={place.toLowerCase() === osmName.toLowerCase() ? 'chip sm on' : 'chip sm'} onClick={() => setPlace(osmName)}>
                  <Icon name="pin" size={12} /> {osmName}
                </button>
              )}
              {places.map((p) => (
                <button type="button" key={p.place} className={place.toLowerCase() === p.place.toLowerCase() ? 'chip sm on' : 'chip sm'} onClick={() => setPlace(p.place)}>
                  {p.place} <span className="chip-count">{distanceLabel(p.distance)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <span className="label">{RATING_WORDS[rating]}{type !== 'Review' && ' (optional)'}</span>
          <StarInput value={rating} onChange={setRating} />
        </div>

        <div className="field">
          <label htmlFor="title">Title</label>
          <input id="title" className="input strong" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sum it up in a line" maxLength={120} required minLength={3} />
        </div>

        <div className="field">
          <label htmlFor="body">What should others know? Add #hashtags</label>
          <textarea id="body" className="input" rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder="Lit till 10, guard at the gate. #WellLit #SafeForSolo" />
          <div className="wrap gap6">
            {SUGGESTED.map((t) => (
              <button type="button" key={t} className={has(t) ? 'chip sm on' : 'chip sm'} aria-pressed={has(t)} onClick={() => toggleTag(t)}>#{t}</button>
            ))}
          </div>
          <span className="muted xsmall">Tags: <b className="brand-text">{tags.length ? tags.map((t) => `#${t}`).join(' ') : 'none yet'}</b></span>
        </div>

        {error && <div className="banner warn" role="alert">{error}</div>}
        <button className="btn primary lg" disabled={busy || !at} type="submit">{busy ? 'Posting…' : 'Post anonymously'}</button>
      </form>
    </div>
  );
}
