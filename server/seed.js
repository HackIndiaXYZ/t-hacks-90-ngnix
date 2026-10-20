import crypto from 'node:crypto';
import { db, tx } from './db.js';
import { parseTags } from './util.js';

const lat0 = Number(process.argv[2] ?? 12.9716);
const lng0 = Number(process.argv[3] ?? 77.5946);
if (!Number.isFinite(lat0) || !Number.isFinite(lng0)) {
  console.error('Usage: npm run seed -- <lat> <lng>');
  process.exit(1);
}

const at = (dx, dy) => ({ lat: lat0 + dy / 111320, lng: lng0 + dx / (111320 * Math.cos((lat0 * Math.PI) / 180)) });
const H = 36e5;
const samples = [
  [-600, 450, 'Station Road', 'Alert', 2, 'East exit is pitch dark after 9', 'Streetlights are out near the east exit. I waited and walked out with a group. #PoorlyLit #AvoidAtNight', 2, 24],
  [-520, 380, 'Station Road', 'Alert', 1, 'Followed from platform 2', 'Reported it to railway police and they came fast. Stay near the help desk. #Harassment #PoliceNearby', 70, 52],
  [-680, 520, 'Station Road', 'Review', 3, 'Busy in the morning, fine', 'Lots of office crowd before 10. Women-only coach queue is marked. #Crowded #WomenCoach', 120, 9],
  [420, -120, 'Market Street', 'Review', 3, 'Fine by day, careful at night', 'Busy and friendly till 8. A few men hang around the back parking lot later. Stick to the main side. #Crowded #StayAlert', 26, 17],
  [480, -60, 'Market Street', 'Tip', 0, 'Pharmacy open till midnight', 'The pharmacy at the corner is open late and the owner is helpful if you need to wait for a cab. #SafeSpot', 40, 11],
  [-80, -520, 'Lake Park', 'Review', 5, 'Felt safe jogging till 8', 'Patrol van parks at the main gate every evening and the path is lit all the way. #WellLit #PoliceNearby #SafeForSolo', 5, 41],
  [20, -600, 'Lake Park', 'Tip', 4, 'Women-driven autos at the north gate', 'Prepaid auto stand with women drivers from 6 to 10 pm. #SafeRide #SafeForSolo', 30, 33],
  [-150, -470, 'Lake Park', 'Review', 4, 'Good for evening walks', 'Families everywhere till 9. The back lane by the boathouse is empty though. #WellLit #StayAlert', 200, 14],
  [250, 300, 'College Road', 'Review', 4, 'Well lit and busy', 'Students around till late, tea stalls open, guards at both gates. #WellLit #Crowded', 50, 19],
  [300, 360, 'College Road', 'Alert', 0, 'Bike riders passing comments', 'Two guys on a bike near the bus stop around 7 pm. Reported on 112. #Harassment', 9, 21],
  [-300, 50, 'Metro Exit B', 'Review', 2, 'Underpass feels unsafe', 'The underpass to exit B has no lights and no guard. Use exit A even if longer. #PoorlyLit #AvoidAtNight', 15, 28],
  [-260, 90, 'Metro Exit B', 'Tip', 0, 'Use exit A after dark', 'Exit A has a police booth and auto stand. #PoliceNearby #SafeRide', 18, 12],
];

const fakeAuthor = () => crypto.randomBytes(12).toString('hex');
const now = Date.now();
tx(() => {
  const addPost = db.prepare('INSERT INTO posts (author, lat, lng, place, flair, rating, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const addTag = db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag) VALUES (?, ?)');
  const addVote = db.prepare('INSERT OR IGNORE INTO votes (post_id, voter, value) VALUES (?, ?, 1)');
  const addComment = db.prepare('INSERT INTO comments (post_id, author, body, created_at) VALUES (?, ?, ?, ?)');
  for (const [dx, dy, place, flair, rating, title, body, ageH, votes] of samples) {
    const p = at(dx, dy);
    const created = now - ageH * H;
    const id = Number(addPost.run(fakeAuthor(), p.lat, p.lng, place, flair, rating, title, body, created).lastInsertRowid);
    for (const t of parseTags(`${title} ${body}`)) addTag.run(id, t);
    for (let i = 0; i < votes; i++) addVote.run(id, fakeAuthor());
    if (votes > 20) addComment.run(id, fakeAuthor(), 'Thank you for posting this. Stay safe.', created + H);
  }
});
console.log(`Added ${samples.length} sample posts around ${lat0}, ${lng0}`);
