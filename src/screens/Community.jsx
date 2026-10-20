import { useEffect, useState } from 'react';
import { api, qs } from '../lib/api.js';
import { placeSub } from '../lib/format.js';
import { Icon } from '../components/Icon.jsx';
import PostCard from './PostCard.jsx';

const SORTS = [['hot', 'Hot'], ['new', 'New'], ['top', 'Top'], ['near', 'Nearest']];
const SCOPES = [[3000, 'Near me'], [25000, 'My city']];

export default function Community({ loc, filter, setFilter, onCompose, onToast, refreshKey, pinned, onOpenMap }) {
  const [sort, setSort] = useState('hot');
  const [radius, setRadius] = useState(3000);
  const [posts, setPosts] = useState(null);
  const [trending, setTrending] = useState([]);
  const [error, setError] = useState(null);

  const center = loc ? { lat: loc.lat, lng: loc.lng } : {};

  useEffect(() => {
    const ctl = new AbortController();
    setError(null);
    api(`/posts?${qs({ ...center, radius, sort, tag: filter.tag, place: filter.place })}`, { signal: ctl.signal })
      .then((r) => setPosts(r.posts))
      .catch((e) => e.name !== 'AbortError' && setError(e.message));
    api(`/tags/trending?${qs({ ...center, radius })}`, { signal: ctl.signal })
      .then((r) => setTrending(r.tags))
      .catch(() => {});
    return () => ctl.abort();
  }, [loc?.lat, loc?.lng, radius, sort, filter.tag, filter.place, refreshKey]);

  const shown = posts && pinned && !filter.tag && !filter.place ? [pinned, ...posts.filter((p) => p.id !== pinned.id)] : posts;

  const filterLabel =[filter.tag && `#${filter.tag}`, filter.place && placeSub(filter.place)].filter(Boolean).join(' in ');

  return (
    <div className="screen tight">
      <header className="row between fade-up">
        <h1 className="h1">Community</h1>
        <div className="row gap8">
          <button className="btn ghost sm" onClick={onOpenMap}><Icon name="map" size={16} /> Map</button>
          <button className="btn primary sm" onClick={() => onCompose()}>
            <Icon name="plus" size={16} /> Post
          </button>
        </div>
      </header>

      {loc && (
        <div className="seg fade-up" style={{ animationDelay: '.03s' }}>
          {SCOPES.map(([r, label]) => (
            <button key={r} className={radius === r ? 'on' : ''} aria-pressed={radius === r} onClick={() => setRadius(r)}>{label}</button>
          ))}
        </div>
      )}

      {trending.length > 0 && (
        <section className="fade-up" style={{ animationDelay: '.06s' }}>
          <h2 className="eyebrow">Trending tags</h2>
          <div className="hscroll">
            {trending.map((t) => {
              const on = filter.tag?.toLowerCase() === t.tag.toLowerCase();
              return (
                <button key={t.tag} className={on ? 'chip on' : 'chip'} aria-pressed={on} onClick={() => setFilter({ ...filter, tag: on ? null : t.tag })}>
                  #{t.tag} <span className="chip-count">{t.count}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {filterLabel && (
        <div className="banner brand pop">
          <span className="grow">Showing <b>{filterLabel}</b></span>
          <button className="btn white xs" onClick={() => setFilter({ tag: null, place: null })}>Clear</button>
        </div>
      )}

      <div className="row gap8">
        {SORTS.filter(([k]) => k !== 'near' || loc).map(([k, label]) => (
          <button key={k} className={sort === k ? 'sort on' : 'sort'} aria-pressed={sort === k} onClick={() => setSort(k)}>{label}</button>
        ))}
        <span className="grow" />
        {posts && <span className="muted small">{posts.length} {posts.length === 1 ? 'post' : 'posts'}</span>}
      </div>

      {error && <div className="banner warn">{error}</div>}
      {!posts && !error && [0, 1, 2].map((i) => <div key={i} className="post skeleton" />)}
      {posts?.length === 0 && (
        <div className="empty fade-up">
          <Icon name="chat" size={32} />
          <p><b>Nothing here yet.</b><br />Tell others how this place feels.</p>
          <button className="btn primary" onClick={() => onCompose()}>Write the first post</button>
        </div>
      )}
      {shown?.map((p, i) => (
        <PostCard
          key={p.id}
          post={p}
          delay={`${Math.min(i * 0.05, 0.3)}s`}
          onTag={(tag) => setFilter({ tag, place: null })}
          onPlace={(place) => setFilter({ tag: null, place })}
          onToast={onToast}
          onDeleted={(id) => setPosts((list) => list.filter((x) => x.id !== id))}
        />
      ))}
    </div>
  );
}
