import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { avatarColor, distanceLabel, placeSub, tagsIn, timeAgo } from '../lib/format.js';
import { Icon, Stars } from '../components/Icon.jsx';

const FLAIR = { Review: 'flair-review', Alert: 'flair-alert', Tip: 'flair-tip' };

function Body({ text, onTag }) {
  const parts = String(text).split(/(#[\p{L}\p{N}_]{2,30})/gu);
  return (
    <p className="post-body">
      {parts.map((p, i) =>
        p.startsWith('#') ? (
          <button key={i} className="inline-tag" onClick={() => onTag(p.slice(1))}>{p}</button>
        ) : (
          p
        ),
      )}
    </p>
  );
}

export default function PostCard({ post, delay, onTag, onPlace, onToast, onDeleted }) {
  const [p, setP] = useState(post);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [flagging, setFlagging] = useState(false);

  useEffect(() => setP(post), [post]);

  async function flag(reason) {
    try {
      await api(`/posts/${p.id}/flag`, { method: 'POST', body: { reason } });
      onDeleted(p.id);
      onToast('Reported. Thank you for keeping Sakhi safe.');
    } catch (e) {
      onToast(e.message);
    }
    setFlagging(false);
  }

  async function vote(v) {
    const next = p.myVote === v ? 0 : v;
    const prev = p;
    setP({ ...p, myVote: next, score: p.score - p.myVote + next });
    try {
      const r = await api(`/posts/${p.id}/vote`, { method: 'POST', body: { value: next } });
      setP((x) => ({ ...x, score: r.score, myVote: r.myVote }));
    } catch (e) {
      setP(prev);
      onToast(e.message);
    }
  }

  async function toggleComments() {
    setOpen((o) => !o);
    if (comments) return;
    try {
      const r = await api(`/posts/${p.id}/comments`);
      setComments(r.comments);
    } catch (e) {
      onToast(e.message);
      setComments([]);
    }
  }

  async function sendReply(e) {
    e.preventDefault();
    const body = reply.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const r = await api(`/posts/${p.id}/comments`, { method: 'POST', body: { body } });
      setComments((c) => [...(c || []), r.comment]);
      setP((x) => ({ ...x, comments: x.comments + 1 }));
      setReply('');
    } catch (err) {
      onToast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const text = `${p.title} (${placeSub(p.place)} on Sakhi)`;
    try {
      if (navigator.share) await navigator.share({ title: 'Sakhi', text });
      else {
        await navigator.clipboard.writeText(text);
        onToast('Copied to clipboard');
      }
    } catch {
    }
  }

  async function remove() {
    if (!window.confirm('Delete your post? This cannot be undone.')) return;
    try {
      await api(`/posts/${p.id}`, { method: 'DELETE' });
      onDeleted(p.id);
      onToast('Post deleted');
    } catch (e) {
      onToast(e.message);
    }
  }

  const initial = p.author.slice(2, 3).toUpperCase();
  const inBody = new Set(tagsIn(p.body).map((t) => t.toLowerCase()));
  const extraTags = p.tags.filter((t) => !inBody.has(t.toLowerCase()));

  return (
    <article className="post fade-up" style={{ animationDelay: delay }}>
      <header className="row gap10">
        <span className="avatar" style={{ background: avatarColor(p.author) }}>{initial}</span>
        <div className="grow min0">
          <button className="sub-link" onClick={() => onPlace(p.place)}>{placeSub(p.place)}</button>
          <div className="muted xsmall">
            {p.author}{p.mine ? ' (you)' : ''} · {timeAgo(p.createdAt)}
            {p.distance != null ? ` · ${distanceLabel(p.distance)}` : ''}
          </div>
        </div>
        <span className={`flair ${FLAIR[p.flair]}`}>{p.flair}</span>
      </header>

      {p.rating > 0 && <Stars value={p.rating} />}
      <h3 className="post-title">{p.title}</h3>
      {p.body && <Body text={p.body} onTag={onTag} />}
      {extraTags.length > 0 && (
        <div className="wrap gap6">
          {extraTags.map((t) => (
            <button key={t} className="tag" onClick={() => onTag(t)}>#{t}</button>
          ))}
        </div>
      )}

      <footer className="row gap8">
        <div className="vote">
          <button onClick={() => vote(1)} aria-label="Upvote" aria-pressed={p.myVote === 1} className={p.myVote === 1 ? 'up on' : 'up'}>
            <Icon name="up" size={18} />
          </button>
          <span className={p.myVote === 1 ? 'up-text' : p.myVote === -1 ? 'down-text' : ''}>{p.score}</span>
          <button onClick={() => vote(-1)} aria-label="Downvote" aria-pressed={p.myVote === -1} className={p.myVote === -1 ? 'down on' : 'down'}>
            <Icon name="down" size={18} />
          </button>
        </div>
        <button className="pill-btn" onClick={toggleComments} aria-expanded={open}>
          <Icon name="comment" size={16} /> {p.comments}
        </button>
        <span className="grow" />
        {p.mine ? (
          <button className="round-btn" onClick={remove} aria-label="Delete post"><Icon name="trash" size={16} /></button>
        ) : (
          <button className="round-btn" onClick={() => setFlagging((f) => !f)} aria-label="Report post" aria-expanded={flagging}><Icon name="flag" size={16} /></button>
        )}
        <button className="round-btn" onClick={share} aria-label="Share post"><Icon name="share" size={16} /></button>
      </footer>

      {flagging && (
        <section className="flag-box fade-up" aria-label="Report this post">
          <span className="small"><b>Why are you reporting this?</b> Posts reported by 3 people are hidden.</span>
          <div className="wrap gap6">
            {[['harassment', 'Harassment or hate'], ['personal', 'Names or shames a person'], ['false', 'False information'], ['spam', 'Spam'], ['other', 'Other']].map(([k, label]) => (
              <button key={k} className="chip sm" onClick={() => flag(k)}>{label}</button>
            ))}
          </div>
        </section>
      )}

      {open && (
        <section className="comments fade-up">
          {comments === null && <p className="muted small">Loading…</p>}
          {comments?.length === 0 && <p className="muted small">No replies yet.</p>}
          {comments?.map((c) => (
            <div key={c.id} className="comment">
              <span className="avatar sm" style={{ background: avatarColor(c.author) }}>{c.author.slice(2, 3).toUpperCase()}</span>
              <div className="bubble">
                <b className="xsmall">{c.author}{c.mine ? ' (you)' : ''} · {timeAgo(c.createdAt)}</b>
                <div>{c.body}</div>
              </div>
            </div>
          ))}
          <form className="row gap8" onSubmit={sendReply}>
            <label className="sr-only" htmlFor={`reply-${p.id}`}>Reply</label>
            <input id={`reply-${p.id}`} className="input pill grow" value={reply} maxLength={500} onChange={(e) => setReply(e.target.value)} placeholder="Reply anonymously" />
            <button className="send-btn" aria-label="Send reply" disabled={busy || !reply.trim()}><Icon name="send" size={18} /></button>
          </form>
        </section>
      )}
    </article>
  );
}
