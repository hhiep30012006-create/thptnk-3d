import * as THREE from 'three';

const spotX = 24.65;
const railZ = -4.73;
const title = 'Nhà thám hiểm Quốc lộ 37';
const approachZones = [
  new THREE.Box3(new THREE.Vector3(spotX - .78, -.65, -7.45), new THREE.Vector3(spotX + .78, 2.7, -5.32)),
  new THREE.Box3(new THREE.Vector3(spotX - .78, -.65, -4.15), new THREE.Vector3(spotX + .78, 2.7, -2.05))
];
const shopInfo = {
  xoi: { buy: 'Mua 1 gói xôi', receipt: 'Đã mua 1 gói xôi.' },
  bread: { buy: 'Mua 1 ổ bánh mì', receipt: 'Đã mua 1 ổ bánh mì.' }
};

export function createSecretQuest({ scene, camera, walker, keys, getPlayer, floor, outdoorOpen, sound, addTarget, notice }) {
  const vector = new THREE.Vector3();
  const marker = new THREE.Mesh(new THREE.RingGeometry(.31, .38, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xf8d280, transparent: true, opacity: .76, depthWrite: false }));
  marker.name = 'SecretClimbMarker';
  marker.visible = false;
  scene.add(marker);
  const cone = new THREE.Mesh(new THREE.CircleGeometry(27, 20, -Math.PI / 2 - .37, .74).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffdb71, transparent: true, opacity: .14, depthWrite: false, side: THREE.DoubleSide }));
  cone.name = 'GuardVision';
  cone.visible = false;
  scene.add(cone);
  let guard;
  let enabled = false;
  let ready = false;
  let storageKey;
  let clue = false;
  let climbed = false;
  let parkingHelmet;
  let helmetFound = false;
  let bought = { xoi: false, bread: false };
  let motion;
  let retryAt = 0;
  let markerSide;
  const proxy = new THREE.Object3D();
  proxy.position.set(spotX, 1.15, railZ);

  function zoneIndex() {
    vector.set(walker.x, walker.y, walker.z);
    return approachZones.findIndex(zone => zone.containsPoint(vector));
  }

  function persist() {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ clue, climbed, bought, helmetFound })); } catch {}
  }

  function profileChanged(profile) {
    if (motion) finishClimb(false);
    enabled = profile.secret === true;
    retryAt = 0;
    const key = 'nk-secret:' + [profile.name.toLocaleLowerCase('vi'), profile.className, profile.year].join('|');
    if (storageKey !== key) {
      storageKey = key;
      clue = climbed = helmetFound = false;
      bought = { xoi: false, bread: false };
      try {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        clue = data.clue === true;
        climbed = data.climbed === true;
        helmetFound = data.helmetFound === true;
        if (climbed) bought = { xoi: data.bought?.xoi === true, bread: data.bought?.bread === true };
      } catch {}
    }
    ready = false;
    if (parkingHelmet) parkingHelmet.visible = enabled && !helmetFound;
    if (!enabled) marker.visible = cone.visible = false;
  }

  function isWatched() {
    if (!guard) return false;
    const position = guard.root.position;
    const dx = walker.x - position.x;
    const dz = walker.z - position.z;
    const length = Math.hypot(dx, dz);
    return length > .1 && length < 27 && Math.abs(position.y - walker.y) < 3
      && (dx * Math.sin(guard.root.rotation.y) + dz * Math.cos(guard.root.rotation.y)) / length > Math.cos(.37);
  }

  function destination(z) {
    const y = floor(spotX, z, .45);
    if (y === null) return null;
    const point = new THREE.Vector3(spotX, y, z);
    return outdoorOpen(point) ? point : null;
  }

  function beginClimb() {
    const side = zoneIndex();
    if (!enabled || !ready || motion || side === -1 || !walker.onGround || performance.now() < retryAt) return;
    if (isWatched()) {
      retryAt = performance.now() + 900;
      sound.effect('warning');
      notice('Bác bảo vệ đang nhìn về phía này. Đợi bác quay đi nhé!');
      return;
    }
    const player = getPlayer();
    const entry = destination(side === 0 ? -5.60 : -3.90);
    const exit = destination(side === 0 ? -2.77 : -6.80);
    if (!player || !entry || !exit) {
      notice('Chưa tìm được chỗ bám an toàn ở điểm này.');
      return;
    }
    const from = new THREE.Vector3(walker.x, walker.y, walker.z);
    const height = Math.max(entry.y, exit.y) + 4.72;
    motion = {
      from, entry, exit, side, player, start: performance.now(), yaw: walker.yaw, cameraStart: camera.position.clone(),
      highEntry: entry.clone().setY(height), highExit: exit.clone().setY(height)
    };
    keys.clear();
  }

  function finishClimb(arrived) {
    const { player, from, exit, side, yaw } = motion;
    const point = arrived ? exit : from;
    Object.assign(walker, { x: point.x, y: point.y, z: point.z, yaw, velocityY: 0, onGround: true });
    player.position.copy(point);
    player.rotation.y = yaw + Math.PI;
    player.userData.arms.forEach(arm => { arm.rotation.x = 0; });
    player.userData.legs.forEach(leg => { leg.rotation.x = 0; });
    motion = undefined;
    keys.clear();
    if (arrived && side === 0 && !climbed) {
      climbed = true;
      clue = true;
      persist();
      notice('Đã ra vỉa hè Quốc lộ 37. Tìm cô bán xôi và cô bán bánh mì nhé!');
    }
  }

  function init() {
    addTarget(proxy, '[E] 🧗 Trèo rào', 3, beginClimb, {
      key: 'KeyE', icon: '🧗', clickable: false, preferAction: true, movingObject: proxy,
      available: () => enabled && ready && !motion && zoneIndex() !== -1,
      priority: () => 2
    });
  }

  function registerGuard(npc) {
    guard = npc;
  }

  function registerVendor(npc, kind) {
    const shop = shopInfo[kind];
    addTarget(npc.root, '[E] ' + shop.buy, 2.75, () => {
      if (!enabled || !climbed || bought[kind]) return;
      bought[kind] = true;
      persist();
      sound.effect('flower-pickup');
      notice(bought.xoi && bought.bread ? 'Đã nhận danh hiệu: ' + title + '!' : shop.receipt);
    }, {
      key: 'KeyE', icon: kind === 'bread' ? '🥖' : '🍚',
      available: () => enabled && climbed && !bought[kind],
      priority: () => 1
    });
  }

  function registerParkingHelmet(helmet) {
    parkingHelmet = helmet;
    addTarget(helmet, '[E] Nhặt mũ bảo hiểm', 1.75, () => {
      if (!helmet.visible) return;
      helmetFound = true;
      helmet.visible = false;
      persist();
      sound.effect('flower-pickup');
      notice('Đã tìm thấy mũ bảo hiểm bí mật trong nhà xe!');
    }, { key: 'KeyE', icon: '🪖', preferAction: true, priority: () => 2, available: () => helmet.visible });
  }

  function revealClue() {
    if (!enabled || clue) return;
    clue = true;
    persist();
    notice('Manh mối: tìm đoạn rào đầu tiên bên phải bảng tên trường, phía sau trụ của Hiệp.');
  }

  function appendProgress(content) {
    if (!enabled) return;
    const heading = document.createElement('h3');
    heading.textContent = '❓ Nhiệm vụ ẩn';
    const description = document.createElement('p');
    description.textContent = !clue && !climbed ? 'Hỏi Bùi Quốc Hiệp 06 hoặc tìm điểm đánh dấu gần cổng.'
      : 'Tìm đoạn rào bên phải bảng tên trường rồi đợi bác bảo vệ quay đi.';
    const steps = document.createElement('ul');
    for (const [done, text] of [[climbed, 'Trèo ra Quốc lộ 37'], [bought.xoi, 'Mua 1 gói xôi'], [bought.bread, 'Mua 1 ổ bánh mì']]) {
      const item = document.createElement('li');
      item.textContent = (done ? '✓ ' : '○ ') + text;
      steps.append(item);
    }
    content.append(heading, description, steps);
    if (helmetFound) {
      const souvenir = document.createElement('p');
      souvenir.textContent = '✓ Đã tìm thấy mũ bảo hiểm bí mật trong nhà xe.';
      content.append(souvenir);
    }
    if (bought.xoi && bought.bread) {
      const badge = document.createElement('strong');
      badge.textContent = '🏅 ' + title;
      content.append(badge);
    }
  }

  function moveAvatarAlongClimb(elapsed) {
    const { player, from, entry, exit, highEntry, highExit, side } = motion;
    const interpolate = (a, b, low, high) => vector.lerpVectors(a, b, THREE.MathUtils.smoothstep(elapsed, low, high));
    if (elapsed < 420) interpolate(from, entry, 0, 420);
    else if (elapsed < 1130) interpolate(entry, highEntry, 420, 1130);
    else if (elapsed < 1540) interpolate(highEntry, highExit, 1130, 1540);
    else interpolate(highExit, exit, 1540, 2160);
    Object.assign(walker, { x: vector.x, y: vector.y, z: vector.z, velocityY: 0, onGround: false });
    player.position.copy(vector);
    camera.position.set(motion.cameraStart.x + (vector.x - from.x) * .45,
      motion.cameraStart.y + (vector.y - from.y) * .66, motion.cameraStart.z + (vector.z - from.z) * .21);
    camera.lookAt(vector.x, vector.y + 1.05, vector.z);
    player.rotation.y = side === 0 ? 0 : Math.PI;
    const stride = Math.sin(elapsed / 88) * .31;
    player.userData.arms[0].rotation.x = -1.18 + stride;
    player.userData.arms[1].rotation.x = -1.18 - stride;
    player.userData.legs[0].rotation.x = -stride;
    player.userData.legs[1].rotation.x = stride;
  }

  function update(active, viewBlocked) {
    ready = active && !viewBlocked;
    cone.visible = enabled && ready && Boolean(guard)
      && Math.hypot(walker.x - guard.root.position.x, walker.z - guard.root.position.z) < 32;
    if (cone.visible) {
      cone.position.copy(guard.root.position);
      cone.position.y += .052;
      cone.rotation.y = guard.root.rotation.y;
    }
    const side = walker.z > railZ ? 1 : 0;
    const showMarker = enabled && ready && Math.abs(walker.x - spotX) < (clue ? 18 : 6) && Math.abs(walker.z - railZ) < 7;
    if (showMarker && markerSide !== side) {
      const point = destination(side === 1 ? -3.85 : -5.58);
      if (point) {
        marker.position.copy(point);
        marker.position.y += .045;
        markerSide = side;
      }
    }
    marker.visible = showMarker && markerSide === side;
    if (!motion) return;
    if (!active || viewBlocked || getPlayer() !== motion.player) { finishClimb(false); return; }
    const elapsed = performance.now() - motion.start;
    moveAvatarAlongClimb(elapsed);
    if (elapsed >= 2160) finishClimb(true);
  }

  return { init, update, profileChanged, revealClue, appendProgress, registerGuard, registerVendor, registerParkingHelmet,
    get trafficWarningActive() { return enabled && climbed; },
    get climbing() { return Boolean(motion); } };
}
