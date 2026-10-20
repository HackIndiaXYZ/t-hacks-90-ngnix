import { useState } from 'react';
import { Icon } from '../components/Icon.jsx';
import { smsHref } from '../lib/sms.js';

const MAX = 5;

export default function Settings({ me, contacts, setContacts, status, retryGps, onPickLocation, onToast, push, caller, setCaller, onPractice, onReplayIntro }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  function add(e) {
    e.preventDefault();
    const digits = phone.replace(/[^\d+]/g, '');
    if (digits.replace('+', '').length < 8) return onToast('Enter a full phone number');
    setContacts([...contacts, { name: name.trim() || digits, phone: digits }]);
    setName('');
    setPhone('');
  }

  return (
    <div className="screen">
      <h1 className="h1 fade-up">You</h1>

      <section className="card col gap10 fade-up" style={{ animationDelay: '.05s' }}>
        <span className="muted small">Your anonymous name</span>
        <b className="big">{me || '…'}</b>
        <span className="muted xsmall">No account, no phone number. Your posts are linked only to this phone.</span>
      </section>

      <section className="card col gap12 fade-up" style={{ animationDelay: '.1s' }}>
        <div className="row between">
          <h2 className="h3">Trusted contacts</h2>
          <span className="muted small">{contacts.length}/{MAX}</span>
        </div>
        <p className="muted small">They get an SMS with your location when you send an SOS. Stored only on this phone.</p>
        {contacts.map((c, i) => (
          <div key={`${c.phone}-${i}`} className="contact-row">
            <span className="avatar brand">{c.name.charAt(0).toUpperCase()}</span>
            <div className="grow min0"><b>{c.name}</b><div className="muted small">{c.phone}</div></div>
            <button className="round-btn" aria-label={`Remove ${c.name}`} onClick={() => setContacts(contacts.filter((_, j) => j !== i))}><Icon name="trash" size={16} /></button>
          </div>
        ))}
        {contacts.length < MAX && (
          <form className="col gap8" onSubmit={add}>
            <div className="row gap8">
              <label className="sr-only" htmlFor="c-name">Name</label>
              <input id="c-name" className="input grow" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
              <label className="sr-only" htmlFor="c-phone">Phone</label>
              <input id="c-phone" className="input grow" placeholder="+91 98…" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
            <button className="btn primary">Add contact</button>
          </form>
        )}
        {contacts.length > 0 && (
          <a className="btn ghost" href={smsHref(contacts.map((c) => c.phone), 'Testing Sakhi: you are one of my emergency contacts. If I send an SOS you will get my location here.')}>
            <Icon name="msg" size={16} /> Send them a test SMS
          </a>
        )}
      </section>

      <section className="card col gap10 fade-up" style={{ animationDelay: '.15s' }}>
        <h2 className="h3">Location</h2>
        <p className="muted small">
          {status === 'gps' ? 'Using live GPS.' : status === 'manual' ? 'Using a spot you pinned on the map.' : status === 'denied' ? 'Location permission is blocked. Allow it in your browser settings for live SOS.' : 'GPS is not available right now.'}
        </p>
        <div className="row gap8">
          <button className="btn ghost grow" onClick={retryGps}><Icon name="locate" size={16} /> Use GPS</button>
          <button className="btn ghost grow" onClick={onPickLocation}><Icon name="pin" size={16} /> Pin on map</button>
        </div>
      </section>

      <section className="card col gap10 fade-up" style={{ animationDelay: '.2s' }}>
        <div className="row between">
          <h2 className="h3">Nearby SOS alerts</h2>
          {push.state === 'on' && <span className="pill women">On</span>}
        </div>
        <p className="muted small">Get an alert when someone within 200 m sends an SOS, even when Sakhi is closed. Sakhi keeps the last place your app was open so it can reach you.</p>
        {push.state === 'off' && <button className="btn primary" onClick={push.enable}><Icon name="bell" size={16} /> Turn on nearby alerts</button>}
        {push.state === 'on' && <button className="btn ghost" onClick={push.disable}>Turn off nearby alerts</button>}
        {push.state === 'working' && <span className="muted small">Working…</span>}
        {push.state === 'denied' && <span className="banner warn small">Notifications are blocked in your browser settings.</span>}
        {push.state === 'unsupported' && <span className="banner warn small">This browser cannot alert you while Sakhi is closed. Install Sakhi to your home screen, or keep it open.</span>}
      </section>

      <section className="card col gap10 fade-up" style={{ animationDelay: '.25s' }}>
        <h2 className="h3">Fake call</h2>
        <label className="label" htmlFor="caller">Caller name shown on the screen</label>
        <input id="caller" className="input" value={caller} maxLength={24} onChange={(e) => setCaller(e.target.value)} placeholder="Mom" />
      </section>

      <section className="card col gap10 fade-up" style={{ animationDelay: '.3s' }}>
        <h2 className="h3">Practice</h2>
        <p className="muted small">Run a practice SOS any time. Nobody is alerted and no SMS goes out.</p>
        <div className="row gap8">
          <button className="btn ghost grow" onClick={onPractice}><Icon name="radar" size={16} /> Practice SOS</button>
          <button className="btn ghost grow" onClick={onReplayIntro}>Replay intro</button>
        </div>
      </section>

      <section className="col gap6 fade-up about" style={{ animationDelay: '.35s' }}>
        <span className="muted xsmall">Sakhi beta 0.2 · Map data, places and routes © OpenStreetMap contributors (ODbL), routing by OSRM.</span>
        <span className="muted xsmall">Sakhi helps you get help faster. It does not replace the police. In danger, call 112.</span>
      </section>
    </div>
  );
}
