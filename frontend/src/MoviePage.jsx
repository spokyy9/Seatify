import React, { useState, useEffect } from 'react';
import { API_URL } from './api';
export default function MoviePage({ movie, setPage, setSelectedShow, user }) {
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTheatre, setSelectedTheatre] = useState('All');
  const [shows, setShows] = useState([]);
  const [loadingShows, setLoadingShows] = useState(true);
  const [editShow, setEditShow] = useState(null);
  const [showForm, setShowForm] = useState({ date: '', time: '', type: 'Standard', priceRegular: '', duration: '' });

  const fetchShows = async () => {
    try {
      setLoadingShows(true);
      const res = await fetch(`${API_URL}/api/shows/${movie.id}`);
      const data = await res.json();
      setShows(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('❌ Fetch shows failed:', err);
      setShows([]);
    } finally {
      setLoadingShows(false);
    }
  };

  useEffect(() => {
    setSelectedDate(null);
    setSelectedTheatre('All');
    fetchShows();
  }, [movie.id]);

  const dates = [...new Set(shows.map(s => s.date))];
  const activeDate = selectedDate || dates[0] || '';
  const filteredShows = shows.filter(s => s.date === activeDate && (selectedTheatre === 'All' || s.theatre === selectedTheatre));
  const theatres = [...new Set(shows.map(s => s.theatre))];

  const typeColors = { Standard: 'var(--muted)', Premium: 'var(--gold)', Recliner: '#60C0FF', Couple: '#B060FF' };

  const startEditShow = (show) => {
    setEditShow(show);
    setShowForm({
      date: show.date,
      time: show.time,
      type: show.type,
      priceRegular: show.priceRegular,
      duration: show.duration || '',
    });
  };

  const saveShow = async () => {
    if (!editShow) return;
    try {
      const res = await fetch(`${API_URL}/api/shows/${editShow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: showForm.date,
          time: showForm.time,
          seatType: showForm.type,
          priceRegular: Number(showForm.priceRegular) || 0,
          pricePremium: Number(showForm.priceRegular) || 0,
          duration: Number(showForm.duration) || editShow.duration || 0
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update show');
      setEditShow(null);
      fetchShows();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not update show');
    }
  };

  const deleteShow = async (showId) => {
    if (!window.confirm('Delete this showtime?')) return;
    try {
      const res = await fetch(`${API_URL}/api/shows/${showId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to delete show');
      fetchShows();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not delete show');
    }
  };

  return (
    <div className="page">
      <div style={{ height: 320, position: 'relative', overflow: 'hidden' }}>
        <img src={movie.banner} alt={movie.title} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.25)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, var(--bg))' }} />
        <button className="btn btn-ghost" style={{ position: 'absolute', top: 20, left: 40 }} onClick={() => setPage('home')}>← Back</button>
      </div>

      <div style={{ padding: '0 40px 60px', marginTop: -120, position: 'relative' }}>
        <div style={{ display: 'flex', gap: 40, alignItems: 'flex-end', marginBottom: 48 }}>
          <img src={movie.poster} alt={movie.title} style={{ width: 160, borderRadius: 4, border: '2px solid var(--border)', flexShrink: 0, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {movie.genre && <span className="badge badge-gold">{movie.genre}</span>}
              {movie.language && <span className="badge badge-gold">{movie.language}</span>}
              {movie.rated && <span className="badge badge-gold">{movie.rated}</span>}
            </div>
            <h1 style={{ fontSize: 42, fontWeight: 900, marginBottom: 8 }}>{movie.title}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: 'var(--muted)', marginBottom: 12 }}>
              {movie.rating != null && (
                <span style={{ color: 'var(--gold)', fontWeight: 600 }}>★ {movie.rating}</span>
              )}
              {movie.duration != null && <><span>·</span><span>{movie.duration} minutes</span></>}
            </div>
            <p style={{ color: 'rgba(237,232,223,0.7)', fontSize: 17, fontStyle: 'italic', maxWidth: 520, lineHeight: 1.7 }}>{movie.desc}</p>
          </div>
        </div>

        {user?.role === 'admin' && (
          <div style={{ marginBottom: 32, padding: 20, background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 4 }}>
            <h3 style={{ fontSize: 18, marginBottom: 12, color: 'var(--gold)' }}>Admin showtime editor</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>Edit or delete showtimes directly from the film page.</p>
            {editShow ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, marginBottom: 6 }}>Date</label>
                  <input className="input-field" type="date" value={showForm.date} onChange={e => setShowForm(prev => ({ ...prev, date: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, marginBottom: 6 }}>Time</label>
                  <input className="input-field" type="time" value={showForm.time} onChange={e => setShowForm(prev => ({ ...prev, time: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, marginBottom: 6 }}>Seat Formation</label>
                  <select className="input-field" value={showForm.type} onChange={e => setShowForm(prev => ({ ...prev, type: e.target.value }))}>
                    {['Standard', 'Premium', 'Recliner', 'Couple'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, marginBottom: 6 }}>Price</label>
                  <input className="input-field" type="number" value={showForm.priceRegular} onChange={e => setShowForm(prev => ({ ...prev, priceRegular: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, marginBottom: 6 }}>Duration (mins)</label>
                  <input className="input-field" type="number" value={showForm.duration} onChange={e => setShowForm(prev => ({ ...prev, duration: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <button className="btn btn-gold" onClick={saveShow}>Save show</button>
                  <button className="btn btn-outline" onClick={() => setEditShow(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>Click Edit on a show below to change its date, time, seat formation, or price.</p>
            )}
          </div>
        )}

        <h2 style={{ fontSize: 13, fontFamily: "'DM Mono',monospace", letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 20 }}>Select Date</h2>
        <div style={{ display: 'flex', gap: 10, marginBottom: 32, flexWrap: 'wrap' }}>
          {dates.length === 0 ? (
            <span style={{ color: 'var(--muted)' }}>No showtimes found.</span>
          ) : dates.map(d => (
            <button key={d} className={`btn ${activeDate === d ? 'btn-gold' : 'btn-ghost'}`} style={{ padding: '8px 20px' }} onClick={() => setSelectedDate(d)}>{d}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 32, flexWrap: 'wrap' }}>
          {['All', ...theatres].map(t => (
            <button key={t} className={`btn ${selectedTheatre === t ? 'btn-outline' : 'btn-ghost'}`} style={{ padding: '7px 16px' }} onClick={() => setSelectedTheatre(t)}>{t}</button>
          ))}
        </div>

        {loadingShows ? (
          <p style={{ color: 'var(--muted)' }}>Loading showtimes…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {filteredShows.length === 0 && <p style={{ color: 'var(--muted)', fontStyle: 'italic' }}>No shows available for this selection.</p>}
            {filteredShows.map(show => (
              <div key={show.id} style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 4, padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 600 }}>{show.theatre}</h3>
                    <span style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: typeColors[show.type] || 'var(--muted)', padding: '2px 8px', border: `1px solid ${typeColors[show.type] || 'var(--border2)'}`, borderRadius: 1 }}>{show.type}</span>
                  </div>
                  <p style={{ color: 'var(--muted)', fontSize: 14, fontFamily: "'DM Mono',monospace" }}>{show.location} · Screen {show.screenId}</p>
                </div>
                <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--cream)' }}>{show.time}</div>
                    <div style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: 'var(--muted)' }}>{show.date}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontFamily: "'DM Mono',monospace", color: 'var(--muted)', marginBottom: 4 }}>From ₹{show.priceRegular}</div>
                    {user?.role === 'admin' ? (
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button className="btn btn-gold" style={{ padding: '10px 18px' }} onClick={() => startEditShow(show)}>Edit</button>
                        <button className="btn btn-danger" style={{ padding: '10px 18px' }} onClick={() => deleteShow(show.id)}>Delete</button>
                      </div>
                    ) : (
                      <button className="btn btn-gold" onClick={() => { setSelectedShow({ ...show, movie }); setPage('seats'); }}>
                        Select Seats
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
