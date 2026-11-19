import * as THREE from 'three';
import { parkingZone } from './campus-parking.js';

const zones = [
  { id: 'road', name: 'Vỉa hè Quốc lộ 37', short: 'QL37', icon: '🚦',
    areas: [[-150, 3, 45, 9.5], [45, -9, 128, 8]], anchor: [-34, 6], pad: [7.5, .35, 5.2, Math.PI] },
  { id: 'gate', name: 'Cổng trường THPT Nguyễn Khuyến', short: 'Cổng', icon: '🚪',
    areas: [[-4, -11, 18, 3]], anchor: [-4, -6], pad: [7.5, .35, -5.7, 0] },
  { id: 'monument', name: 'Tượng đài cụ Nguyễn Khuyến', short: 'Tượng đài', icon: '🕯',
    areas: [[-31, -43, -17, -30], [20, -61, 31, -51]], anchor: [25.2, -53.4], pad: [25.2, .34, -53.4, 0] },
  { id: 'stage', name: 'Sân khấu chính & Quảng trường 20/11', short: 'Sân khấu', icon: '🎭',
    areas: [[-3, -78, 18, -61], [-16, -46, 4, -28]], anchor: [22, -71], pad: [6.9, .34, -64, 0] },
  { id: 'pond', name: 'Bờ hồ cá & khu ghế đá', short: 'Hồ cá', icon: '🐟',
    areas: [[11, -26, 44, -7]], anchor: [52, -15], pad: [17.5, .34, -16, -Math.PI / 2] },
  { id: 'classrooms', name: 'Hành lang & phòng học Dãy nhà A/B', short: 'Dãy lớp học', icon: '📚',
    areas: [[-33, -84, -3, -69], [-43, -58, -30, -25], [40, -58, 54, -27]],
    anchor: [-36, -79], pad: [-11, 1.1, -71.0, 0] },
  parkingZone
];
const classroomZone = zones.find(zone => zone.id === 'classrooms');
const defaultLabel = 'Sân trường THPT Nguyễn Khuyến';
const interval = 200;

// The two reference corners are also encoded in the SVG artwork.
const reference = { x: -155, z: -170, pixelX: 48, pixelY: 128 };
const opposite = { x: 131, z: 52, pixelX: 976, pixelY: 896 };
const scaleX = (opposite.pixelX - reference.pixelX) / (opposite.x - reference.x);
const scaleY = (opposite.pixelY - reference.pixelY) / (opposite.z - reference.z);
const left = x => (reference.pixelX + (x - reference.x) * scaleX) * 100 / 1024;
const top = z => (reference.pixelY + (z - reference.z) * scaleY) * 100 / 1024;
const percent = value => value.toFixed(3) + '%';
const within = (zone, point, padding = 0) => zone.areas.some(([x1, z1, x2, z2]) =>
  point.x >= x1 - padding && point.x <= x2 + padding && point.z >= z1 - padding && point.z <= z2 + padding
);

const landmarks = [
  ['Thầy hiệu trưởng (anh Long)', '◆', 0, -42],
  ['Cô Hường', 'H', -11, -71.4],
  ['Cô Quyên', 'Q', 6, -65.2],
  ['Cô Nhung', 'N', 38.5, -22.5],
  ['Bác Bảo Vệ', '⛨', 6.3, -7.2],
  ['Bùi Quốc Hiệp 06', '♞', 12.74, -2.91]
];

export function createCampusMap({ active, player, yaw, indoors, players, canOpen, stopInput, floor, outdoorOpen, teleport, notice }) {
  const banner = document.querySelector('#locationBanner');
  const ticker = document.querySelector('#locationNames');
  const locationStatus = document.querySelector('#locationStatus');
  const overlay = document.querySelector('#campusMap');
  const board = document.querySelector('#campusMapBoard');
  const legend = document.querySelector('#mapZoneList');
  const pin = document.querySelector('#mapPlayerPin');
  const fade = document.querySelector('#mapTeleportFade');
  const message = document.querySelector('#mapMessage');
  const close = document.querySelector('#campusMapClose');
  const outlines = new Map();
  const buttons = new Map();
  const friends = new Map();
  let shownZone;
  let candidate;
  let samples = 0;
  let nameNode = ticker.firstElementChild;
  let fadeInProgress = false;
  let playing = false;
  let timer;
  let fadeTimer;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  function position(node, x, z) {
    node.style.left = percent(left(x));
    node.style.top = percent(top(z));
  }

  function button(zone, mapMarker) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = mapMarker ? 'map-zone-point' : 'map-zone-choice';
    element.title = 'Dịch chuyển đến ' + zone.name;
    if (mapMarker) {
      const icon = document.createElement('span');
      icon.textContent = zone.icon;
      icon.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span');
      text.textContent = zone.short;
      text.className = 'map-point-label';
      element.append(icon, text);
      element.setAttribute('aria-label', zone.name);
      position(element, ...zone.anchor);
    } else {
      element.textContent = zone.icon + ' ' + zone.name;
    }
    element.onclick = () => travel(zone);
    return element;
  }

  for (const zone of zones) {
    const boxes = zone.areas.map(([x1, z1, x2, z2]) => {
      const box = document.createElement('span');
      box.className = 'map-zone-outline';
      position(box, x1, z1);
      box.style.width = percent(left(x2) - left(x1));
      box.style.height = percent(top(z2) - top(z1));
      box.hidden = true;
      board.append(box);
      return box;
    });
    outlines.set(zone, boxes);
    const mapMarker = button(zone, true);
    const listItem = button(zone, false);
    board.append(mapMarker);
    legend.append(listItem);
    buttons.set(zone, [mapMarker, listItem]);
  }

  const npcLegend = document.querySelector('#mapNpcList');
  for (const [name, icon, x, z] of landmarks) {
    const node = document.createElement('span');
    node.className = 'map-npc';
    node.textContent = icon;
    node.title = name;
    node.setAttribute('aria-label', name);
    position(node, x, z);
    board.append(node);
    const label = document.createElement('span');
    label.textContent = icon + ' ' + name;
    npcLegend.append(label);
  }

  function showLocation(zone, animate = true) {
    const label = zone?.name ?? defaultLabel;
    locationStatus.textContent = label;
    if (!animate || reduced.matches) {
      ticker.replaceChildren(nameNode);
      nameNode.className = 'location-current';
      nameNode.textContent = label;
      return;
    }
    const previous = nameNode;
    const next = document.createElement('span');
    previous.className = 'location-leaving';
    next.className = 'location-entering';
    next.textContent = label;
    ticker.replaceChildren(previous, next);
    nameNode = next;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (next !== nameNode) return;
      next.className = 'location-current';
      previous.className = 'location-left';
    }));
    setTimeout(() => previous.remove(), 2070);
  }

  function locate(point) {
    if (indoors()) return classroomZone;
    if (shownZone && within(shownZone, point, 1.05)) return shownZone;
    return zones.find(zone => within(zone, point));
  }

  function refreshMap(point) {
    position(pin, point.x, point.z);
    pin.style.setProperty('--pin-angle', -yaw() + 'rad');
    for (const [zone, boxes] of outlines) {
      for (const box of boxes) box.hidden = zone !== shownZone;
      for (const control of buttons.get(zone)) {
        if (zone === shownZone) control.setAttribute('aria-current', 'location');
        else control.removeAttribute('aria-current');
      }
    }
    const livePlayers = players();
    for (const [id, friend] of friends) {
      if (!livePlayers.has(id)) {
        friend.node.remove();
        friends.delete(id);
      }
    }
    for (const [id, remote] of livePlayers) {
      const target = remote.root?.position ?? remote.target;
      if (!target) continue;
      let entry = friends.get(id);
      if (!entry) {
        const node = document.createElement('span');
        node.className = 'map-friend';
        const label = document.createElement('span');
        label.textContent = (remote.profile.name || 'Bạn chơi').trim().split(/\s+/).slice(-2).join(' ');
        node.append(label);
        node.title = remote.profile.name || 'Bạn chơi';
        entry = { node, x: target.x, z: target.z };
        position(node, entry.x, entry.z);
        friends.set(id, entry);
        board.append(node);
      } else {
        entry.x = THREE.MathUtils.lerp(entry.x, target.x, .84);
        entry.z = THREE.MathUtils.lerp(entry.z, target.z, .84);
        position(entry.node, entry.x, entry.z);
      }
    }
  }

  function tick() {
    if (!active()) return;
    const point = player();
    const zone = locate(point);
    if (zone === shownZone) {
      samples = 0;
    } else {
      if (zone !== candidate) {
        candidate = zone;
        samples = 1;
      } else if (++samples >= 2) {
        shownZone = zone;
        samples = 0;
        showLocation(zone);
      }
    }
    if (overlay.open) refreshMap(point);
  }

  function start() {
    if (playing) return;
    playing = true;
    shownZone = undefined;
    candidate = undefined;
    samples = 0;
    banner.hidden = false;
    shownZone = locate(player());
    showLocation(shownZone, false);
    timer = setInterval(tick, interval);
  }

  function stop() {
    playing = false;
    banner.hidden = true;
    clearInterval(timer);
    clearTimeout(fadeTimer);
    fadeInProgress = false;
    delete fade.dataset.active;
    dismiss();
  }

  function open() {
    if (!active() || !canOpen() || fadeInProgress || overlay.open) return;
    stopInput();
    message.textContent = '';
    for (const entry of friends.values()) entry.node.remove();
    friends.clear();
    refreshMap(player());
    overlay.showModal();
  }

  function dismiss() {
    if (overlay.open) overlay.close();
    stopInput();
  }

  function travel(zone) {
    if (!overlay.open || !canOpen() || fadeInProgress) return;
    const [x, y, z, angle] = zone.pad;
    let landing;
    for (const radius of [0, .45, 1.1, 1.7]) {
      for (let i = 0; i < (radius ? 8 : 1); i++) {
        const theta = i * Math.PI / 4;
        const px = x + Math.cos(theta) * radius;
        const pz = z + Math.sin(theta) * radius;
        const py = floor(px, pz, y);
        if (py === null) continue;
        const point = new THREE.Vector3(px, py, pz);
        if (within(zone, point) && outdoorOpen(point)) { landing = point; break; }
      }
      if (landing) break;
    }
    if (!landing) {
      message.textContent = 'Chưa tìm được chỗ trống tại khu vực này.';
      return;
    }
    message.textContent = '';
    fadeInProgress = true;
    dismiss();
    fade.dataset.active = '';
    const duration = reduced.matches ? 0 : 205;
    fadeTimer = setTimeout(() => {
      if (active()) {
        teleport(landing, angle);
        shownZone = zone;
        candidate = zone;
        samples = 0;
        showLocation(zone);
        notice('Đã đến ' + zone.name + '.');
      }
      delete fade.dataset.active;
      fadeTimer = setTimeout(() => { fadeInProgress = false; }, duration);
    }, duration);
  }

  close.onclick = dismiss;
  overlay.addEventListener('close', stopInput);
  return { start, stop, open, toggle() { if (overlay.open) dismiss(); else open(); },
    get blocking() { return overlay.open || fadeInProgress; } };
}
