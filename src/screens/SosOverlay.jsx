import { Icon } from '../components/Icon.jsx';
import { mapsLink } from '../lib/sms.js';

export function SosCountdown({ count, onCancel, practice }) {
  const off = Math.round(440 * (1 - count / 5));
  return (
    <div className={practice ? 'sos-screen count practice dim-in' : 'sos-screen count dim-in'} role="alertdialog" aria-labelledby="sos-count-title">
      <p className="eyebrow light">{practice ? 'Practice · ' : ''}Sending in {count}s</p>
      <h2 id="sos-count-title" className="h2 center">{practice ? 'Practice SOS. Nobody is alerted.' : 'Sending SOS to your people'}</h2>
      <div className="countdown">
        <span className="ripple white" aria-hidden="true" />
        <span className="ripple white" aria-hidden="true" style={{ animationDelay: '1.3s' }} />
        <svg viewBox="0 0 160 160" aria-hidden="true">
          <circle cx="80" cy="80" r="70" className="cd-track" />
          <circle cx="80" cy="80" r="70" className="cd-fill" style={{ strokeDashoffset: off }} />
        </svg>
        <span key={count} className="pop">{count}</span>
      </div>
      <p className="center soft">{practice ? 'In a real SOS, these 5 seconds let you cancel a false alarm.' : 'Your trusted contacts get an SMS with your location, and Sakhi users within 200 m get an alert.'}</p>
      <span className="grow" />
      <button className="btn white lg block sos-cancel" onClick={onCancel} autoFocus>Cancel, I'm OK</button>
    </div>
  );
}

export function SosSending() {
  return (
    <div className="sos-screen active dim-in" role="alert">
      <div className="center col gap14" style={{ marginTop: 160 }}>
        <span className="spinner light" />
        <h2 className="h2">Getting your location…</h2>
      </div>
    </div>
  );
}

export function SosActive({ sos, contacts, online, serverSms, onResolve, onToast }) {
  const hasFix = sos.lat != null;
  const trackUrl = sos.id ? `${location.origin}/track/${sos.id}` : null;
  if (sos.drill) {
    const pSteps = [
      { ok: sos.lat != null, t: sos.lat != null ? 'Your location was found' : 'No location yet', d: sos.lat != null ? (sos.accuracy ? `Accurate to about ${Math.round(sos.accuracy)} m` : 'From your pinned spot') : 'Turn on GPS so a real SOS can share it' },
      { ok: contacts.length > 0, t: contacts.length ? `In a real SOS, ${contacts.length} ${contacts.length === 1 ? 'contact gets' : 'contacts get'} an SMS` : 'Add trusted contacts', d: contacts.length ? 'With a map link to your location. Works with no internet.' : 'Without them, a real SOS cannot text anyone' },
      { ok: true, t: 'In a real SOS, Sakhi users within 200 m get an alert', d: 'With directions to you. Your family gets a live tracking link.' },
    ];
    return (
      <div className="sos-screen active practice dim-in" role="dialog" aria-label="Practice SOS">
        <p className="eyebrow light">Practice SOS · nothing was sent</p>
        <h2 className="h1 light">That is how SOS works</h2>
        <p className="soft">In a real emergency, this screen stays open and keeps your location live until you tap “I'm safe now”.</p>
        <div className="col gap10 steps">
          {pSteps.map((s, i) => (
            <div key={s.t} className="step fade-up" style={{ animationDelay: `${0.15 + i * 0.25}s` }}>
              <span className={s.ok ? 'step-icon ok pop' : 'step-icon warn pop'} style={{ animationDelay: `${0.15 + i * 0.25}s` }}>
                <Icon name={s.ok ? 'check' : 'alert'} size={16} />
              </span>
              <div><b>{s.t}</b><div className="soft small">{s.d}</div></div>
            </div>
          ))}
        </div>
        <span className="grow" />
        <button className="btn white lg block" onClick={onResolve}>End practice</button>
      </div>
    );
  }

  const steps = sos.auto ? [
    { ok: true, t: 'Your journey timer ran out', d: 'You didn\'t check in, so Sakhi raised this SOS for you' },
    { ok: true, t: 'Alert sent to Sakhi users within 200 m', d: hasFix ? 'With your last known location' : 'Location unknown' },
    serverSms
      ? { ok: true, t: 'Your contacts were texted', d: 'Sakhi sent them your last location' }
      : contacts.length
        ? { ok: false, t: 'Text your contacts now', d: 'Tap "Send SMS" below' }
        : { ok: false, t: 'No trusted contacts', d: 'Add them in Settings so SOS can text them' },
  ] : [
    hasFix
      ? { ok: true, t: 'Location found', d: sos.accuracy ? `Accurate to about ${Math.round(sos.accuracy)} m` : 'From your pinned location' }
      : { ok: false, t: 'No location yet', d: 'Turn on GPS. The SMS will go without coordinates.' },
    sos.online
      ? { ok: true, t: 'Live alert sent', d: sos.notified ? `${sos.notified} Sakhi ${sos.notified === 1 ? 'user' : 'users'} within 200 m alerted` : 'No other Sakhi users within 200 m right now' }
      : { ok: false, t: online ? 'Could not reach the server' : 'No internet', d: 'Using SMS only. It works on mobile signal.' },
    contacts.length
      ? { ok: true, t: `SMS ready for ${contacts.length} ${contacts.length === 1 ? 'contact' : 'contacts'}`, d: 'Press send in your messages app' }
      : { ok: false, t: 'No trusted contacts', d: 'Add them in Settings so SOS can text them' },
  ];

  async function shareLocation() {
    const text = trackUrl || (hasFix ? mapsLink(sos.lat, sos.lng) : '');
    try {
      if (navigator.share) await navigator.share({ title: 'SOS – my location', text: 'I need help. My location:', url: text });
      else {
        await navigator.clipboard.writeText(text);
        onToast('Location link copied');
      }
    } catch {
    }
  }

  return (
    <div className="sos-screen active dim-in" role="alert">
      <span className="sos-glow breathe" aria-hidden="true" />
      <p className="eyebrow red"><span className="dot red blink" />{sos.auto ? 'Automatic SOS' : 'SOS active'}</p>
      <h2 className="h1 light">{sos.auto ? 'Are you OK?' : 'Help is on the way'}</h2>
      <p className="soft">
        {sos.auto
          ? 'If you are fine, tap "I\'m safe now" so nobody worries. If not, call 112.'
          : 'Stay where it\'s bright and busy if you can. Keep this screen open so your location stays live.'}
      </p>

      <div className="col gap10 steps">
        {steps.map((s, i) => (
          <div key={s.t} className="step fade-up" style={{ animationDelay: `${0.2 + i * 0.35}s` }}>
            <span className={s.ok ? 'step-icon ok pop' : 'step-icon warn pop'} style={{ animationDelay: `${0.2 + i * 0.35}s` }}>
              <Icon name={s.ok ? 'check' : 'alert'} size={16} />
            </span>
            <div><b>{s.t}</b><div className="soft small">{s.d}</div></div>
          </div>
        ))}
      </div>

      <div className="row gap8 wrap">
        {contacts.length > 0 && <a className="btn glass" href={sos.sms}><Icon name="msg" size={16} /> {sos.auto ? 'Send SMS' : 'Send SMS again'}</a>}
        <button className="btn glass" onClick={shareLocation}><Icon name="share" size={16} /> Share location</button>
      </div>

      <span className="grow" />
      <div className="row gap10">
        <a className="btn sos lg grow" href="tel:112"><Icon name="phone" size={18} /> Call 112</a>
        <button className="btn outline-light lg grow" onClick={onResolve}>I'm safe now</button>
      </div>
    </div>
  );
}
