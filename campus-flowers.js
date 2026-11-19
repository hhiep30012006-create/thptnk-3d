import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const palette = [0xef6588, 0xf2bf45, 0xd583ee, 0xf28b61, 0xfcf0cf, 0x83cafa, 0xe64e73, 0xffadbd];
const locations = [
  [-5, -29, .5], [-9, -49, .5], [32, -7, .5], [37, -18, .5],
  [27, -54, .5], [-22, -37, .5], [-15, -71.3, 1.1], [-4, -70.7, 1.1],
  [9.2, -66, .5], [21, -20.5, .5]
];
const teacherNames = new Set(['Cô Hường', 'Cô Quyên', 'Cô Nhung']);
const alumniBlessing = 'Cảm ơn em đã nhớ về trường cũ! Cô chúc em luôn vững vàng, gặt hái nhiều thành công rực rỡ trên con đường sự nghiệp và cuộc sống phía trước nhé!';
const studentBlessing = 'Cô cảm ơn bó hoa rất đẹp của em! Chúc em luôn chăm ngoan, học giỏi, đạt thật nhiều điểm cao và ngày càng tiến bộ hơn trong năm học này nhé!';
const schoolYear = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' });
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const flowerMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true, side: THREE.DoubleSide, roughness: .78, emissive: 0x57303a, emissiveIntensity: .10
});
const SHAPES = {
  box: new THREE.BoxGeometry(1, 1, 1),
  petal: new THREE.IcosahedronGeometry(1, 0),
  flatPetal: new THREE.CircleGeometry(1, 4),
  bud: new THREE.OctahedronGeometry(1, 0),
  paper: new THREE.CylinderGeometry(1, 1, 1, 7),
  cone: new THREE.CylinderGeometry(1, .24, 1, 7, 1, true)
};
let bouquetGeometry;

function coloredMesh(parts) {
  const geometries = parts.map(([geometry, color, position, scale, rotation = 0]) => {
    const mesh = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    mesh.scale(...scale);
    mesh.rotateZ(rotation);
    mesh.translate(...position);
    const tint = new THREE.Color(color);
    const values = new Float32Array(mesh.attributes.position.count * 3);
    for (let i = 0; i < values.length; i += 3) tint.toArray(values, i);
    mesh.setAttribute('color', new THREE.BufferAttribute(values, 3));
    return mesh;
  });
  const geometry = mergeGeometries(geometries);
  for (const mesh of geometries) mesh.dispose();
  return geometry;
}

function flower(parts, color, x, y, z, scale, wrapped = false) {
  if (!wrapped) {
    parts.push([SHAPES.box, 0x4d965e, [x, y - .22 * scale, z], [.025 * scale, .43 * scale, .026 * scale]]);
    parts.push([SHAPES.petal, 0x81b16b, [x + .062 * scale, y - .26 * scale, z], [.09 * scale, .028 * scale, .05 * scale], .45]);
  }
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    parts.push([wrapped ? SHAPES.flatPetal : SHAPES.petal, color, [x + Math.cos(a) * .095 * scale, y + Math.sin(a) * .09 * scale, z],
      [.074 * scale, .066 * scale, .045 * scale], a]);
  }
  parts.push([wrapped ? SHAPES.bud : SHAPES.petal, 0xffd950, [x, y, z + .035 * scale], [.052 * scale, .053 * scale, .045 * scale]]);
}

function ribbon(parts, y, depth, color) {
  parts.push([SHAPES.box, color, [0, y, depth], [.071, .053, .055]]);
  for (const side of [-1, 1]) {
    parts.push([SHAPES.petal, color, [side * .076, y + .008, depth], [.092, .044, .036], -side * .26]);
    parts.push([SHAPES.box, color, [side * .04, y - .062, depth], [.038, .12, .032], side * .28]);
  }
}

export function createFlowerBouquet() {
  if (!bouquetGeometry) {
    const parts = [
      [SHAPES.cone, 0xe5afc7, [0, -.037, -.035], [.245, .43, .225]],
      [SHAPES.cone, 0xf8dfb2, [0, .018, -.022], [.219, .405, .201], -.10]
    ];
    for (let i = 0; i < palette.length; i++) {
      const a = i * 2.4;
      flower(parts, palette[i], Math.cos(a) * .147, .26 + (i % 3) * .06, Math.sin(a) * .123, .67, true);
    }
    ribbon(parts, -.115, .132, 0xc24671);
    bouquetGeometry = coloredMesh(parts);
  }
  const bouquet = new THREE.Mesh(bouquetGeometry, flowerMaterial);
  bouquet.name = 'bouquet';
  bouquet.position.set(.04, -.47, .20);
  bouquet.rotation.x = -.55;
  bouquet.scale.setScalar(.79);
  return bouquet;
}

function makePickup(index) {
  const parts = [];
  if (index < 8) {
    flower(parts, palette[index], 0, .13, 0, 1.13);
  } else {
    parts.push([SHAPES.paper, index === 8 ? 0xe9abc9 : 0xc0afea, [0, 0, 0], [.095, .42, .095], -.40]);
    parts.push([SHAPES.paper, 0xffebd3, [.074, .18, 0], [.095, .025, .095], -.40]);
    ribbon(parts, -.02, .092, 0xb94c71);
  }
  return new THREE.Mesh(coloredMesh(parts), flowerMaterial);
}

function makeHearts(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(32, 57);
  ctx.bezierCurveTo(25, 51, 5, 37, 5, 23);
  ctx.bezierCurveTo(5, 8, 24, 4, 32, 17);
  ctx.bezierCurveTo(40, 4, 59, 8, 59, 23);
  ctx.bezierCurveTo(59, 37, 39, 51, 32, 57);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(18 * 3);
  const colors = new Float32Array(18 * 3);
  for (let i = 0; i < 18; i++) new THREE.Color(palette[i % palette.length]).toArray(colors, i * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const hearts = new THREE.Points(geometry, new THREE.PointsMaterial({
    vertexColors: true, map: texture, transparent: true, alphaTest: .10, size: .25, depthWrite: false
  }));
  hearts.name = 'FlowerGiftHearts';
  hearts.visible = false;
  hearts.frustumCulled = false;
  scene.add(hearts);
  return hearts;
}

export function createFlowerQuest({
  scene, walker, getPlayer, getProfile, floor, outdoorOpen, pickupClearance, sound, addTarget, notice, complete, showOptions, setFace
}) {
  const hud = document.querySelector('#flowerQuest');
  const pickups = [];
  const teachers = new Map();
  const hearts = makeHearts(scene);
  let inventory = new Set();
  let deliveredTo = '';
  let storageKey;
  let carrier;
  let receiving;
  let gift;
  let scanAt = 0;
  let burstAt = 0;
  let burstOrigin;

  const ready = () => inventory.size === locations.length && !deliveredTo;

  function syncHud() {
    let flowers = 0;
    for (const id of inventory) if (id < 8) flowers++;
    hud.textContent = '🌸 ' + flowers + '/8 | 🎀 ' + (inventory.size - flowers) + '/2' + (deliveredTo ? ' ✓' : '');
    hud.title = deliveredTo ? 'Đã tặng hoa cho ' + deliveredTo : ready() ? 'Đã gói bó hoa tri ân' : 'Thu thập hoa và giấy gói';
  }

  function persist() {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ items: [...inventory], deliveredTo })); } catch {}
  }

  function chooseSpot([x, z, referenceY]) {
    let best;
    for (const radius of [0, .45, .85, 1.25, 1.7, 2.25, 2.8, 3.6, 4.5]) {
      for (let i = 0; i < (radius ? 12 : 1); i++) {
        const angle = i * Math.PI / 6;
        const point = new THREE.Vector3(x + Math.cos(angle) * radius, 0, z + Math.sin(angle) * radius);
        point.y = floor(point.x, point.z, referenceY);
        if (point.y === null || !outdoorOpen(point)) continue;
        if (pickups.some(pickup => distance(pickup.point, point) < 1.1)) continue;
        const clearance = pickupClearance(point);
        const reach = clearance >= 1.2 ? .93 : 1.38;
        if (clearance >= 1.2) return { point, reach, clearance };
        if (!best || clearance > best.clearance) best = { point, reach, clearance };
      }
    }
    return best ?? { point: new THREE.Vector3(x, referenceY, z), reach: 1.38 };
  }

  function init() {
    locations.forEach((coord, id) => {
      const { point, reach } = chooseSpot(coord);
      const mesh = makePickup(id);
      mesh.name = 'FlowerQuestPickup-' + id;
      mesh.position.copy(point).add(new THREE.Vector3(0, .53, 0));
      scene.add(mesh);
      pickups.push({ point, mesh, id, reach });
    });
    syncHud();
  }

  function syncCarrier() {
    const player = getPlayer();
    if (carrier && carrier !== player) {
      carrier.userData.flowerBouquet?.removeFromParent();
      carrier.userData.flowerBouquet = null;
    }
    carrier = player;
    if (!player) return;
    if (ready() && !player.userData.flowerBouquet) {
      const bouquet = createFlowerBouquet();
      player.userData.arms[1].add(bouquet);
      player.userData.flowerBouquet = bouquet;
    } else if (!ready() && player.userData.flowerBouquet) {
      player.userData.flowerBouquet.removeFromParent();
      player.userData.flowerBouquet = null;
    }
    if (player.userData.campusProp) player.userData.campusProp.visible = !player.userData.flowerBouquet;
  }

  function displayReceipt() {
    if (receiving) {
      receiving.flowerGift?.removeFromParent();
      receiving.flowerGift = null;
    }
    receiving = teachers.get(deliveredTo);
    if (!receiving) return;
    receiving.flowerGift = createFlowerBouquet();
    receiving.flowerGift.rotation.x = -.44;
    receiving.arms[1].add(receiving.flowerGift);
  }

  function profileChanged(profile) {
    const key = 'nk-flower-quest:' + [profile.name.toLocaleLowerCase('vi'), profile.className, profile.year].join('|');
    if (storageKey !== key) {
      if (gift) resetGiftPose(gift);
      storageKey = key;
      inventory = new Set();
      deliveredTo = '';
      try {
        const saved = JSON.parse(localStorage.getItem(key) || '{}');
        if (Array.isArray(saved.items)) inventory = new Set(saved.items.filter(id => Number.isInteger(id) && pickups[id]));
        if (inventory.size === locations.length && teacherNames.has(saved.deliveredTo)) deliveredTo = saved.deliveredTo;
      } catch {}
      for (const pickup of pickups) pickup.mesh.visible = !inventory.has(pickup.id);
      displayReceipt();
      syncHud();
    }
    syncCarrier();
  }

  function collect(pickup) {
    if (inventory.has(pickup.id)) return;
    inventory.add(pickup.id);
    pickup.mesh.visible = false;
    sound.effect('flower-pickup');
    if (ready()) {
      syncCarrier();
      notice('Đã gói Bó hoa tri ân. Hãy chọn tặng cô Hường, cô Quyên hoặc cô Nhung.');
    }
    syncHud();
    persist();
  }

  function registerTeacher(npc) {
    teachers.set(npc.name, npc);
    npc.homeYaw = npc.root.rotation.y;
    addTarget(npc.root, () => ready() ? '[E] Tặng hoa 💐 · ' + npc.name : '[E] Chào ' + npc.name,
      2.65, () => {
        if (gift) return;
        if (!ready()) {
          notice(deliveredTo ? 'Bạn đã tặng bó hoa cho ' + deliveredTo + '.'
            : 'Hãy thu thập 8 bông hoa và 2 bọc giấy để gói một bó hoa tri ân.');
          return;
        }
        const player = getPlayer();
        if (player) gift = { from: performance.now(), npc, player, transferred: false };
      }, { key: 'KeyE', icon: '💐', preferAction: true, priority: () => ready() ? 1 : 0 });
  }

  function resetGiftPose({ npc, player }) {
    player.userData.bodyPivot.rotation.x = 0;
    player.userData.arms.forEach(arm => { arm.rotation.x = 0; });
    npc.arms.forEach(arm => { arm.rotation.x = 0; arm.rotation.z = 0; });
    npc.root.userData.flowerSmile = false;
    if (npc.lessonBook) npc.lessonBook.visible = !npc.flowerGift;
    setFace(npc.root, 0);
    gift = undefined;
  }

  function animateGift(now) {
    const { npc, player, from } = gift;
    const elapsed = now - from;
    const bow = elapsed < 850 ? Math.sin(Math.PI * Math.min(elapsed / 850, 1)) * .44 : 0;
    const offer = THREE.MathUtils.smoothstep(elapsed, 180, 760) * (1 - THREE.MathUtils.smoothstep(elapsed, 1060, 1600));
    player.rotation.y = Math.atan2(npc.root.position.x - walker.x, npc.root.position.z - walker.z);
    player.userData.bodyPivot.rotation.x = bow;
    npc.root.rotation.y = Math.atan2(walker.x - npc.root.position.x, walker.z - npc.root.position.z);
    player.userData.arms[1].rotation.x = -1.2 * offer;
    if (npc.lessonBook) npc.lessonBook.visible = false;
    npc.arms[1].rotation.z = 0;
    npc.arms[0].rotation.x = npc.arms[1].rotation.x = -1.01 * offer;
    npc.root.userData.flowerSmile = true;
    setFace(npc.root, 1, -.045);
    if (!gift.transferred && elapsed >= 830) {
      gift.transferred = true;
      deliveredTo = npc.name;
      syncCarrier();
      displayReceipt();
      syncHud();
      persist();
      complete('flowers');
      burstAt = now;
      burstOrigin = npc.root.position.clone().lerp(player.position, .45).add(new THREE.Vector3(0, 1.15, 0));
      sound.effect('flower-gift');
    }
    if (elapsed >= 1720) {
      resetGiftPose(gift);
      const startYear = Number(getProfile()?.year);
      const graduated = Number(schoolYear.format(new Date())) - startYear > 3;
      showOptions(npc.name, graduated ? alumniBlessing : studentBlessing, []);
    }
  }

  function update(dt, time, active) {
    hud.hidden = !active;
    if (!active) {
      if (gift) resetGiftPose(gift);
      hearts.visible = false;
      return;
    }
    if (carrier !== getPlayer()) syncCarrier();
    const now = performance.now();
    const checkPickups = now >= scanAt;
    if (checkPickups) scanAt = now + 120;
    for (const pickup of pickups) {
      if (!pickup.mesh.visible) continue;
      const range = distance(pickup.point, walker);
      if (range < 20) {
        pickup.mesh.position.y = pickup.point.y + .54 + Math.sin(time * 2.2 + pickup.id) * .10;
        pickup.mesh.rotation.y = time * .72 + pickup.id;
      }
      if (checkPickups && range < pickup.reach && Math.abs(pickup.point.y - walker.y) < .88) collect(pickup);
    }

    for (const npc of teachers.values()) {
      if (gift?.npc === npc) continue;
      const range = distance(npc.root.position, walker);
      const nearby = range < 4.3 && Math.abs(npc.root.position.y - walker.y) < 2;
      if (nearby && !npc.flowerNearby) npc.waveSince = time;
      npc.flowerNearby = nearby;
      const facing = nearby ? Math.atan2(walker.x - npc.root.position.x, walker.z - npc.root.position.z) : npc.homeYaw;
      const delta = Math.atan2(Math.sin(facing - npc.root.rotation.y), Math.cos(facing - npc.root.rotation.y));
      npc.root.rotation.y += delta * (1 - Math.exp(-dt * 7));
      npc.root.userData.flowerSmile = nearby;
      setFace(npc.root, nearby ? 1 : 0);
      const greeting = nearby && time - npc.waveSince < .95;
      if (npc.lessonBook) npc.lessonBook.visible = !npc.flowerGift;
      npc.arms[0].rotation.x = npc.flowerGift ? -.65 : -.40;
      const wave = greeting ? Math.sin((time - npc.waveSince) * Math.PI / .95) : 0;
      npc.arms[1].rotation.x = npc.flowerGift ? -.82 : -.24 - 1.45 * wave;
      npc.arms[1].rotation.z = wave * (.35 + Math.sin(time * 21) * .17);
    }
    if (gift) animateGift(now);
    const phase = (now - burstAt) / 1550;
    hearts.visible = Boolean(burstOrigin && phase < 1);
    if (hearts.visible) {
      const positions = hearts.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const angle = i * 2.399;
        const radius = (.35 + (i % 5) * .13) * phase;
        positions.setXYZ(i, burstOrigin.x + Math.cos(angle) * radius,
          burstOrigin.y + (.46 + i % 4 * .24) * phase, burstOrigin.z + Math.sin(angle) * radius);
      }
      positions.needsUpdate = true;
      hearts.material.opacity = 1 - phase;
    }
  }

  return { init, update, registerTeacher, profileChanged, get giving() { return Boolean(gift); },
    get done() { return Boolean(deliveredTo); } };
}
