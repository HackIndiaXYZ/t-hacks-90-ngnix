import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.jsx';
import { speakScript, startRinging, stopRinging } from '../lib/fakecall.js';

export default function FakeCall({ caller, onEnd }) {
  const [phase, setPhase] = useState('ringing');
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    if (phase !== 'ringing') return;
    startRinging();
    return stopRinging;
  }, [phase]);

  useEffect(() => {
    if (phase !== 'talking') return;
    const stop = speakScript();
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => {
      stop();
      clearInterval(t);
    };
  }, [phase]);

  const end = () => {
    stopRinging();
    onEnd();
  };

  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');

  return (
    <div className="fake-call dim-in" role="dialog" aria-label={`Incoming call from ${caller}`}>
      <div className="fc-top">
        <span className="fc-sub">{phase === 'ringing' ? 'Mobile · incoming call' : `${mm}:${ss}`}</span>
        <h2 className="fc-name">{caller}</h2>
      </div>
      <div className={phase === 'ringing' ? 'fc-avatar ring' : 'fc-avatar'}>{caller.charAt(0).toUpperCase()}</div>
      <span className="grow" />
      {phase === 'ringing' ? (
        <div className="fc-actions">
          <button className="fc-btn decline" onClick={end} aria-label="Decline">
            <Icon name="phoneOff" size={30} />
          </button>
          <button className="fc-btn accept" onClick={() => { stopRinging(); setPhase('talking'); }} aria-label="Accept">
            <Icon name="phone" size={30} />
          </button>
        </div>
      ) : (
        <div className="fc-actions single">
          <button className="fc-btn decline" onClick={end} aria-label="End call">
            <Icon name="phoneOff" size={30} />
          </button>
        </div>
      )}
    </div>
  );
}
