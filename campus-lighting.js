export const LIGHTING_FADE_MS = 45_000;
export const LIGHTING_PRESETS = [
  { label: 'Ban ngày', direction: [-.39, .766, .52], sky: 0xddf0ff, horizon: 0xf7fbff, zenith: 0xa9d6fa,
    sun: 0xfff8e8, fog: 0xddf0ff, fogDensity: .0024, ambient: 0xfff8ec, ground: 0xddd6c8,
    power: 2.1, duskPower: 0, fill: 1.13, exposure: 1.18, morning: 1, night: 0, sunset: 0, lamps: 0, clouds: .14 },
  { label: 'Hoàng hôn', direction: [-.73, .19, -.65], sky: 0xe99980, horizon: 0xffb476, zenith: 0xd890b5,
    sun: 0xffa65b, fog: 0xe9a18b, fogDensity: .0024, ambient: 0xffdbc5, ground: 0xa67d82,
    power: 1.15, duskPower: .12, fill: .78, exposure: 1.12, morning: 0, night: 0, sunset: 1, lamps: .32, clouds: .24 },
  { label: 'Ban đêm', direction: [.32, .48, -.81], sky: 0x081329, horizon: 0x101b37, zenith: 0x060e22,
    sun: 0xa9c3ff, fog: 0x081329, fogDensity: .0021, ambient: 0x9db8ed, ground: 0x475776,
    power: .48, duskPower: 0, fill: .36, exposure: 1.08, morning: 0, night: 1, sunset: 0, lamps: 1, clouds: .05 }
];

const DAY_START = 6 * 60;
const SUNSET_START = 16 * 60 + 1;
const NIGHT_START = 19 * 60 + 1;
const CLOCK_JUMP_MS = 5_000;

export function phaseAt(now) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes >= DAY_START && minutes < SUNSET_START) return 0;
  if (minutes >= SUNSET_START && minutes < NIGHT_START) return 1;
  return 2;
}

export function formatLocalClock(now) {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function phaseStart(now, phase) {
  const start = new Date(now);
  const minutes = [DAY_START, SUNSET_START, NIGHT_START][phase];
  if (phase === 2 && now.getHours() < 6) start.setDate(start.getDate() - 1);
  start.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return start.getTime();
}

// Device time chooses the phase; the monotonic clock only advances a live fade.
export class LightingController {
  constructor(apply) {
    this.apply = apply;
    this.phase = undefined;
    this.fadeStart = null;
  }

  tick(now, monotonic) {
    const phase = phaseAt(now);
    const wall = now.getTime();
    const offset = now.getTimezoneOffset();
    const previous = this.phase;
    const jumped = previous !== undefined && (offset !== this.offset ||
      Math.abs(wall - this.lastWall - (monotonic - this.lastMonotonic)) > CLOCK_JUMP_MS);
    this.phase = phase;
    this.lastWall = wall;
    this.lastMonotonic = monotonic;
    this.offset = offset;
    if (previous === phase && !jumped) return;
    const age = wall - phaseStart(now, phase);
    if (!jumped && previous === (phase + 2) % 3 && age >= 0 && age < LIGHTING_FADE_MS) {
      this.fadeStart = monotonic - age;
      this.frame(monotonic);
    } else {
      this.fadeStart = null;
      this.apply(phase, phase, 1);
    }
  }

  frame(monotonic) {
    if (this.fadeStart === null) return;
    const t = Math.max(0, Math.min(1, (monotonic - this.fadeStart) / LIGHTING_FADE_MS));
    this.apply((this.phase + 2) % 3, this.phase, t * t * (3 - 2 * t));
    if (t === 1) this.fadeStart = null;
  }
}
