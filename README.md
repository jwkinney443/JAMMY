# 🎵 JAMMY — The Music Guessing Game

A Wordle-style music guessing game where you identify songs from progressively longer audio clips. Play a new random song every round, compete on the shared daily challenge, or send a custom song to a friend.

**[▶ Play it live](https://jammygame.up.railway.app/)**

---

## Features

- **Endless Mode** — infinite random songs pulled from Deezer genre charts, new track every round
- **Daily Mode** — one song per day, same for every player worldwide (seeded by date), with shareable emoji results
- **Challenge Mode** — pick any song, generate a link, send it to a friend to guess; they can reply with their own challenge
- **Admin Panel** — password-protected `/admin` page to pin a specific track as the daily song, with real-time SSE sync to all connected clients
- **Progressive clip reveal** — wrong guess or skip unlocks a longer clip: 1s → 2s → 4s → 7s → 11s → 16s
- **Streak tracking** — persistent local streak counter across sessions
- **Multi-platform links** — after each round, links to Deezer, YouTube Music, and Spotify are resolved and shown

---

## Tech Stack

**Backend**
- Node.js (no framework — raw `http` module)
- Deezer API — track search, chart data, audio previews
- Spotify API — OAuth client credentials flow for resolving direct Spotify track links
- Server-Sent Events (SSE) for real-time admin → client daily track updates
- File-based daily override persistence (`daily-override.json`)

**Frontend**
- Vanilla JavaScript (no framework)
- CSS custom properties with full mobile/responsive support
- LocalStorage for daily result persistence and streak tracking
- `requestAnimationFrame`-based audio progress rendering

---

## Running Locally

### Prerequisites
- Node.js v18+
- Deezer API access (free, no key required for public endpoints)
- Spotify Developer credentials (for Spotify link resolution)

### Setup

```bash
git clone https://github.com/jwkinney443/JAMMY.git
cd JAMMY
```

Create a `.env` file in the root:

```env
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
ADMIN_PASSWORD=your_admin_password
PORT=3000
```

Start the server:

```bash
node server.js
```

Visit `http://localhost:3000`

---

## Project Structure

```
JAMMY/
├── server.js          # HTTP server, API routes, SSE, Spotify/Deezer integration
├── public/
│   ├── index.html     # Main game UI (all three modes)
│   ├── game.js        # Game logic — endless, daily, and challenge modes
│   ├── style.css      # All styles, mobile-first
│   └── admin.html     # Admin panel for setting daily track override
└── daily-override.json  # Auto-generated; stores today's pinned track if set
```

---

## How the Daily Mode Works

Every player worldwide gets the same song each day. The track is selected using a seeded LCG random number generator keyed to the current date (`YYYYMMDD`), so no coordination or database is needed — the seed deterministically picks the same track for everyone.

If an admin pins a specific track via the admin panel, it overrides the seeded random. All connected clients receive the update instantly via SSE and reload the daily track without a page refresh.

Completed daily results are saved to `localStorage` and restored on return visits, including the full guess history and emoji share block.

---

## Challenge Mode

Pick any song from the search and click **Generate Challenge Link**. This creates a URL with a `?c=<track_id>` parameter. When a friend opens the link, the game loads that specific track for them to guess. After they finish, they can generate a reply link with their own song pick.

---

## Deployment

Deployed on [Railway](https://railway.app/). Environment variables are set via the Railway dashboard. The app binds to `process.env.PORT` automatically.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search?q=` | Search tracks via Deezer |
| GET | `/api/track/:id` | Fetch single track by Deezer ID |
| GET | `/api/chart?genre=` | Fetch top tracks for a genre |
| GET | `/api/spotify?artist=&title=` | Resolve Spotify link for a track |
| GET | `/api/daily-override` | Get today's pinned track (if set) |
| GET | `/api/daily-events` | SSE stream for real-time override updates |
| POST | `/api/admin/set-daily` | Pin a track as today's daily (auth required) |
| POST | `/api/admin/clear-daily` | Remove today's override (auth required) |
