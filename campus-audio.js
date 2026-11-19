const tracks = [
  { title: 'Xe Đạp', src: './assets/xe-dap-96.mp3' },
  { title: 'Mình Cùng Nhau Đóng Băng', src: './assets/minh-cung-nhau-dong-bang-96.mp3' }
];

const ambientZones = [
  { kind: 'water', x: 27, z: -13, radius: 25, volume: .20 },
  { kind: 'cicadas', x: -7, z: -33, radius: 47, volume: .087 }
];

const cues = {
  'parking-horn': { tones: [[735, 0, .12], [820, .16, .13]], volume: .13 },
  'traffic-brake': { noise: .25, filter: 1850, volume: .135, tones: [[436, .03, .17], [436, .27, .19]] },
  'flower-pickup': { tones: [[880, 0, .14], [1320, .055, .18]], volume: .16 },
  'flower-gift': { tones: [[660, 0, .18], [880, .09, .2], [1320, .19, .28]], volume: .14 },
  step: { noise: .055, filter: 460, volume: .15 },
  incense: { noise: .12, filter: 2100, volume: .13, tones: [[787, .12, .28], [1175, .17, .35]] },
  door: { noise: .24, filter: 340, volume: .13, tones: [[150, 0, .22], [108, .17, .10]] },
  chalk: { noise: .37, filter: 1820, volume: .10 },
  shutter: { noise: .075, filter: 2400, volume: .18, tones: [[320, .075, .075]] },
  warning: { tones: [[330, 0, .11], [275, .12, .14]], volume: .10 }
};

export function createCampusSound(playerPosition) {
  const media = new Audio();
  media.preload = 'none';
  const positions = [0, 0];
  let context;
  let master;
  let musicGain;
  let noiseBuffer;
  let engine;
  let horseSample;
  let zones;
  let active = false;
  let muted = readMute();
  let memory = false;
  let mode = 'auto';
  let loaded = -1;
  let requested = 0;
  let transition;
  let pageHidden = document.hidden;

  function init() {
    if (context) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(context.destination);
    musicGain = context.createGain();
    musicGain.gain.value = 0;
    context.createMediaElementSource(media).connect(musicGain).connect(master);
    context.addEventListener('statechange', () => {
      if (context.state === 'interrupted') media.pause();
      if (context.state === 'running' && active && !pageHidden) playCurrent();
    });
  }

  function playCurrent() {
    if (active && !muted && !pageHidden && loaded >= 0) media.play().catch(() => {});
  }

  function gainTo(level, rate = .23) {
    if (!context) { media.volume = level; return; }
    const now = context.currentTime;
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setTargetAtTime(level, now, rate);
  }

  function level() {
    return muted || !active ? 0 : requested === 1 && (mode !== 'playlist' || memory) ? .75 : .30;
  }

  function loadTrack(index, restart = false) {
    if (loaded >= 0 && Number.isFinite(media.currentTime)) positions[loaded] = media.currentTime;
    loaded = index;
    if (restart) positions[index] = 0;
    media.src = tracks[index].src;
    media.loop = mode !== 'playlist';
    if (positions[index] > 0) {
      const seek = () => {
        if (loaded === index && Number.isFinite(media.duration) && positions[index] < media.duration - .4) {
          media.currentTime = positions[index];
        }
      };
      media.addEventListener('loadedmetadata', seek, { once: true });
    }
    playCurrent();
    gainTo(level());
  }

  function choose(index, restart = false) {
    requested = index;
    clearTimeout(transition);
    transition = undefined;
    if (!active || pageHidden || muted) return;
    if (loaded === index && !restart) {
      media.loop = mode !== 'playlist';
      gainTo(level());
      playCurrent();
      return;
    }
    if (loaded === -1 || media.paused || restart) { loadTrack(index, restart); return; }
    gainTo(0, .12);
    transition = setTimeout(() => {
      transition = undefined;
      if (active && !pageHidden && !muted) loadTrack(requested);
    }, 400);
  }

  function unlock() {
    init();
    if (context && !pageHidden && context.state !== 'running') context.resume().catch(() => {});
  }

  function start() {
    unlock();
    active = true;
    muted = readMute();
    if (master) master.gain.value = muted ? 0 : 1;
    mode = 'auto';
    memory = false;
    choose(0);
    if (!zones && context) window.setTimeout(startAmbience, 80);
  }

  function stop() {
    active = false;
    clearTimeout(transition);
    transition = undefined;
    gainTo(0);
    media.pause();
    applyAmbience();
    setTrafficSource(null);
  }

  function setMemory(value) {
    if (memory === value) return;
    memory = value;
    if (mode === 'auto') choose(value ? 1 : 0);
  }

  function setMode(value) {
    unlock();
    mode = value;
    if (mode === 'auto') choose(memory ? 1 : 0);
    else if (mode === 'playlist') choose(loaded >= 0 ? loaded : 0);
    else choose(value === 'memory' ? 1 : 0);
  }

  function readMute() {
    try { return localStorage.getItem('nk-muted-sound') === 'yes'; }
    catch { return false; }
  }

  function toggleMute() {
    unlock();
    muted = !muted;
    try { localStorage.setItem('nk-muted-sound', muted ? 'yes' : 'no'); } catch {}
    if (master) master.gain.setTargetAtTime(muted ? 0 : 1, context.currentTime, .10);
    if (muted) { media.pause(); gainTo(0); }
    else choose(requested);
    applyAmbience();
    return muted;
  }

  media.addEventListener('ended', () => {
    if (mode === 'playlist') choose(loaded === 0 ? 1 : 0, true);
  });

  function setPageHidden(hidden) {
    pageHidden = hidden;
    if (pageHidden) {
      clearTimeout(transition);
      transition = undefined;
      media.pause();
      if (context?.state === 'running') context.suspend().catch(() => {});
    } else if (active) {
      unlock();
      choose(requested);
    }
  }

  document.addEventListener('visibilitychange', () => setPageHidden(document.hidden));
  window.addEventListener('pagehide', () => setPageHidden(true));
  window.addEventListener('pageshow', () => setPageHidden(document.hidden));
  navigator.audioSession?.addEventListener?.('statechange', () => {
    if (navigator.audioSession.state === 'interrupted') media.pause();
    else if (!pageHidden && active) { unlock(); choose(requested); }
  });

  function buildNoise(seconds, type) {
    const rate = context.sampleRate;
    const length = Math.round(rate * seconds);
    const buffer = context.createBuffer(1, length, rate);
    const samples = buffer.getChannelData(0);
    let low = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const white = Math.random() * 2 - 1;
      low += (white - low) * .041;
      if (type === 'water') samples[i] = (low * .82 + white * .18) * (.58 + .28 * Math.sin(2 * Math.PI * t / 1.4));
      else if (type === 'cicadas') samples[i] = white * .20 * Math.pow(Math.max(0, Math.sin(t * Math.PI * 3)), 5);
      else samples[i] = white;
      if (type !== 'effect') samples[i] *= Math.min(1, i / (rate * .035), (length - i) / (rate * .035));
    }
    return buffer;
  }

  function startAmbience() {
    if (zones || !context) return;
    zones = ambientZones.map(zone => {
      const source = context.createBufferSource();
      source.buffer = buildNoise(4.2, zone.kind);
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = zone.kind === 'cicadas' ? 'bandpass' : 'lowpass';
      filter.frequency.value = { water: 1350, cicadas: 4600 }[zone.kind];
      filter.Q.value = zone.kind === 'cicadas' ? 1.6 : .6;
      const gain = context.createGain();
      gain.gain.value = 0;
      const pan = context.createStereoPanner?.();
      source.connect(filter).connect(gain);
      if (pan) gain.connect(pan).connect(master);
      else gain.connect(master);
      source.start();
      return { ...zone, gain, pan };
    });
    applyAmbience();
  }

  function applyAmbience() {
    if (!zones || context.state !== 'running') return;
    const position = playerPosition();
    const rightX = Math.cos(position.yaw);
    const rightZ = -Math.sin(position.yaw);
    for (const zone of zones) {
      const dx = zone.x - position.x;
      const dz = zone.z - position.z;
      const distance = Math.hypot(dx, dz);
      const near = Math.max(0, 1 - distance / zone.radius);
      const value = active && !muted && !pageHidden && position.y < 11 ? near * near * zone.volume : 0;
      zone.gain.gain.setTargetAtTime(value, context.currentTime, .20);
      if (zone.pan) zone.pan.pan.setTargetAtTime((dx * rightX + dz * rightZ) / Math.max(distance, 1), context.currentTime, .18);
    }
  }

  function setTrafficSource(point, speed = 0, large = false) {
    if (!context || context.state !== 'running') return;
    if (!active || muted || pageHidden || !point) {
      engine?.gain.gain.setTargetAtTime(0, context.currentTime, .16);
      return;
    }
    if (!engine) {
      const rate = context.sampleRate;
      const buffer = context.createBuffer(1, rate, rate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < rate; i++) {
        const angle = i / rate * Math.PI * 2;
        samples[i] = (.38 * Math.sin(angle * 48) + .21 * Math.sin(angle * 96)
          + .13 * Math.sin(angle * 144) + .10 * Math.sin(angle * 192)) * (.68 + .24 * Math.sin(angle * 16));
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = context.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      const pan = context.createStereoPanner?.();
      if (pan) gain.connect(pan).connect(master);
      else gain.connect(master);
      source.start();
      engine = { source, gain, pan };
    }
    const player = playerPosition();
    const dx = point.x - player.x;
    const dz = point.z - player.z;
    const distance = Math.hypot(dx, dz, (point.y - player.y) * 2);
    const near = Math.max(0, 1 - distance / 24);
    const now = context.currentTime;
    engine.gain.gain.setTargetAtTime(near * near * (large ? .18 : .14), now, .16);
    engine.source.playbackRate.setTargetAtTime((large ? .74 : 1.14) + speed * .034, now, .20);
    engine.pan?.pan.setTargetAtTime((dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / Math.max(distance, 1), now, .12);
  }

  function effect(kind) {
    if (muted || pageHidden || (!active && kind !== 'warning')) return;
    unlock();
    const cue = cues[kind];
    if (!context || !cue || context.state !== 'running') return;
    const now = context.currentTime;
    if (cue.noise) {
      if (!noiseBuffer) noiseBuffer = buildNoise(.5, 'effect');
      const noise = context.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = cue.filter;
      filter.Q.value = .85;
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(.001, now);
      envelope.gain.linearRampToValueAtTime(cue.volume, now + .011);
      envelope.gain.exponentialRampToValueAtTime(.001, now + cue.noise);
      noise.connect(filter).connect(envelope).connect(master);
      noise.start(now);
      noise.stop(now + cue.noise + .015);
    }
    if (cue.tones) for (const [frequency, offset, duration] of cue.tones) {
      const tone = context.createOscillator();
      const envelope = context.createGain();
      const from = now + offset;
      tone.frequency.value = frequency;
      tone.connect(envelope).connect(master);
      envelope.gain.setValueAtTime(.001, from);
      envelope.gain.linearRampToValueAtTime(cue.volume * .32, from + .014);
      envelope.gain.exponentialRampToValueAtTime(.001, from + duration);
      tone.start(from);
      tone.stop(from + duration + .01);
    }
  }

  async function whinny() {
    if (!active || muted || pageHidden) return;
    unlock();
    if (!context) return;
    horseSample ??= fetch('./assets/horse-neigh.mp3')
      .then(response => {
        if (!response.ok) throw new Error('Horse audio unavailable');
        return response.arrayBuffer();
      })
      .then(bytes => context.decodeAudioData(bytes))
      .catch(() => { horseSample = undefined; return null; });
    const buffer = await horseSample;
    if (!buffer || !active || muted || pageHidden || context.state !== 'running') return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.value = .20;
    source.connect(gain).connect(master);
    source.start();
  }

  function status() {
    return {
      title: tracks[requested].title, requested, loaded, mode, muted, paused: media.paused,
      volume: musicGain?.gain.value ?? media.volume, context: context?.state ?? ''
    };
  }
  return { start, stop, unlock, setMemory, setMode, toggleMute, applyAmbience, setTrafficSource, effect, whinny, status };
}
