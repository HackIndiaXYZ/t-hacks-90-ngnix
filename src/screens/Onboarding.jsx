import { useState } from 'react';
import { Icon } from '../components/Icon.jsx';
import { smsHref } from '../lib/sms.js';

const STEPS = ['welcome', 'how', 'location', 'contacts', 'alerts', 'practice'];

function Contacts({ contacts, setContacts, onToast }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  function add(e) {
    e.preventDefault();
    const digits = phone.replace(/[^\d+]/g, '');
    if (digits.replace('+', '').length < 8) return onToast('Enter a full phone number, with country code if outside India');
    setContacts([...contacts, { name: name.trim() || digits, phone: digits }]);
    setName('');
    setPhone('');
  }
  return (
    <div className="col gap10">
      {contacts.map((c, i) => (
        <div key={`${c.phone}-${i}`} className="contact-row card tight">
          <span className="avatar brand">{c.name.charAt(0).toUpperCase()}</span>
          <div className="grow min0"><b>{c.name}</b><div className="muted small">{c.phone}</div></div>
          <button className="round-btn" aria-label={`Remove ${c.name}`} onClick={() => setContacts(contacts.filter((_, j) => j !== i))}><Icon name="trash" size={16} /></button>
        </div>
      ))}
      {contacts.length < 5 && (
        <form className="col gap8" onSubmit={add}>
          <label className="sr-only" htmlFor="ob-name">Name</label>
          <input id="ob-name" className="input" placeholder="Name (e.g. Mom)" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          <label className="sr-only" htmlFor="ob-phone">Phone</label>
          <input id="ob-phone" className="input" placeholder="Phone number" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <button className="btn ghost">Add contact</button>
        </form>
      )}
      {contacts.length > 0 && (
        <a className="link-btn" href={smsHref(contacts.map((c) => c.phone), 'Hi! I added you as my emergency contact on Sakhi. If I send an SOS, you will get my location by SMS.')}>
          Let them know with a quick SMS
        </a>
      )}
    </div>
  );
}

export default function Onboarding({ step: i, setStep: setI, status, retryGps, onPickLocation, contacts, setContacts, push, onDone, onToast }) {
  const step = STEPS[i];
  const next = () => setI((n) => Math.min(n + 1, STEPS.length - 1));
  const back = () => setI((n) => Math.max(n - 1, 0));
  const located = status === 'gps' || status === 'manual';

  return (
    <div className="onboarding">
      <div className="ob-top">
        {i > 0 ? (
          <button className="round-btn" onClick={back} aria-label="Back"><Icon name="arrowLeft" size={18} /></button>
        ) : <span style={{ width: 38 }} />}
        <div className="ob-progress" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={i + 1}>
          <span style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} />
        </div>
        {i < STEPS.length - 1 ? <button className="link-btn" onClick={() => onDone(false)}>Skip</button> : <span style={{ width: 38 }} />}
      </div>

      <div key={step} className="ob-body fade-up">
        {step === 'welcome' && (
          <>
            <div className="ob-logo pop"><Icon name="shield" size={54} /></div>
            <h1 className="ob-title">Sakhi</h1>
            <p className="ob-lead">Walk freely. Your community has your back.</p>
            <p className="muted">Sakhi means friend. It warns you about unsafe places, gets you help in one tap, and watches over your trip home.</p>
          </>
        )}

        {step === 'how' && (
          <>
            <h1 className="h1">How Sakhi protects you</h1>
            <div className="col gap12">
              {[
                ['chat', 'Know before you go', 'Women review places anonymously. The map shows which streets feel safe.'],
                ['radar', 'One tap for help', 'SOS texts your people your location, even with no internet, and alerts Sakhi users within 200 m.'],
                ['route', 'Covered on the way', 'Start a journey and check in. If your phone goes quiet, Sakhi sends the SOS for you.'],
              ].map(([icon, t, d], k) => (
                <div key={t} className="row gap12 card tight fade-up" style={{ animationDelay: `${0.1 + k * 0.1}s` }}>
                  <span className="icon-badge"><Icon name={icon} /></span>
                  <div><b>{t}</b><div className="muted small">{d}</div></div>
                </div>
              ))}
            </div>
          </>
        )}

        {step === 'location' && (
          <>
            <div className="ob-icon"><Icon name="locate" size={40} /></div>
            <h1 className="h1">Turn on location</h1>
            <p className="muted">Sakhi uses your location for the SOS, safety scores, nearby help and alerts from people near you. Other users never see where you are, unless you send an SOS.</p>
            {located ? (
              <div className="banner safe"><Icon name="check" size={18} /> {status === 'gps' ? 'Location is on' : 'Location pinned on the map'}</div>
            ) : status === 'denied' ? (
              <div className="banner warn">Location is blocked. Allow it in your browser settings, or pin your spot on the map.</div>
            ) : null}
          </>
        )}

        {step === 'contacts' && (
          <>
            <h1 className="h1">Who should we alert?</h1>
            <p className="muted">These people get an SMS with your location when you send an SOS. They stay on this phone only.</p>
            <Contacts contacts={contacts} setContacts={setContacts} onToast={onToast} />
          </>
        )}

        {step === 'alerts' && (
          <>
            <div className="ob-icon"><Icon name="bell" size={40} /></div>
            <h1 className="h1">Help others nearby</h1>
            <p className="muted">When someone within 200 m sends an SOS, you can get an alert, even when Sakhi is closed. To reach you, Sakhi keeps the last place your app was open. Turn it off any time.</p>
            {push.state === 'on' && <div className="banner safe"><Icon name="check" size={18} /> Nearby alerts are on</div>}
            {push.state === 'denied' && <div className="banner warn">Notifications are blocked in your browser settings.</div>}
            {push.state === 'unsupported' && <div className="banner warn">This browser cannot show alerts while Sakhi is closed. Install Sakhi to your home screen, or keep it open.</div>}
          </>
        )}

        {step === 'practice' && (
          <>
            <div className="ob-icon red"><Icon name="radar" size={40} /></div>
            <h1 className="h1">Try it once</h1>
            <p className="muted">Run a practice SOS so you know what happens. Nobody gets alerted and no SMS goes out.</p>
            <ul className="ob-list">
              <li>Tap SOS. You get 5 seconds to cancel.</li>
              <li>Sakhi finds your location.</li>
              <li>In a real SOS, your contacts and people nearby are alerted.</li>
            </ul>
          </>
        )}
      </div>

      <div className="ob-actions">
        {step === 'welcome' && <button className="btn primary lg block" onClick={next}>Get started</button>}
        {step === 'how' && <button className="btn primary lg block" onClick={next}>Next</button>}
        {step === 'location' && (
          located ? <button className="btn primary lg block" onClick={next}>Next</button> : (
            <>
              <button className="btn primary lg block" onClick={retryGps} disabled={status === 'locating'}>{status === 'locating' ? 'Waiting for permission…' : 'Allow location'}</button>
              <button className="btn ghost block" onClick={onPickLocation}>Pin my spot on the map</button>
              <button className="link-btn" onClick={next}>Later</button>
            </>
          )
        )}
        {step === 'contacts' && (
          <button className="btn primary lg block" onClick={next}>{contacts.length ? 'Next' : 'Skip for now'}</button>
        )}
        {step === 'alerts' && (
          push.state === 'on' || push.state === 'unsupported' || push.state === 'denied' ? (
            <button className="btn primary lg block" onClick={next}>Next</button>
          ) : (
            <>
              <button className="btn primary lg block" disabled={push.state === 'working'} onClick={async () => { await push.enable(); }}>Turn on nearby alerts</button>
              <button className="link-btn" onClick={next}>Not now</button>
            </>
          )
        )}
        {step === 'practice' && (
          <>
            <button className="btn sos lg block" onClick={() => onDone(true)}>Start practice SOS</button>
            <button className="link-btn" onClick={() => onDone(false)}>Skip and open Sakhi</button>
          </>
        )}
      </div>
    </div>
  );
}
