import { useCallback, useEffect, useRef, useState } from 'react';
import { api, qs } from './lib/api.js';
import { load, save } from './lib/device.js';
import { metersBetween } from './lib/format.js';
import { primeAudio } from './lib/fakecall.js';
import { useLocation } from './hooks/useLocation.js';
import { useOnline } from './hooks/useOnline.js';
import { useSos } from './hooks/useSos.js';
import { useStream } from './hooks/useStream.js';
import { useJourney } from './hooks/useJourney.js';
import { usePush } from './hooks/usePush.js';
import Journey, { JourneyPill } from './screens/Journey.jsx';
import { Icon } from './components/Icon.jsx';
import Home from './screens/Home.jsx';
import Community from './screens/Community.jsx';
import Compose from './screens/Compose.jsx';
import MapScreen from './screens/MapScreen.jsx';
import Help from './screens/Help.jsx';
import Settings from './screens/Settings.jsx';
import Onboarding from './screens/Onboarding.jsx';
import FakeCall from './screens/FakeCall.jsx';
import NearbyAlert from './screens/NearbyAlert.jsx';
import { SosActive, SosCountdown, SosSending } from './screens/SosOverlay.jsx';

const TABS = [
  ['home', 'Home', 'home'],
  ['community', 'Community', 'chat'],
  null,
  ['help', 'Help', 'help'],
  ['settings', 'You', 'user'],
];

export default function App() {
  const { loc, status, setManual, retryGps, getFix } = useLocation();
  const online = useOnline();
  const push = usePush(loc);
  const [onboarded, setOnboarded] = useState(() => load('sakhi.onboarded', false));
  const [obMap, setObMap] = useState(false);
  const [obStep, setObStep] = useState(0);
  const [tab, setTabState] = useState('home');
  const [contacts, setContactsState] = useState(() => load('sakhi.contacts', []));
  const [caller, setCallerState] = useState(() => load('sakhi.caller', 'Mom'));
  const [me, setMe] = useState(null);
  const [toast, setToast] = useState(null);
  const [compose, setCompose] = useState(null);
  const [mapMode, setMapMode] = useState(null);
  const [filter, setFilter] = useState({ tag: null, place: null });
  const [refreshKey, setRefreshKey] = useState(0);
  const [nearby, setNearby] = useState([]);
  const [dismissed, setDismissed] = useState(() => new Set());
  const [pinned, setPinned] = useState(null);
  const [fakeCallAt, setFakeCallAt] = useState(null);
  const [calling, setCalling] = useState(false);
  const toastTimer = useRef();
  const locRef = useRef(loc);
  locRef.current = loc;

  const showToast = useCallback((m) => {
    setToast({ m, k: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const setTab = (t) => {
    setTabState(t);
    setMapMode(null);
    setPinned(null);
    window.scrollTo({ top: 0 });
  };
  const setContacts = (c) => {
    setContactsState(c);
    save('sakhi.contacts', c);
  };
  const setCaller = (c) => {
    setCallerState(c);
    save('sakhi.caller', c);
  };

  useEffect(() => {
    api('/me').then((r) => setMe(r.name)).catch(() => {});
  }, []);

  const sosRef = useRef(null);
  const journey = useJourney({ loc, contacts, onToast: showToast, onAutoSos: (id) => sosRef.current?.adopt(id) });
  const sos = useSos({ loc, getFix, contacts, ride: journey.journey?.ride, onToast: showToast });
  sosRef.current = sos;
  const resolveSos = async () => {
    await sos.resolve();
    if (journey.journey) journey.refresh();
  };

  const addNearby = useCallback((data) => {
    setNearby((list) => [...list.filter((x) => x.id !== data.id), data]);
  }, []);

  useStream(loc, (type, data) => {
    if (type === 'post') return setRefreshKey((k) => k + 1);
    if (type === 'sos' || type === 'sos-update') {
      addNearby(data);
      if (type === 'sos') navigator.vibrate?.([300, 150, 300, 150, 300]);
    }
    if (type === 'sos-resolved') {
      setNearby((list) => list.filter((x) => x.id !== data.id));
      showToast('The person nearby marked themselves safe');
    }
  });

  const showSosById = useCallback(async (id) => {
    try {
      const { sos: s } = await api(`/sos/${encodeURIComponent(id)}`);
      if (s.resolved) return showToast('That SOS has ended. The person marked themselves safe.');
      const here = locRef.current;
      addNearby({ ...s, distance: here ? Math.round(metersBetween(here, s)) : null });
    } catch {
    }
  }, [addNearby, showToast]);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('sos');
    if (id) {
      showSosById(id);
      history.replaceState(null, '', '/');
    }
    if (!('serviceWorker' in navigator)) return;
    const onMsg = (e) => e.data?.type === 'sos-push' && e.data.sos?.id && showSosById(e.data.sos.id);
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [showSosById]);

  const helpCell = loc ? `${loc.lat.toFixed(2)},${loc.lng.toFixed(2)}` : null;
  useEffect(() => {
    if (!helpCell || !navigator.onLine) return;
    const [lat, lng] = helpCell.split(',');
    api(`/help/nearby?${qs({ lat, lng, radius: 5000 })}`).catch(() => {});
  }, [helpCell]);

  useEffect(() => {
    if (!fakeCallAt) return;
    const t = setTimeout(() => {
      setFakeCallAt(null);
      setCalling(true);
    }, Math.max(0, fakeCallAt - Date.now()));
    return () => clearTimeout(t);
  }, [fakeCallAt]);
  const scheduleFakeCall = (delay) => {
    primeAudio();
    if (delay === 0) setCalling(true);
    else {
      setFakeCallAt(Date.now() + delay * 1000);
      showToast(`Fake call coming in ${delay < 60 ? `${delay} seconds` : `${delay / 60} minutes`}. You can lock your phone.`);
    }
  };

  const openCompose = (at) => setCompose({ at: at || (loc ? { lat: loc.lat, lng: loc.lng, source: loc.source } : null) });
  const pickOnMap = (mode) => {
    setCompose(null);
    setTabState('map');
    setMapMode(mode);
  };
  const fixLocation = () => (loc && status !== 'denied' ? retryGps() : pickOnMap('locate'));
  const onPosted = (post) => {
    setCompose(null);
    setTabState('community');
    setFilter({ tag: null, place: null });
    setPinned(post);
    setRefreshKey((k) => k + 1);
    showToast(post.rating ? `Posted. The safety score around ${post.place} now includes your rating.` : 'Posted anonymously. Thank you.');
  };

  const finishOnboarding = (practice) => {
    save('sakhi.onboarded', true);
    setOnboarded(true);
    setTabState('home');
    if (practice) setTimeout(() => sos.start({ drill: true }), 300);
  };

  const alert = nearby.find((a) => !dismissed.has(a.id));

  const overlays = (
    <>
      {toast && (
        <div key={toast.k} className="toast pop" role="status">
          <Icon name="check" size={18} /> {toast.m}
        </div>
      )}
      {sos.phase === 'countdown' && <SosCountdown count={sos.count} onCancel={sos.cancel} practice={sos.practice} />}
      {sos.phase === 'sending' && <SosSending />}
      {sos.phase === 'active' && sos.sos && (
        <SosActive sos={sos.sos} contacts={contacts} online={online} serverSms={journey.serverSms} onResolve={resolveSos} onToast={showToast} />
      )}
      {calling && <FakeCall caller={caller || 'Mom'} onEnd={() => setCalling(false)} />}
    </>
  );

  if (!onboarded) {
    return (
      <div className="app">
        {obMap ? (
          <main className="main map-main">
            <MapScreen
              loc={loc} status={status} mode="locate" setMode={(m) => !m && setObMap(false)} setManual={setManual} nearbySos={[]}
              onCompose={() => {}} onToast={showToast} refreshKey={0} onOpenPlace={() => {}}
            />
          </main>
        ) : (
          <Onboarding
            step={obStep} setStep={setObStep} status={status} retryGps={retryGps} onPickLocation={() => setObMap(true)}
            contacts={contacts} setContacts={setContacts} push={push} onDone={finishOnboarding} onToast={showToast}
          />
        )}
        {overlays}
      </div>
    );
  }

  return (
    <div className="app">
      <main className={tab === 'map' ? 'main map-main' : 'main'}>
        {tab === 'home' && (
          <Home loc={loc} status={status} online={online} contacts={contacts} journeyLive={!!journey.journey} onSos={() => sos.start()} onCompose={openCompose} onTab={setTab} onFixLocation={fixLocation} refreshKey={refreshKey} />
        )}
        {tab === 'community' && (
          <Community loc={loc} filter={filter} setFilter={setFilter} onCompose={openCompose} onToast={showToast} refreshKey={refreshKey} pinned={pinned} onOpenMap={() => setTab('map')} />
        )}
        {tab === 'map' && (
          <MapScreen
            loc={loc} status={status} mode={mapMode} setMode={setMapMode} setManual={setManual} nearbySos={nearby}
            onCompose={openCompose} onToast={showToast} refreshKey={refreshKey}
            onOpenPlace={(place) => { setFilter({ tag: null, place }); setTab('community'); }}
          />
        )}
        {tab === 'journey' && (
          <Journey j={journey} loc={loc} contacts={contacts} onTab={setTab} onPickLocation={() => pickOnMap('locate')} />
        )}
        {tab === 'help' && (
          <Help
            loc={loc} online={online} caller={caller || 'Mom'} onFakeCall={scheduleFakeCall} fakeCallAt={fakeCallAt}
            onCancelFakeCall={() => setFakeCallAt(null)} onPickLocation={() => pickOnMap('locate')}
          />
        )}
        {tab === 'settings' && (
          <Settings
            me={me} contacts={contacts} setContacts={setContacts} status={status} retryGps={retryGps}
            onPickLocation={() => pickOnMap('locate')} onToast={showToast} push={push} caller={caller} setCaller={setCaller}
            onPractice={() => sos.start({ drill: true })}
            onReplayIntro={() => { save('sakhi.onboarded', false); setObStep(0); setOnboarded(false); }}
          />
        )}
      </main>

      <nav className="nav" aria-label="Main">
        {TABS.map((t) => {
          if (!t) return <button key="sos" className="nav-sos" onClick={() => sos.start()} aria-label="Send SOS">SOS</button>;
          const on = tab === t[0] || (t[0] === 'community' && tab === 'map') || (t[0] === 'home' && tab === 'journey');
          return (
            <button key={t[0]} className={on ? 'nav-btn on' : 'nav-btn'} aria-current={on ? 'page' : undefined} onClick={() => setTab(t[0])}>
              <Icon name={t[2]} size={22} />
              {t[1]}
            </button>
          );
        })}
      </nav>

      {tab !== 'journey' && sos.phase === 'idle' && <JourneyPill j={journey} onOpen={() => setTab('journey')} />}

      {alert && (
        <NearbyAlert
          alert={alert}
          onDismiss={() => setDismissed((s) => new Set(s).add(alert.id))}
          onShowMap={() => { setDismissed((s) => new Set(s).add(alert.id)); setTab('map'); }}
        />
      )}

      {compose && (
        <Compose at={compose.at} me={me} onClose={() => setCompose(null)} onPosted={onPosted} onPickLocation={() => pickOnMap('post')} onToast={showToast} />
      )}

      {overlays}
    </div>
  );
}
