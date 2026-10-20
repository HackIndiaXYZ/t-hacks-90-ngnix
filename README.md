# Sakhi (beta 0.2)

A women's safety app. It has an anonymous, Reddit-style community for place reviews with #hashtags,
a live safety map built from those reviews, a one-tap SOS that works without internet, a journey
tracker that raises an SOS on its own when the phone goes quiet, and help finders for the nearest
police and hospitals. It is built only on open-source software and free open data.

## Run it

Needs Node 22.13 or newer (it uses Node's built-in SQLite).

```bash
npm install
npm run seed      # optional: sample posts around central Bengaluru
npm run dev       # app on http://localhost:5173, API on :8787
npm test          # end-to-end API tests on a throwaway database
```

Seed around your own area with `npm run seed -- <lat> <lng>`.

Production: `npm run build && npm start` serves the app and API together on `PORT` (default 8787).
Data lives in `data/sakhi.db`.

## Features

**First run**: a six-step onboarding (what Sakhi does, location, trusted contacts, nearby alerts) that
ends with a **practice SOS**. Practice runs the real screens but alerts nobody and sends nothing.

**Community and safety map**
- Review / Alert / Tip posts with 1–5 star ratings and `#hashtags`, votes, replies, Hot / New / Top /
  Nearest sorting, trending tags, filters by tag or place (`r/PlaceName`).
- Place names are suggested from OpenStreetMap for the spot being reviewed.
- Anonymous: each phone gets a random id; the server stores only a keyed hash of it.
- Moderation: posts can be reported with a reason. A post reported by 3 people is hidden.
- Safety score 0–100 = distance- and recency-weighted average rating; shown as a heatmap.

**SOS**
- 5-second cancellable countdown, then an SMS with a map link to every trusted contact (works with
  no internet), a live alert to Sakhi users within 200 m, and a live tracking page `/track/<id>`.
- **Push alerts**: people who turn on nearby alerts get the SOS as a notification even when Sakhi
  is closed (Web Push, VAPID).
- The app installs to the home screen and **opens offline**, so SOS and helplines work in a dead zone.

**Journey (dead-man's switch)**: name a destination, optionally add cab details (service, vehicle
number, driver). Tap "I'm safe" every 10 minutes. If the deadline passes, even with the phone off,
the **server** raises the SOS, alerts people nearby, and texts the contacts (when SMS is set up).
The ride details go out in every SOS message.

**Help**: Indian helplines (112, 1091, 181, 100, 108, 1930) built into the app, so they work offline.
Nearest police stations (women's desks marked when OpenStreetMap names them) and hospitals,
with a walking route on the map. **Fake call**: a realistic incoming call now, in 30 s or in 2 min,
with ringtone and a spoken voice, to leave an uncomfortable situation politely.

## Open source and open data used

| Piece | Project | Licence |
| --- | --- | --- |
| UI | React, Vite | MIT |
| Maps | Leaflet; OpenStreetMap tiles | BSD-2; ODbL data |
| Places / search | Nominatim (OpenStreetMap) | ODbL data |
| Police and hospitals | Overpass API (OpenStreetMap) | ODbL data |
| Walking routes | OSRM (routing.openstreetmap.de) | BSD-2; ODbL data |
| Offline / push | Workbox via vite-plugin-pwa; web-push | MIT |
| Server | Express, Node built-in SQLite | MIT |

The public OpenStreetMap services have fair-use policies. Sakhi caches answers (nearby help per
~1 km area for 24 h, also on disk), rate-limits users, and queues Nominatim to 1 request per second.
For real traffic, point the env vars below at your own instances.

## Settings (environment variables)

| Variable | What it does |
| --- | --- |
| `PORT` | Port for `npm start` (default 8787) |
| `SAKHI_SECRET` | Key for hashing device ids. Set a long random value in production |
| `PUBLIC_URL` | Public address (e.g. `https://sakhi.example.com`) used in server-sent SMS links |
| `SMS_PROVIDER=twilio`, `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM` | Lets the server text contacts on a journey auto-SOS. Without these, the SMS is only logged. Indian numbers need DLT registration |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push keys. If unset, a key pair is generated once and stored in the database |
| `SAKHI_JOURNEY_TIMEOUT_MS` | Check-in window (default 600000 = 10 min). The `sakhi-fast-journey` preview config uses 90 s |
| `NOMINATIM_URL`, `OVERPASS_URL` (comma-separated), `OSRM_FOOT_URL`, `OSM_USER_AGENT` | Use your own OpenStreetMap services instead of the public ones |
| `SAKHI_DATA_DIR` | Where the SQLite database lives (default `data/`) |

## Limits of this beta

- **Phones need HTTPS** for GPS, push and offline install. `http://<your-ip>:5173` on a phone will
  not get a location. Deploy it, or use an HTTPS tunnel (e.g. `cloudflared tunnel --url http://localhost:5173`).
- **Sending the SOS SMS needs one tap.** Browsers can fill the message but cannot press Send. Fully
  automatic SMS from the phone needs a native Android app.
- **Push on iPhone** works only after the user adds Sakhi to the Home Screen (iOS 16.4+).
- **OpenStreetMap data can be incomplete.** Some police stations or women's desks may be missing.
  The first nearby-help search in a new area can take up to ~20 s while the public servers answer.
- **Not built**: cab checks against challan records (needs government API access), voice SOS with
  scream detection.
