(function () {

// ── Constants ─────────────────────────────────────────────────────────────────
const CLIP_DURATIONS = [1, 2, 4, 7, 11, 16];
const MAX_GUESSES    = 6;
const PREVIEW_LENGTH = 30;
// Always use local date so it matches the user's timezone
function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const CHART_GENRES = [0, 0, 0, 0, 132, 132, 152, 116, 165, 113, 197, 106, 169];

const JUNK_TITLE = /\(workout|\(remix|\(remixed|\(live|\(acoustic|\(instrumental|\(karaoke|\(cover|\(tribute|\(originally|\(re-record|\(mix\)|\(extended|\(radio edit/i;

// ── Shared helpers ────────────────────────────────────────────────────────────
function esc(str) {
  return (str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function normalize(s) { return (s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function fmt(s) { return `0:${String(Math.floor(s)).padStart(2, "0")}`; }

async function resolveSpotify(artist, title, linkEl) {
  try {
    const res  = await fetch(`/api/spotify?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`);
    const data = await res.json();
    if (data.url) linkEl.href = data.url;
  } catch {}
}

function renderAcItems(tracks, container, onPick) {
  container.innerHTML = "";
  tracks.forEach(track => {
    const item = document.createElement("div");
    item.className = "ac-item";
    const sub = [track.artist, track.album].filter(Boolean).join(" \u00B7 ");
    item.innerHTML = track.cover
      ? `<img class="ac-thumb" src="${esc(track.cover)}" alt="" loading="lazy"><div class="ac-info"><div class="ac-title">${esc(track.title)}</div><div class="ac-sub">${esc(sub)}</div></div>`
      : `<div class="ac-thumb-placeholder">\u266A</div><div class="ac-info"><div class="ac-title">${esc(track.title)}</div><div class="ac-sub">${esc(sub)}</div></div>`;
    item.addEventListener("mousedown", e => { e.preventDefault(); onPick(track); });
    container.appendChild(item);
  });
  container.classList.add("open");
}

function makeSearchHandler(inputEl, acListEl, onPick, debounceMs = 280) {
  let timer = null;
  inputEl.addEventListener("input", () => {
    const q = inputEl.value.trim();
    clearTimeout(timer);
    if (q.length < 2) { acListEl.classList.remove("open"); return; }
    acListEl.innerHTML = "<div class='ac-msg'>Searching...</div>";
    acListEl.classList.add("open");
    timer = setTimeout(async () => {
      try {
        const res    = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const tracks = await res.json();
        if (!Array.isArray(tracks) || !tracks.length) { acListEl.innerHTML = "<div class='ac-msg'>No results found</div>"; return; }
        renderAcItems(tracks, acListEl, onPick);
      } catch { acListEl.innerHTML = "<div class='ac-msg'>Search error</div>"; }
    }, debounceMs);
  });
}

function makeVolumeControls(audioEl, btnEl, sliderEl) {
  let lastVol = 1;
  const setIcon = () => {
    btnEl.textContent = audioEl.volume === 0 ? "\uD83D\uDD07" : audioEl.volume < 0.5 ? "\uD83D\uDD09" : "\uD83D\uDD0A";
  };
  sliderEl.addEventListener("input", () => {
    audioEl.volume = sliderEl.value;
    if (sliderEl.value > 0) lastVol = parseFloat(sliderEl.value);
    setIcon();
  });
  btnEl.addEventListener("click", () => {
    if (audioEl.volume > 0) {
      lastVol = audioEl.volume; audioEl.volume = 0; sliderEl.value = 0;
    } else {
      audioEl.volume = lastVol; sliderEl.value = lastVol;
    }
    setIcon();
  });
}

const SVG_PLAY  = `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M2 1.5l9 4.5-9 4.5z"/></svg>`;
const SVG_PAUSE = `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 1h2v10H3zM7 1h2v10H7z"/></svg>`;

function makePreviewPlayer(audioEl, btnEl, fillEl, timeEl) {
  let playing = false, raf = null;
  btnEl.innerHTML = SVG_PLAY;
  fillEl.style.width = "0%";
  timeEl.textContent = "0:00 / 0:30";

  function tick() {
    const cur = audioEl.currentTime, total = audioEl.duration || 30;
    fillEl.style.width = (cur / total * 100) + "%";
    timeEl.textContent = `${fmt(cur)} / ${fmt(total)}`;
    if (playing) raf = requestAnimationFrame(tick);
  }
  function stop() {
    audioEl.pause(); playing = false;
    btnEl.innerHTML = SVG_PLAY; btnEl.classList.remove("playing");
    cancelAnimationFrame(raf);
  }
  btnEl.onclick = () => {
    if (playing) { stop(); } else {
      audioEl.currentTime = 0; audioEl.play().catch(() => {});
      playing = true; btnEl.innerHTML = SVG_PAUSE; btnEl.classList.add("playing");
      cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
    }
  };
  audioEl.onended = stop;
  return stop;
}

function makeGuessRow(text, type, num, artistMatch = false) {
  const row  = document.createElement("div");
  row.className = `guess-row ${type}`;
  const icon = type === "correct" ? "\u2713" : type === "skipped" ? "\u21B7" : "\u2717";
  const hint = artistMatch ? `<span class="guess-hint">right artist</span>` : "";
  const numHtml = num ? `<span class="guess-num">${num}</span>` : "";
  row.innerHTML = `<span class="guess-icon">${icon}</span><span class="guess-text">${esc(text)}</span>${hint}${numHtml}`;
  return row;
}

function renderEmptySlots(container) {
  container.innerHTML = "";
  for (let i = 0; i < MAX_GUESSES; i++) {
    const d = document.createElement("div");
    d.className = "guess-empty";
    container.appendChild(d);
  }
}

function addGuessRow(container, row) {
  const empty = container.querySelector(".guess-empty");
  if (empty) empty.replaceWith(row);
}

function updateSegBar(guessCount, segs, timeEl) {
  const secs = CLIP_DURATIONS[Math.min(guessCount, CLIP_DURATIONS.length - 1)];
  timeEl.textContent = secs + "s";
  segs.forEach((s, i) => {
    s.className = "seg";
    if (i < guessCount) s.classList.add("used");
    else if (i === guessCount) s.classList.add("active");
  });
}

async function fetchChart(genre) {
  const res    = await fetch(`/api/chart?genre=${genre}`);
  const tracks = await res.json();
  return Array.isArray(tracks) ? tracks.filter(t => t.preview && !JUNK_TITLE.test(t.title)) : [];
}

async function fetchRandomTrack(excludeIds = new Set()) {
  for (let i = 0; i < 5; i++) {
    const genre = CHART_GENRES[Math.floor(Math.random() * CHART_GENRES.length)];
    try {
      const valid = (await fetchChart(genre)).filter(t => !excludeIds.has(t.id));
      if (valid.length) return valid[Math.floor(Math.random() * valid.length)];
    } catch {}
  }
  return null;
}

function seededRand(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}
function getDaySeed() {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// ── Endless mode ──────────────────────────────────────────────────────────────
const audioEl     = document.getElementById("audio-el");
const albumArt    = document.getElementById("album-art");
const coverOverlay= document.getElementById("cover-overlay");
const bigPlay     = document.getElementById("big-play");
const clipLabel   = document.getElementById("clip-label");
const progFill    = document.getElementById("audio-progress-fill");
const guessInput  = document.getElementById("guess-input");
const acList      = document.getElementById("ac-list");
const skipBtn     = document.getElementById("skip-btn");
const guessesEl   = document.getElementById("guesses");
const resultPanel = document.getElementById("result-panel");
const resultVerdict = document.getElementById("result-verdict");
const resultCover   = document.getElementById("result-cover");
const resultTitle   = document.getElementById("result-title");
const resultArtist  = document.getElementById("result-artist");
const resultAlbum   = document.getElementById("result-album");
const deezerLink    = document.getElementById("deezer-link");
const youtubeLink   = document.getElementById("youtube-link");
const spotifyLink   = document.getElementById("spotify-link");
const statStreak    = document.getElementById("stat-streak");
const streakEl      = document.getElementById("streak-num");
const nextBtn       = document.getElementById("next-btn");
const segs          = [0,1,2,3,4,5].map(i => document.getElementById("seg-" + i));
const segTime       = document.getElementById("seg-time");

let currentTrack = null, guessCount = 0, attemptCount = 0;
let gameOver = false, isPlaying = false;
let clipTimer = null, progressRaf = null, clipStart = 0, clipOffset = 0;
let streak = parseInt(localStorage.getItem("mvdle_streak") || "0");
const playedIds = new Set();

streakEl.textContent = streak;
makeVolumeControls(audioEl, document.getElementById("vol-btn"), document.getElementById("vol-slider"));

function setStatus(msg) { clipLabel.textContent = msg || "Press play to hear the clip"; }

async function loadTrack() {
  setStatus("Loading track...");
  const track = await fetchRandomTrack(playedIds);
  if (!track) { setStatus("Could not load a track. Is the server running?"); return; }
  currentTrack = track;
  playedIds.add(track.id);
  albumArt.src = track.cover;
  audioEl.src  = track.preview;
  clipOffset   = Math.random() * (PREVIEW_LENGTH - CLIP_DURATIONS[CLIP_DURATIONS.length - 1]);
  setStatus("");
  updateSegBar(guessCount, segs, segTime);
}

bigPlay.addEventListener("click", () => { if (!gameOver) isPlaying ? stopClip() : playClip(); });

// Suppress OS/browser media controls so the full track can't be accessed externally
function suppressMediaSession() {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = null;
  navigator.mediaSession.setActionHandler("play",         null);
  navigator.mediaSession.setActionHandler("pause",        null);
  navigator.mediaSession.setActionHandler("seekbackward", null);
  navigator.mediaSession.setActionHandler("seekforward",  null);
  navigator.mediaSession.setActionHandler("previoustrack",null);
  navigator.mediaSession.setActionHandler("nexttrack",    null);
  navigator.mediaSession.setActionHandler("seekto",       null);
}
suppressMediaSession();

function enforceClipLimit(audio, getMaxSecs, onStop) {
  audio.addEventListener("timeupdate", () => {
    const limit = getMaxSecs();
    if (limit !== null && audio.currentTime > limit) {
      audio.pause();
      audio.currentTime = limit;
      onStop();
    }
  });
}

// Wire clip enforcement for endless audio
enforceClipLimit(audioEl,
  () => gameOver ? null : clipOffset + CLIP_DURATIONS[Math.min(guessCount, CLIP_DURATIONS.length - 1)],
  stopClip
);

function playClip() {
  if (!currentTrack) return;
  const secs = CLIP_DURATIONS[Math.min(guessCount, CLIP_DURATIONS.length - 1)];
  audioEl.currentTime = clipOffset;
  audioEl.play().catch(() => setStatus("Tap to enable audio first"));
  isPlaying = true; bigPlay.classList.add("playing");
  setStatus(`Playing ${secs}s clip...`);
  progFill.style.width = "0%"; clipStart = Date.now();
  cancelAnimationFrame(progressRaf);
  (function tick() {
    const pct = Math.min(((Date.now() - clipStart) / (secs * 1000)) * 100, 100);
    progFill.style.width = pct + "%";
    if (pct < 100 && isPlaying) progressRaf = requestAnimationFrame(tick);
  })();
  clearTimeout(clipTimer);
  clipTimer = setTimeout(stopClip, secs * 1000);
}

function stopClip() {
  audioEl.pause(); isPlaying = false; bigPlay.classList.remove("playing");
  clearTimeout(clipTimer); cancelAnimationFrame(progressRaf);
  progFill.style.width = "0%";
  if (!gameOver) setStatus("Press play to hear the clip");
}

makeSearchHandler(guessInput, acList, track => {
  guessInput.value = `${track.title} \u2014 ${track.artist}`;
  acList.classList.remove("open");
  submitGuess(track);
});
document.addEventListener("mousedown", e => { if (!e.target.closest(".guess-area")) acList.classList.remove("open"); });

skipBtn.addEventListener("click", () => {
  if (gameOver) return;
  stopClip(); acList.classList.remove("open");
  addGuessRow(guessesEl, makeGuessRow("\u2014 skipped \u2014", "skipped"));
  attemptCount++; guessCount++;
  guessInput.value = "";
  if (guessCount >= MAX_GUESSES) endGame(false);
  else updateSegBar(guessCount, segs, segTime);
});

function submitGuess(track) {
  if (gameOver || !currentTrack) return;
  stopClip(); acList.classList.remove("open");
  const sameId     = String(track.id) === String(currentTrack.id);
  const sameTitle  = normalize(track.title)  === normalize(currentTrack.title);
  const sameArtist = normalize(track.artist) === normalize(currentTrack.artist);
  const correct    = sameId || (sameTitle && sameArtist);
  const artistMatch = !correct && sameArtist;
  const type        = correct ? "correct" : artistMatch ? "warm" : "wrong";
  addGuessRow(guessesEl, makeGuessRow(`${track.artist} \u2014 ${track.title}`, type, `${guessCount + 1}/6`, artistMatch));
  attemptCount++; guessInput.value = "";
  if (correct) endGame(true);
  else { guessCount++; if (guessCount >= MAX_GUESSES) endGame(false); else updateSegBar(guessCount, segs, segTime); }
}

function endGame(won) {
  gameOver = true; stopClip();
  guessInput.disabled = true; skipBtn.disabled = true;
  if (won) streak++; else streak = 0;
  localStorage.setItem("mvdle_streak", streak); streakEl.textContent = streak;
  albumArt.classList.add("revealed"); coverOverlay.classList.add("hidden");
  const t = currentTrack;
  resultVerdict.textContent = won ? "YOU GOT IT!" : "NICE TRY";
  resultVerdict.className   = "result-verdict " + (won ? "win" : "lose");
  resultCover.src           = t.cover  || "";
  resultTitle.textContent   = t.title  || "\u2014";
  resultArtist.textContent  = t.artist || "\u2014";
  resultAlbum.textContent   = t.album  || "";
  deezerLink.href  = t.deezer || "#";
  youtubeLink.href = `https://music.youtube.com/search?q=${encodeURIComponent(t.artist + " " + t.title)}`;
  spotifyLink.href = `https://open.spotify.com/search/${encodeURIComponent(t.artist + " " + t.title)}/tracks`;
  resolveSpotify(t.artist, t.title, spotifyLink);
  document.getElementById("stat-guesses").textContent = String(attemptCount);
  statStreak.textContent = streak;
  resultPanel.style.display = "block";
  resultPanel.className     = "result-panel " + (won ? "win" : "lose");
  makePreviewPlayer(audioEl,
    document.getElementById("preview-play-btn"),
    document.getElementById("preview-bar-fill"),
    document.getElementById("preview-time")
  );
}

nextBtn.addEventListener("click", () => {
  currentTrack = null; guessCount = 0; attemptCount = 0;
  gameOver = false; isPlaying = false; clipOffset = 0;
  guessInput.disabled = false; guessInput.value = ""; skipBtn.disabled = false;
  albumArt.classList.remove("revealed"); albumArt.src = "";
  coverOverlay.classList.remove("hidden");
  resultPanel.style.display = "none";
  renderEmptySlots(guessesEl);
  updateSegBar(0, segs, segTime);
  const banner = document.getElementById("play-panel").querySelector("[data-challenge-banner]");
  if (banner) banner.remove();
  audioEl.onended = null;
  loadTrack();
});

function initEndless() { renderEmptySlots(guessesEl); }

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.getElementById("play-panel").classList.toggle("hidden", tab !== "play");
  document.getElementById("daily-panel").classList.toggle("active", tab === "daily");
  document.getElementById("challenge-panel").classList.toggle("active", tab === "challenge");
  document.getElementById("tab-play").classList.toggle("active", tab === "play");
  document.getElementById("tab-daily").classList.toggle("active", tab === "daily");
  document.getElementById("tab-challenge").classList.toggle("active", tab === "challenge");
  if (tab === "daily") {
    const today = getTodayKey();
    // Reload if never loaded, or if the date has changed since last load
    if (!dailyState.loaded || dailyState.loadedForDate !== today) {
      // Reset state for new day
      dailyState.loaded = false;
      dailyState.loadedForDate = today;
      dailyState.track = null; dailyState.guessCount = 0; dailyState.attemptCount = 0;
      dailyState.gameOver = false; dailyState.isPlaying = false;
      // Clear the daily panel UI so it rebuilds fresh
      document.getElementById("d-guesses").innerHTML = "";
      document.getElementById("d-result-panel").style.display = "none";
      document.getElementById("d-album-art").className = "game-art";
      document.getElementById("d-cover-overlay").className = "game-overlay";
      document.getElementById("d-guess-input").disabled = false;
      document.getElementById("d-skip-btn").disabled = false;
      loadDaily();
    }
  }
}
document.getElementById("tab-play").addEventListener("click", () => switchTab("play"));
document.getElementById("tab-daily").addEventListener("click", () => switchTab("daily"));
document.getElementById("tab-challenge").addEventListener("click", () => switchTab("challenge"));

// If user returns to the page after midnight, reload daily if date has changed
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    if (dailyState.loadedForDate && dailyState.loadedForDate !== getTodayKey()) {
      dailyState.loaded = false;
      dailyState.loadedForDate = null;
      if (document.getElementById("daily-panel").classList.contains("active")) switchTab("daily");
    }
  }
});

// SSE — instantly detect when admin sets a new override
(function connectOverrideEvents() {
  const es = new EventSource("/api/daily-events");
  es.addEventListener("message", e => {
    const { setAt } = JSON.parse(e.data);
    if (setAt !== dailyState.overrideSetAt) {
      localStorage.removeItem("jammy_daily_" + getTodayKey());
      dailyState.loaded = false;
      dailyState.loadedForDate = null;
      dailyState.overrideSetAt = setAt;
      if (document.getElementById("daily-panel").classList.contains("active")) switchTab("daily");
    }
  });
  // Reconnect if connection drops
  es.onerror = () => { es.close(); setTimeout(connectOverrideEvents, 5000); };
})();

// ── Daily mode ────────────────────────────────────────────────────────────────
const dailyAudio = document.getElementById("daily-audio");
const dailyState = { loaded: false, loadedForDate: null, track: null, guessCount: 0, attemptCount: 0, gameOver: false, isPlaying: false, clipTimer: null, progressRaf: null, clipStart: 0, clipOffset: 0 };
const dSegs      = [0,1,2,3,4,5].map(i => document.getElementById("dseg-" + i));
const dSegTime   = document.getElementById("dseg-time");
const dGuessesEl = document.getElementById("d-guesses");

async function loadDaily() {
  dailyState.loaded = true;
  dailyState.loadedForDate = getTodayKey();
  renderEmptySlots(dGuessesEl);

  // Wire events only once
  if (!dailyState.wired) {
    dailyState.wired = true;
    makeVolumeControls(dailyAudio, document.getElementById("d-vol-btn"), document.getElementById("d-vol-slider"));
    enforceClipLimit(dailyAudio,
      () => dailyState.gameOver ? null : dailyState.clipOffset + CLIP_DURATIONS[Math.min(dailyState.guessCount, CLIP_DURATIONS.length - 1)],
      stopDailyClip
    );
    document.getElementById("d-big-play").addEventListener("click", () => {
      if (!dailyState.gameOver) dailyState.isPlaying ? stopDailyClip() : playDailyClip();
    });
    document.getElementById("d-skip-btn").addEventListener("click", () => {
      if (dailyState.gameOver) return;
      stopDailyClip();
      addGuessRow(dGuessesEl, makeGuessRow("\u2014 skipped \u2014", "skipped"));
      dailyState.attemptCount++; dailyState.guessCount++;
      document.getElementById("d-guess-input").value = "";
      if (dailyState.guessCount >= MAX_GUESSES) endDailyGame(false, false, dailyState.attemptCount);
      else updateSegBar(dailyState.guessCount, dSegs, dSegTime);
    });
    const dInput  = document.getElementById("d-guess-input");
    const dAcList = document.getElementById("d-ac-list");
    makeSearchHandler(dInput, dAcList, track => {
      dInput.value = `${track.title} \u2014 ${track.artist}`;
      dAcList.classList.remove("open");
      submitDailyGuess(track);
    });
    document.addEventListener("mousedown", e => { if (!e.target.closest("#daily-panel .guess-area")) dAcList.classList.remove("open"); });
  }

  // Restore from save or load fresh
  const saved = localStorage.getItem("jammy_daily_" + getTodayKey());
  if (saved) {
    const data = JSON.parse(saved);
    dailyState.track = data.track; dailyState.gameOver = true;
    dailyAudio.src = data.track.preview;
    document.getElementById("d-album-art").src = data.track.cover;
    document.getElementById("d-album-art").classList.add("revealed");
    document.getElementById("d-cover-overlay").classList.add("hidden");
    document.getElementById("d-guess-input").disabled = true;
    document.getElementById("d-skip-btn").disabled    = true;
    data.rows.forEach(r => addGuessRow(dGuessesEl, makeGuessRow(r.text, r.type, "", r.artistMatch)));
    endDailyGame(data.won, true, data.attempts);
    return;
  }

  // Check for admin override first, then fall back to seeded random
  document.getElementById("d-clip-label").textContent = "Loading...";
  let track = null;
  let overrideSetAt = null;
  try {
    const ovRes = await fetch("/api/daily-override");
    const ovData = await ovRes.json();
    if (ovData.track && ovData.track.preview) {
      track = ovData.track;
      overrideSetAt = ovData.setAt || null;
    }
    dailyState.overrideSetAt = overrideSetAt;
  } catch {}

  // If there's a saved result but the override has changed since, clear it
  const savedRaw = localStorage.getItem("jammy_daily_" + getTodayKey());
  if (savedRaw && overrideSetAt) {
    const savedData = JSON.parse(savedRaw);
    if (savedData.overrideSetAt !== overrideSetAt) {
      localStorage.removeItem("jammy_daily_" + getTodayKey());
    }
  }

  if (!track) {
    // Fall back to seeded random
    const rand  = seededRand(getDaySeed());
    const genre = CHART_GENRES[Math.floor(rand() * CHART_GENRES.length)];
    try {
      const valid = await fetchChart(genre);
      if (!valid.length) throw new Error("No tracks");
      track = valid[Math.floor(rand() * valid.length)];
      track._clipOffset = rand() * (PREVIEW_LENGTH - CLIP_DURATIONS[CLIP_DURATIONS.length - 1]);
    } catch {
      document.getElementById("d-clip-label").textContent = "Could not load today's track.";
      return;
    }
  }

  dailyState.track      = track;
  dailyState.clipOffset = track._clipOffset ?? (Math.random() * (PREVIEW_LENGTH - CLIP_DURATIONS[CLIP_DURATIONS.length - 1]));
  dailyAudio.src = track.preview;
  document.getElementById("d-album-art").src = track.cover;
  document.getElementById("d-clip-label").textContent = "Press play to hear the clip";
  updateSegBar(0, dSegs, dSegTime);
}

function playDailyClip() {
  if (!dailyState.track) return;
  const secs = CLIP_DURATIONS[Math.min(dailyState.guessCount, CLIP_DURATIONS.length - 1)];
  dailyAudio.currentTime = dailyState.clipOffset;
  dailyAudio.play().catch(() => {});
  dailyState.isPlaying = true; dailyState.clipStart = Date.now();
  document.getElementById("d-big-play").classList.add("playing");
  document.getElementById("d-clip-label").textContent = `Playing ${secs}s clip...`;
  const fill = document.getElementById("d-progress-fill");
  fill.style.width = "0%";
  cancelAnimationFrame(dailyState.progressRaf);
  (function tick() {
    const pct = Math.min(((Date.now() - dailyState.clipStart) / (secs * 1000)) * 100, 100);
    fill.style.width = pct + "%";
    if (pct < 100 && dailyState.isPlaying) dailyState.progressRaf = requestAnimationFrame(tick);
  })();
  clearTimeout(dailyState.clipTimer);
  dailyState.clipTimer = setTimeout(stopDailyClip, secs * 1000);
}

function stopDailyClip() {
  dailyAudio.pause(); dailyState.isPlaying = false;
  clearTimeout(dailyState.clipTimer); cancelAnimationFrame(dailyState.progressRaf);
  document.getElementById("d-progress-fill").style.width = "0%";
  document.getElementById("d-big-play").classList.remove("playing");
  if (!dailyState.gameOver) document.getElementById("d-clip-label").textContent = "Press play to hear the clip";
}

function submitDailyGuess(track) {
  if (dailyState.gameOver || !dailyState.track) return;
  stopDailyClip();
  document.getElementById("d-ac-list").classList.remove("open");
  const sameId     = String(track.id) === String(dailyState.track.id);
  const sameTitle  = normalize(track.title)  === normalize(dailyState.track.title);
  const sameArtist = normalize(track.artist) === normalize(dailyState.track.artist);
  const correct    = sameId || (sameTitle && sameArtist);
  const artistMatch = !correct && sameArtist;
  const type        = correct ? "correct" : artistMatch ? "warm" : "wrong";
  addGuessRow(dGuessesEl, makeGuessRow(`${track.artist} \u2014 ${track.title}`, type, "", artistMatch));
  dailyState.attemptCount++;
  document.getElementById("d-guess-input").value = "";
  if (correct) endDailyGame(true, false, dailyState.attemptCount);
  else {
    dailyState.guessCount++;
    if (dailyState.guessCount >= MAX_GUESSES) endDailyGame(false, false, dailyState.attemptCount);
    else updateSegBar(dailyState.guessCount, dSegs, dSegTime);
  }
}

function endDailyGame(won, fromSave = false, explicitCount = null) {
  dailyState.gameOver = true;
  const finalCount = explicitCount ?? dailyState.attemptCount;
  document.getElementById("d-guess-input").disabled = true;
  document.getElementById("d-skip-btn").disabled    = true;
  document.getElementById("d-album-art").classList.add("revealed");
  document.getElementById("d-cover-overlay").classList.add("hidden");

  if (!fromSave) {
    const rows = Array.from(dGuessesEl.querySelectorAll(".guess-row")).map(r => ({
      text: r.querySelector(".guess-text")?.textContent || "",
      type: r.classList.contains("correct") ? "correct" : r.classList.contains("warm") ? "warm" : r.classList.contains("skipped") ? "skipped" : "wrong",
      artistMatch: r.classList.contains("warm")
    }));
    localStorage.setItem("jammy_daily_" + getTodayKey(), JSON.stringify({ won, track: dailyState.track, attempts: finalCount, rows, overrideSetAt: dailyState.overrideSetAt || null }));
  }

  const savedData     = JSON.parse(localStorage.getItem("jammy_daily_" + getTodayKey()) || "{}");
  const finalAttempts = savedData.attempts ?? finalCount;
  const t = dailyState.track;

  const panel = document.getElementById("d-result-panel");
  panel.style.display = "block";
  panel.className     = "result-panel " + (won ? "win" : "lose");

  document.getElementById("d-result-verdict").textContent = won ? "YOU GOT IT!" : "NICE TRY";
  document.getElementById("d-result-verdict").className   = "result-verdict " + (won ? "win" : "lose");
  document.getElementById("d-result-cover").src           = t.cover  || "";
  document.getElementById("d-result-title").textContent   = t.title  || "\u2014";
  document.getElementById("d-result-artist").textContent  = t.artist || "\u2014";
  document.getElementById("d-result-album").textContent   = t.album  || "";
  document.getElementById("d-deezer-link").href           = t.deezer || "#";
  document.getElementById("d-youtube-link").href          = `https://music.youtube.com/search?q=${encodeURIComponent(t.artist + " " + t.title)}`;
  document.getElementById("d-spotify-link").href = `https://open.spotify.com/search/${encodeURIComponent(t.artist + " " + t.title)}/tracks`;
  resolveSpotify(t.artist, t.title, document.getElementById("d-spotify-link"));
  document.getElementById("d-stat-guesses").textContent   = String(finalAttempts);

  makePreviewPlayer(dailyAudio,
    document.getElementById("d-preview-btn"),
    document.getElementById("d-preview-fill"),
    document.getElementById("d-preview-time")
  );

  // Share
  const rows      = savedData.rows || [];
  const emojiMap  = { correct: "\uD83D\uDFE9", warm: "\uD83D\uDFE8", wrong: "\uD83D\uDFE5", skipped: "\u2B1C" };
  const blocks    = Array.from({ length: 6 }, (_, i) => emojiMap[rows[i]?.type] || "\u2B1B").join("");
  const scoreText = won ? `${finalAttempts}/6` : `X/6`;
  const shareText = `\uD83C\uDFB5 Jammy Daily \u2014 ${getTodayKey()}\n${scoreText}\n\n${blocks}\n\n\uD83D\uDD17 ${location.origin}${location.pathname}`;
  document.getElementById("daily-share-blocks").textContent = blocks;
  document.getElementById("daily-share-btn").addEventListener("click", () => {
    navigator.clipboard.writeText(shareText).then(() => {
      const el = document.getElementById("daily-share-copied");
      el.classList.add("visible");
      setTimeout(() => el.classList.remove("visible"), 2000);
    });
  });
}

// ── Challenge tab ─────────────────────────────────────────────────────────────
// ── Challenge: create mode ────────────────────────────────────────────────────
(function setupChallenge() {
  const input       = document.getElementById("challenge-input");
  const acListEl    = document.getElementById("challenge-ac-list");
  const selected    = document.getElementById("challenge-selected");
  const cover       = document.getElementById("challenge-cover");
  const titleEl     = document.getElementById("challenge-title");
  const artistEl    = document.getElementById("challenge-artist");
  const clearBtn    = document.getElementById("challenge-clear");
  const generateBtn = document.getElementById("generate-btn");
  const linkBox     = document.getElementById("challenge-link-box");
  const linkUrl     = document.getElementById("challenge-link-url");
  const copyBtn     = document.getElementById("copy-btn");
  let chosenTrack   = null;

  makeSearchHandler(input, acListEl, track => {
    chosenTrack = track; input.value = ""; acListEl.classList.remove("open");
    cover.src = track.cover || ""; titleEl.textContent = track.title; artistEl.textContent = track.artist;
    selected.classList.add("visible"); generateBtn.disabled = false; linkBox.classList.remove("visible");
  });
  document.addEventListener("mousedown", e => { if (!e.target.closest("#challenge-create .challenge-search-wrap")) acListEl.classList.remove("open"); });
  clearBtn.addEventListener("click", () => {
    chosenTrack = null; selected.classList.remove("visible");
    generateBtn.disabled = true; linkBox.classList.remove("visible"); input.value = "";
  });
  generateBtn.addEventListener("click", () => {
    if (!chosenTrack) return;
    linkUrl.value = `${location.origin}${location.pathname}?c=${chosenTrack.id}`;
    linkBox.classList.add("visible");
  });
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(linkUrl.value).then(() => {
      copyBtn.textContent = "Copied!"; copyBtn.classList.add("copied");
      setTimeout(() => { copyBtn.textContent = "Copy"; copyBtn.classList.remove("copied"); }, 2000);
    });
  });
})();

// ── Challenge: incoming game ──────────────────────────────────────────────────
async function checkChallengeParam() {
  const id = new URLSearchParams(location.search).get("c");
  if (!id) return false;
  try {
    const res   = await fetch(`/api/track/${id}`);
    const track = await res.json();
    if (!track.preview || track.error) return false;

    // Show challenge tab in game mode
    switchTab("challenge");
    document.getElementById("challenge-create").style.display = "none";
    document.getElementById("challenge-game").style.display   = "block";

    initChallengeGame(track);
    return true;
  } catch { return false; }
}

function initChallengeGame(track) {
  const cgAudio   = document.createElement("audio");
  cgAudio.preload = "auto";
  cgAudio.src     = track.preview;
  document.body.appendChild(cgAudio);

  const cgArt     = document.getElementById("cg-album-art");
  const cgOverlay = document.getElementById("cg-overlay");
  const cgPlay    = document.getElementById("cg-big-play");
  const cgLabel   = document.getElementById("cg-clip-label");
  const cgFill    = document.getElementById("cg-progress-fill");
  const cgInput   = document.getElementById("cg-guess-input");
  const cgAcList  = document.getElementById("cg-ac-list");
  const cgSkip    = document.getElementById("cg-skip-btn");
  const cgGuesses = document.getElementById("cg-guesses");
  const cgResult  = document.getElementById("cg-result-panel");
  const cgSegs    = [0,1,2,3,4,5].map(i => document.getElementById("cgseg-" + i));
  const cgSegTime = document.getElementById("cgseg-time");

  let cgGuessCount = 0, cgAttemptCount = 0;
  let cgGameOver = false, cgPlaying = false;
  let cgClipTimer = null, cgRaf = null, cgClipStart = 0;
  const cgOffset = Math.random() * (PREVIEW_LENGTH - CLIP_DURATIONS[CLIP_DURATIONS.length - 1]);

  cgArt.src = track.cover;
  renderEmptySlots(cgGuesses);
  updateSegBar(0, cgSegs, cgSegTime);
  makeVolumeControls(cgAudio, document.getElementById("cg-vol-btn"), document.getElementById("cg-vol-slider"));
  enforceClipLimit(cgAudio,
    () => cgGameOver ? null : cgOffset + CLIP_DURATIONS[Math.min(cgGuessCount, CLIP_DURATIONS.length - 1)],
    stopCG
  );

  cgPlay.addEventListener("click", () => { if (!cgGameOver) cgPlaying ? stopCG() : playCG(); });

  function playCG() {
    const secs = CLIP_DURATIONS[Math.min(cgGuessCount, CLIP_DURATIONS.length - 1)];
    cgAudio.currentTime = cgOffset;
    cgAudio.play().catch(() => {});
    cgPlaying = true; cgClipStart = Date.now();
    cgPlay.classList.add("playing");
    cgLabel.textContent = `Playing ${secs}s clip...`;
    cgFill.style.width = "0%";
    cancelAnimationFrame(cgRaf);
    (function tick() {
      const pct = Math.min(((Date.now() - cgClipStart) / (secs * 1000)) * 100, 100);
      cgFill.style.width = pct + "%";
      if (pct < 100 && cgPlaying) cgRaf = requestAnimationFrame(tick);
    })();
    clearTimeout(cgClipTimer);
    cgClipTimer = setTimeout(stopCG, secs * 1000);
  }

  function stopCG() {
    cgAudio.pause(); cgPlaying = false;
    clearTimeout(cgClipTimer); cancelAnimationFrame(cgRaf);
    cgFill.style.width = "0%"; cgPlay.classList.remove("playing");
    if (!cgGameOver) cgLabel.textContent = "Press play to hear the clip";
  }

  cgSkip.addEventListener("click", () => {
    if (cgGameOver) return;
    stopCG(); cgAcList.classList.remove("open");
    addGuessRow(cgGuesses, makeGuessRow("\u2014 skipped \u2014", "skipped"));
    cgAttemptCount++; cgGuessCount++; cgInput.value = "";
    if (cgGuessCount >= MAX_GUESSES) endCG(false);
    else updateSegBar(cgGuessCount, cgSegs, cgSegTime);
  });

  makeSearchHandler(cgInput, cgAcList, t => {
    cgInput.value = `${t.title} \u2014 ${t.artist}`;
    cgAcList.classList.remove("open");
    submitCG(t);
  });
  document.addEventListener("mousedown", e => { if (!e.target.closest("#challenge-game .guess-area")) cgAcList.classList.remove("open"); });

  function submitCG(t) {
    if (cgGameOver) return;
    stopCG(); cgAcList.classList.remove("open");
    const sameId     = String(t.id) === String(track.id);
    const sameTitle  = normalize(t.title)  === normalize(track.title);
    const sameArtist = normalize(t.artist) === normalize(track.artist);
    const correct    = sameId || (sameTitle && sameArtist);
    const artistMatch = !correct && sameArtist;
    const type        = correct ? "correct" : artistMatch ? "warm" : "wrong";
    addGuessRow(cgGuesses, makeGuessRow(`${t.artist} \u2014 ${t.title}`, type, "", artistMatch));
    cgAttemptCount++; cgInput.value = "";
    if (correct) endCG(true);
    else { cgGuessCount++; if (cgGuessCount >= MAX_GUESSES) endCG(false); else updateSegBar(cgGuessCount, cgSegs, cgSegTime); }
  }

  function endCG(won) {
    cgGameOver = true; stopCG();
    cgInput.disabled = true; cgSkip.disabled = true;
    cgArt.classList.add("revealed"); cgOverlay.classList.add("hidden");

    cgResult.style.display = "block";
    cgResult.className     = "result-panel " + (won ? "win" : "lose");
    document.getElementById("cg-result-verdict").textContent = won ? "YOU GOT IT!" : "NICE TRY";
    document.getElementById("cg-result-verdict").className   = "result-verdict " + (won ? "win" : "lose");
    document.getElementById("cg-result-cover").src           = track.cover  || "";
    document.getElementById("cg-result-title").textContent   = track.title  || "\u2014";
    document.getElementById("cg-result-artist").textContent  = track.artist || "\u2014";
    document.getElementById("cg-result-album").textContent   = track.album  || "";
    document.getElementById("cg-deezer-link").href           = track.deezer || "#";
    document.getElementById("cg-youtube-link").href          = `https://music.youtube.com/search?q=${encodeURIComponent(track.artist + " " + track.title)}`;
    document.getElementById("cg-spotify-link").href          = `https://open.spotify.com/search/${encodeURIComponent(track.artist + " " + track.title)}/tracks`;
    document.getElementById("cg-stat-guesses").textContent   = String(cgAttemptCount);
    resolveSpotify(track.artist, track.title, document.getElementById("cg-spotify-link"));

    makePreviewPlayer(cgAudio,
      document.getElementById("cg-preview-btn"),
      document.getElementById("cg-preview-fill"),
      document.getElementById("cg-preview-time")
    );

    // Wire reply section
    const replyInput  = document.getElementById("cg-reply-input");
    const replyAcList = document.getElementById("cg-reply-ac-list");
    const replySelEl  = document.getElementById("cg-reply-selected");
    const replyCover  = document.getElementById("cg-reply-cover");
    const replyTitle  = document.getElementById("cg-reply-title");
    const replyArtist = document.getElementById("cg-reply-artist");
    const replyGenBtn = document.getElementById("cg-reply-gen-btn");
    const replyLinkBox= document.getElementById("cg-reply-link-box");
    const replyUrl    = document.getElementById("cg-reply-url");
    const replyCopy   = document.getElementById("cg-reply-copy");
    let replyTrack    = null;

    makeSearchHandler(replyInput, replyAcList, t => {
      replyTrack = t; replyInput.value = ""; replyAcList.classList.remove("open");
      replyCover.src = t.cover || ""; replyTitle.textContent = t.title; replyArtist.textContent = t.artist;
      replySelEl.style.display = "flex";
      replyGenBtn.disabled = false; replyGenBtn.style.opacity = "1";
      replyLinkBox.style.display = "none";
    });
    document.addEventListener("mousedown", e => { if (!e.target.closest("#cg-reply-row .challenge-search-wrap")) replyAcList.classList.remove("open"); });
    document.getElementById("cg-reply-clear").addEventListener("click", () => {
      replyTrack = null; replySelEl.style.display = "none";
      replyGenBtn.disabled = true; replyGenBtn.style.opacity = "0.3";
      replyLinkBox.style.display = "none"; replyInput.value = "";
    });
    replyGenBtn.addEventListener("click", () => {
      if (!replyTrack) return;
      replyUrl.value = `${location.origin}${location.pathname}?c=${replyTrack.id}`;
      replyLinkBox.style.display = "block";
    });
    replyCopy.addEventListener("click", () => {
      navigator.clipboard.writeText(replyUrl.value).then(() => {
        replyCopy.textContent = "Copied!"; replyCopy.style.background = "var(--correct)";
        setTimeout(() => { replyCopy.textContent = "Copy"; replyCopy.style.background = "var(--accent)"; }, 2000);
      });
    });
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
initEndless();
loadTrack(); // always load endless track in background
checkChallengeParam().then(isChallenge => {
  if (!isChallenge) switchTab("daily"); // default to daily on load
});

})();