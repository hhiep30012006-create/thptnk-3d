import * as THREE from 'three';
import { createClassroomSystems } from './campus-classrooms.js';
import { addStudentParking } from './campus-parking.js';
import { createGateHorseDialogue } from './campus-horse-dialog.js';
import { createFlowerQuest } from './campus-flowers.js';
import { createSecretQuest } from './campus-secret.js';

const vector = (x, y, z) => new THREE.Vector3(x, y, z);
const bounds = object => new THREE.Box3().setFromObject(object);
const center = object => bounds(object).getCenter(new THREE.Vector3());
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function createCampusProp(kind, color = { tea: 0xc49a6c, soda: 0xb94734, snack: 0xefb830 }[kind]) {
  const prop = new THREE.Group();
  prop.name = kind;
  prop.position.set(.045, -.57, .08);
  prop.rotation.x = -.25;
  const geometry = kind === 'snack' ? new THREE.BoxGeometry(.16, .24, .075) : new THREE.CylinderGeometry(.084, .062, .22, 12);
  prop.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color })));
  if (kind !== 'snack') {
    const straw = new THREE.Mesh(new THREE.BoxGeometry(.017, .16, .017), new THREE.MeshStandardMaterial({ color: 0xfff0d7 }));
    straw.position.set(.027, .16, 0);
    prop.add(straw);
  }
  return prop;
}

export function createCampusActivities({ scene, camera, renderer, walker, keys, post, getPlayer, getRoom, getProfile, floor, notice, mobile, sound, outdoorOpen, setFace, openTravel, pickupClearance, resetInput, faceHorse, collides, positionCamera, playerBox }) {
  const prompt = document.querySelector('#campusActions');
  const action = prompt.querySelector('button');
  const secondary = document.querySelector('#campusSecondary');
  const photo = document.querySelector('#campusPhoto');
  const photoCaption = photo.querySelector('span');
  const biography = document.querySelector('#tributeBiography');
  const dialog = document.querySelector('#campusDialog');
  const stand = document.querySelector('#campusStand');
  const title = dialog.querySelector('h2');
  const content = dialog.querySelector('.campus-dialog-content');
  const targets = [];
  const missions = {
    tribute: 'Thắp hương hoặc dâng hoa', chill: 'Ngồi ghế đá ngắm cảnh',
    classroom: 'Viết chữ lên bảng lớp', guestbook: 'Ký bảng vàng', photo: 'Chụp ảnh nhóm', flowers: 'Gói và tặng bó hoa tri ân'
  };
  let progress = {};
  try { progress = JSON.parse(localStorage.getItem('nk-campus-missions') || '{}') || {}; } catch {}
  let nextProximity = 0;
  let boardSign;
  let nextGuestbookRead = 0;
  const doors = [];
  const zones = [vector(7.5, 0.45, -3)];
  const urns = [];
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const smokeTexture = new THREE.CanvasTexture(makeSmokeCanvas());
  let memoryDialog = false;
  const roleNpcs = new Map();
  let emoteAtlas;
  let emoteUntil = 0;
  let currentEmote;
  let dialogSpeaker;
  let active;
  let nearby;
  let horseTarget;
  let seated;
  let ceremony;
  let room;
  let indoors = false;
  let returnPoint;
  let boardCanvas;
  let boardTexture;
  let ripples;
  let fan;
  let fanOn = false;
  let tube;
  let light;
  let roomFill;
  let activeIncenseLights = 0;
  let lightOn = false;
  let captured;
  let photoUrl;
  let viewingNotes = 0;
  const voter = loadVoter();
  const secret = createSecretQuest({ scene, camera, walker, keys, getPlayer, floor, outdoorOpen, sound, addTarget, notice });
  const horseDialogue = createGateHorseDialogue({
    secretEnabled: () => getProfile()?.secret === true,
    revealClue: secret.revealClue,
    sound, resetInput,
    restoreFocus: () => renderer.domElement.focus()
  });
  const flowers = createFlowerQuest({ scene, walker, getPlayer, getProfile, floor, outdoorOpen, pickupClearance, sound, addTarget, notice, complete, showOptions, setFace });
  const classrooms = createClassroomSystems({ walker, getPlayer, getRoom, post, floor, collides, notice, resetInput, positionCamera, playerBox, stand, sound,
    openDialog(heading) { openDialog(heading); return { dialog, content }; },
    onBoardSaved: () => complete('classroom') });
  const practiceBoard = classrooms.registerPracticeBoard(drawBoard);
  dialog.querySelector('.campus-close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    viewingNotes++;
    dialogSpeaker = undefined;
    memoryDialog = false;
    sound.setMemory(Boolean(seated || captured));
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = undefined;
    document.body.classList.remove('campus-photo-open');
    keys.clear();
  });
  stand.onclick = () => { if (classrooms.blocked) classrooms.standUp(); else leaveSeat(); };
  action.onclick = () => {
    if (!nearby || classrooms.blocked || !inReach(nearby)) return;
    if (mobile && nearby.alternateReady?.()) nearby.alternate();
    else if (mobile && nearby.alternateLabel === 'Dâng hoa') {
      const tribute = nearby;
      showOptions('Tri ân tại tượng đài', '', [['Thắp hương', tribute.activate], ['Dâng hoa', tribute.alternate]]);
    } else nearby.activate();
  };
  secondary.onclick = () => {
    if (nearby?.alternate && inReach(nearby) && (nearby.alternateReady?.() ?? true)) nearby.alternate();
  };
  photo.onclick = () => { void takePhoto(); };

  function loadVoter() {
    const key = 'nk-guestbook-voter';
    const fresh = THREE.MathUtils.generateUUID().toLowerCase();
    try {
      const previous = localStorage.getItem(key);
      if (previous) return previous;
      localStorage.setItem(key, fresh);
    } catch { /* Private browsing may block storage. */ }
    return fresh;
  }

  function mesh(parent, size, position, color) {
    const object = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color }));
    object.position.copy(position);
    parent.add(object);
    return object;
  }

  function addTarget(object, label, range, activate, options = {}) {
    const target = { object, point: options.point ?? center(object), label, range, activate, ...options };
    targets.push(target);
    return target;
  }

  function inReach(target) {
    if (target.available && !target.available()) return false;
    if (target.movingObject) target.point.copy(target.movingObject.position);
    return Boolean(target.indoor) === indoors
      && Math.abs(target.point.y - walker.y) < 3
      && distance(target.point, walker) <= target.range;
  }

  function init(campus) {
    campus.updateMatrixWorld(true);
    flowers.init();
    secret.init();
    const parking = addStudentParking(campus, scene, floor);
    if (parking) {
      const label = '[E] Ngồi lên xe điện';
      const reach = 2.4;
      for (const { mesh, seats } of parking.models) {
        addTarget(mesh, label, Infinity, hit => {
          const seat = seats[hit?.instanceId];
          if (seat && distance(seat.approach, walker) <= reach) sit(seat);
        }, { proximity: false });
        for (const seat of seats) {
          addTarget(mesh, label, reach, () => sit(seat), {
            key: 'KeyE', icon: '🛵', point: seat.approach, clickable: false
          });
        }
      }
      if (parking.helmet) secret.registerParkingHelmet(parking.helmet);
    }
    const pool = campus.getObjectByName('MatNuocHo');
    if (pool) {
      const box = bounds(pool);
      const point = center(pool);
      zones.push(vector(box.min.x - 2.2, .5, point.z + 1.5));
      ripples = new THREE.Group();
      ripples.position.set(point.x - 1, box.max.y + .04, point.z);
      const geometry = new THREE.RingGeometry(.965, 1, 64).rotateX(-Math.PI / 2);
      for (let i = 0; i < 4; i++) {
        const wave = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
          color: 0xcaf0eb, transparent: true, opacity: 0, depthWrite: false
        }));
        ripples.add(wave);
      }
      scene.add(ripples);
    }
    for (const name of ['Incense_Urn', 'Statue02_Incense_Urn']) {
      const urn = campus.getObjectByName(name);
      if (!urn) continue;
      const head = urn.parent.children.find(child => /Statue_Head$/.test(child.name));
      const tribute = makeTribute(urn, head);
      urns.push(tribute);
      addTarget(urn, '[F] Thắp hương tri ân', 2.8, () => startTribute(tribute, false), {
        key: 'KeyF', icon: '🕯️', alternateLabel: 'Dâng hoa', alternate: () => startTribute(tribute, true)
      });
    }
    const benchGroupName = THREE.PropertyBinding.sanitizeNodeName('Rounded granite seats • linked benches');
    campus.traverse(object => {
      if (!/^Bench_(Courtyard_)?\d+$/.test(object.name) && object.parent?.name !== benchGroupName) return;
      const box = bounds(object);
      const size = box.getSize(new THREE.Vector3());
      const point = center(object);
      const goal = pool && distance(point, center(pool)) < 20 ? center(pool) : vector(0, point.y, -38);
      const direction = size.x > size.z ? vector(0, 0, Math.sign(goal.z - point.z) || 1)
        : vector(Math.sign(goal.x - point.x) || 1, 0, 0);
      const fromAbove = new THREE.Raycaster(vector(point.x, box.max.y + .1, point.z), vector(0, -1, 0));
      const top = fromAbove.intersectObject(object, true)[0];
      const seat = { point: point.setY(top?.point.y ?? box.max.y - .08), direction };
      addTarget(object, '[E] Ngồi nghỉ', 2.4, () => sit(seat), { key: 'KeyE', icon: '🪑' });
    });
    const entry = campus.getObjectByName('Khu_C1_2Tang_CanhCuaDi_0_4');
    if (entry) {
      const entryPoint = center(entry);
      const detailedDoor = Boolean(entry.userData.detailedCampusName);
      const box = bounds(entry);
      const across = box.max.x - box.min.x < box.max.z - box.min.z ? vector(1, 0, 0) : vector(0, 0, 1);
      returnPoint = [2, -2, 2.7, -2.7].map(offset => {
        const point = entryPoint.clone().addScaledVector(across, offset);
        point.y = floor(point.x, point.z, box.min.y);
        return point;
      }).find(point => point.y !== null && outdoorOpen(point)) ?? vector(entryPoint.x, 1.1, entryPoint.z + 2.35);
      buildClassroom();
      const enter = () => {
        teleport(room.origin.clone().add(vector(0, .01, 4.4)), 0, true);
        notice('Lớp C1 · Bấm vào công tắc hoặc bảng xanh.');
      };
      if (detailedDoor) {
        addTarget(entry, '[E] Vào phòng thực hành C1', 1.8, enter,
          { key: 'KeyE', icon: '🚪', point: entryPoint, clickable: false });
      } else {
        const hinge = makeHinge(entry);
        addTarget(entry, () => hinge.open ? '[E] Đóng cửa lớp C1' : '[E] Mở cửa lớp C1',
        3.3, () => { hinge.open = !hinge.open; sound.effect('door'); }, { key: 'KeyE', clickable: true, icon: '🚪', point: entryPoint,
          alternateLabel: 'Vào lớp C1',
          alternateReady: () => hinge.open,
          alternate: () => { enter(); hinge.open = false; }
        });
      }
    }
    const board = campus.getObjectByName('MatBangTinGiua006') || campus.getObjectByName('MatBangTinGiua002');
    if (board) {
      const point = center(board);
      const box = bounds(board);
      const sign = makeSign('BẢNG VÀNG KỶ NIỆM', 4.35, 1.77, true);
      sign.position.set(point.x, point.y, box.max.z + .065);
      boardSign = sign;
      refreshGuestbookBoard();
      scene.add(sign);
      addTarget(board, '[E] Mở bảng vàng kỷ niệm', 4.2, openGuestbook, { key: 'KeyE', clickable: true, icon: '📝' });
      addTarget(sign, 'Mở bảng vàng kỷ niệm', 4.2, openGuestbook, { clickable: true, proximity: false });
    }
  }

  function makeSign(text, width, height, paper = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = paper ? 416 : 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#35261b'; ctx.fillRect(0, 0, 1024, 128);
    ctx.fillStyle = '#ffe1a0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 46px system-ui'; ctx.fillText(text, 512, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
  }

  function makeHinge(leaf) {
    const box = bounds(leaf);
    const point = box.getCenter(new THREE.Vector3());
    const pivot = new THREE.Group();
    pivot.position.set(box.min.x, box.min.y, point.z);
    scene.add(pivot);
    pivot.attach(leaf);
    const door = { pivot, open: false };
    doors.push(door);
    return door;
  }

  function buildClassroom() {
    const origin = vector(-11.54, 30, -77);
    const interior = new THREE.Group();
    interior.position.copy(origin);
    scene.add(interior);
    room = { origin };
    mesh(interior, [10, .25, 12], vector(0, -.125, 0), 0xd6bda3);
    mesh(interior, [10, .2, 12], vector(0, 3.9, 0), 0xe4ded2);
    mesh(interior, [10, 3.9, .18], vector(0, 1.95, -6), 0xdad3be);
    mesh(interior, [.18, 3.9, 12], vector(-5, 1.95, 0), 0xe2dac7);
    mesh(interior, [.18, 3.9, 12], vector(5, 1.95, 0), 0xe2dac7);
    for (const side of [-1, 1]) mesh(interior, [4.2, 3.9, .18], vector(side * 2.9, 1.95, 6), 0xdad3be);
    const exit = mesh(interior, [1.5, 2.65, .11], vector(0, 1.325, 6), 0x885637);
    const exitHinge = makeHinge(exit);
    addTarget(exit, '[E] Ra khỏi lớp', 3.2, () => {
      if (exitHinge.open) return;
      exitHinge.open = true;
      sound.effect('door');
      keys.clear();
      window.setTimeout(() => {
        if (indoors) teleport(returnPoint, Math.PI, false);
        exitHinge.open = false;
      }, 450);
    }, { indoor: true, key: 'KeyE', clickable: true });

    const chalkFrame = mesh(interior, [5.3, 2.15, .14], vector(0, 2.1, -5.83), 0x6e4b33);
    boardCanvas = document.createElement('canvas');
    boardCanvas.width = 1024;
    boardCanvas.height = 410;
    boardTexture = new THREE.CanvasTexture(boardCanvas);
    boardTexture.colorSpace = THREE.SRGBColorSpace;
    const chalk = new THREE.Mesh(new THREE.PlaneGeometry(5.1, 1.98), new THREE.MeshBasicMaterial({ map: boardTexture }));
    chalk.position.set(0, 2.1, -5.75);
    interior.add(chalk);
    drawBoard(practiceBoard);
    addTarget(chalkFrame, '[E] Viết bảng', 4, () => classrooms.editBoard(practiceBoard), { indoor: true, key: 'KeyE', clickable: true, icon: '✍️' });

    const fanSwitch = mesh(interior, [.19, .28, .08], vector(-1.19, 1.52, 5.86), 0x945626);
    const lightSwitch = mesh(interior, [.19, .28, .08], vector(-1.49, 1.52, 5.86), 0xffe2a4);
    const label = makeSign('ĐÈN  /  QUẠT', 1.25, .24);
    label.position.set(-1.35, 1.86, 5.82);
    label.rotation.y = Math.PI;
    interior.add(label);
    addTarget(fanSwitch, '[E] Bật/tắt quạt', 2.9, () => {
      fanOn = !fanOn; notice(fanOn ? 'Đã bật quạt trần.' : 'Đã tắt quạt trần.');
    }, { indoor: true, key: 'KeyE', clickable: true });
    addTarget(lightSwitch, '[E] Bật/tắt đèn', 2.9, () => {
      lightOn = !lightOn;
      light.visible = indoors && lightOn;
      light.intensity = lightOn ? 36 : 0;
      tube.material.emissiveIntensity = lightOn ? 1.5 : 0;
      notice(lightOn ? 'Đã bật đèn lớp.' : 'Đã tắt đèn lớp.');
    }, { indoor: true, key: 'KeyE', clickable: true });
    tube = mesh(interior, [3.15, .12, .22], vector(0, 3.68, -2.2), 0xe6ebdf);
    tube.material.emissive.set(0xffedc4);
    tube.material.emissiveIntensity = 0;
    light = new THREE.PointLight(0xffeccc, 0, 13);
    light.position.set(0, 3.45, -2.2);
    interior.add(light);
    light.visible = false;
    roomFill = new THREE.PointLight(0xffe9d4, 24, 12);
    roomFill.visible = false;
    roomFill.position.set(1, 3.4, 3);
    interior.add(roomFill);
    fan = new THREE.Group();
    fan.position.set(0, 3.4, .8);
    interior.add(fan);
    mesh(fan, [.32, .16, .32], vector(0, 0, 0), 0xbfc4bb);
    for (let i = 0; i < 3; i++) {
      const blade = mesh(fan, [1.15, .045, .22], vector(0, 0, 0), 0xcbd2c9);
      blade.rotation.y = i * Math.PI * 2 / 3;
      blade.translateX(.68);
    }
    for (const x of [-2.85, 2.85]) for (const z of [-2.1, .3, 2.7]) {
      mesh(interior, [1.7, .09, .59], vector(x, .79, z), 0x946341);
      mesh(interior, [1.45, .76, .12], vector(x, .38, z), 0x5c665a);
    }
  }

  function teleport(point, yaw, classroom) {
    indoors = classroom;
    if (roomFill) roomFill.visible = indoors;
    if (light) light.visible = indoors && lightOn;
    Object.assign(walker, { x: point.x, y: point.y, z: point.z, yaw, velocityY: 0, onGround: true });
    if (!classroom) walker.y = floor(point.x, point.z, point.y) ?? point.y;
    keys.clear();
  }

  function makeSmokeCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 3, 32, 32, 30);
    gradient.addColorStop(0, 'rgba(242,238,226,.68)');
    gradient.addColorStop(.42, 'rgba(238,235,228,.28)');
    gradient.addColorStop(1, 'rgba(238,235,228,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    return canvas;
  }

  function makeTribute(urn, head) {
    const box = bounds(urn);
    const point = center(urn).setY(box.max.y);
    const look = head ? center(head) : point.clone().add(vector(0, 2, -.7));
    const tribute = { point, look, until: 0, lights: [], flowers: new THREE.Group() };
    const positions = new Float32Array(36 * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const smoke = new THREE.Points(geometry, new THREE.PointsMaterial({
      size: .42, map: smokeTexture, transparent: true, opacity: .54, depthWrite: false
    }));
    smoke.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    smoke.frustumCulled = false;
    smoke.visible = false;
    scene.add(smoke);
    tribute.smoke = smoke;
    tribute.sticks = new THREE.Group();
    tribute.sticks.visible = false;
    scene.add(tribute.sticks);
    for (let i = 0; i < 3; i++) {
      const base = point.clone().add(vector((i - 1) * .07, .13 + i * .018, (i % 2) * .045 - .02));
      mesh(tribute.sticks, [.018, .27, .018], base, 0x9d3422);
      const tip = base.clone().add(vector(0, .139, 0));
      const ember = new THREE.Mesh(new THREE.SphereGeometry(.018, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff7748 }));
      ember.position.copy(tip);
      tribute.sticks.add(ember);
      const glow = new THREE.PointLight(0xff5025, 0, .8);
      glow.position.copy(tip);
      glow.visible = false;
      tribute.sticks.add(glow);
      tribute.lights.push(glow);
    }
    const forward = point.clone().sub(look).setY(0).normalize();
    const pos = point.clone().addScaledVector(forward, .35);
    pos.y = floor(pos.x, pos.z, box.min.y) ?? (box.min.y - .15);
    tribute.flowers.position.copy(pos);
    tribute.flowers.visible = false;
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.4;
      const head = new THREE.Mesh(new THREE.SphereGeometry(.064, 8, 6), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xffda65 : 0xfff0c6 }));
      head.position.set(Math.cos(angle) * .13, .24 + (i % 3) * .07, Math.sin(angle) * .13);
      tribute.flowers.add(head);
      const stem = mesh(tribute.flowers, [.014, head.position.y, .014], head.position.clone().multiplyScalar(.5), 0x40764d);
      stem.quaternion.setFromUnitVectors(vector(0, 1, 0), head.position.clone().normalize());
    }
    scene.add(tribute.flowers);
    return tribute;
  }

  function startTribute(tribute, flowers) {
    if (ceremony || seated || indoors || dialog.open) return;
    const now = performance.now();
    if (flowers) tribute.flowers.visible = true;
    else {
      tribute.until = now + 16000;
      sound.effect('incense');
      tribute.sticks.visible = true;
    }
    const from = camera.position.clone();
    const forward = tribute.point.clone().sub(tribute.look).setY(0).normalize();
    const side = vector(-forward.z, 0, forward.x);
    const view = tribute.point.clone().addScaledVector(forward, 4).addScaledVector(side, 1.9);
    view.y = Math.max(walker.y + 1.45, tribute.point.y - .25);
    ceremony = { at: now, from, view, look: tribute.look, flowers };
    keys.clear();
    biography.hidden = false;
  }

  function sit(seat) {
    if (!walker.onGround || indoors || seated || ceremony || dialog.open) return;
    seated = { ...seat, previous: { ...walker }, time: performance.now() };
    keys.clear();
    stand.hidden = false;
    if (seat.parking) {
      document.body.classList.add('campus-parking-seat');
      sound.effect('parking-horn');
    } else {
      sound.setMemory(true);
      document.body.classList.add('campus-chill');
      complete('chill');
    }
  }

  function leaveSeat() {
    if (!seated) return;
    Object.assign(walker, seated.previous);
    seated = undefined;
    sound.setMemory(Boolean(memoryDialog || captured));
    document.body.classList.remove('campus-chill', 'campus-parking-seat');
    stand.hidden = true;
    keys.clear();
    const player = getPlayer();
    if (player) player.visible = true;
  }

  function drawBoard({ text, color }) {
    if (!boardCanvas) return;
    const ctx = boardCanvas.getContext('2d');
    ctx.fillStyle = '#244839';
    ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
    ctx.font = '42px system-ui';
    ctx.fillStyle = color;
    let y = 86;
    for (const paragraph of text.split('\n')) {
      const tokens = paragraph.split(/\s+/).flatMap(word => word.match(/.{1,24}/gu) || []);
      let line = '';
      for (const token of tokens) {
        if (line && ctx.measureText(line + ' ' + token).width > 914) {
          if (y <= 380) ctx.fillText(line, 54, y, 914);
          y += 53;
          line = '';
        }
        line += (line ? ' ' : '') + token;
      }
      if (line && y <= 380) ctx.fillText(line, 54, y, 914);
      y += 53;
      if (y > 380) break;
    }
    boardTexture.needsUpdate = true;
  }

  function openDialog(heading) {
    horseDialogue.dismiss();
    memoryDialog = heading === 'Bảng vàng kỷ niệm' || heading === 'Ảnh nhóm';
    sound.setMemory(Boolean(seated || captured || memoryDialog));
    title.textContent = heading;
    content.replaceChildren();
    keys.clear();
    if (!dialog.open) dialog.showModal();
  }

  function field(form, text, name, limit, multiline = false) {
    const label = document.createElement('label');
    label.textContent = text;
    const input = document.createElement(multiline ? 'textarea' : 'input');
    input.name = name;
    input.maxLength = limit;
    label.append(input);
    form.append(label);
    return input;
  }

  function submit(form, text, callback) {
    const button = document.createElement('button');
    button.className = 'primary';
    button.textContent = text;
    const error = document.createElement('p');
    error.className = 'error';
    error.setAttribute('role', 'status');
    form.append(button, error);
    form.onsubmit = async event => {
      event.preventDefault();
      button.disabled = true;
      error.textContent = '';
      try { await callback(new FormData(form)); }
      catch (cause) { error.textContent = cause.message; }
      finally { button.disabled = false; }
    };
  }

  function requireRoom() {
    const connection = getRoom();
    if (!connection.id) throw new Error('Phòng chơi chưa kết nối. Hãy thử lại sau.');
    return connection.id;
  }

  function openGuestbook() {
    openDialog('Bảng vàng kỷ niệm');
    const form = document.createElement('form');
    const list = document.createElement('div');
    list.className = 'campus-notes';
    list.setAttribute('aria-live', 'polite');
    field(form, 'Họ tên hoặc biệt danh', 'name', 48).required = true;
    field(form, 'Lớp / Niên khóa', 'classYear', 48).required = true;
    field(form, 'Lời nhắn công khai', 'message', 280, true).required = true;
    const view = ++viewingNotes;
    submit(form, 'Ký tên lưu bút', async data => {
      const { note } = await post('/api/guestbook', { id: requireRoom(), ...Object.fromEntries(data) });
      form.reset();
      complete('guestbook');
      refreshGuestbookBoard();
      list.querySelector('.campus-notes-status')?.remove();
      list.prepend(noteCard(note));
    });
    content.append(form, list);
    const status = document.createElement('p');
    status.className = 'campus-notes-status';
    status.textContent = 'Đang tải lời nhắn…';
    list.append(status);
    fetch('/api/guestbook?voter=' + encodeURIComponent(voter), { cache: 'no-store' })
      .then(async result => {
        const body = await result.json();
        if (!result.ok) throw new Error(body.error);
        if (view !== viewingNotes) return;
        if (body.notes.length || list.children.length > 1) status.remove();
        else status.textContent = 'Chưa có lời nhắn nào.';
        for (const note of body.notes) {
          if (![...list.children].some(card => card.dataset.note === note.id)) list.append(noteCard(note));
        }
      }).catch(error => { status.textContent = error.message; });
  }

  function noteCard(note) {
    const card = document.createElement('article');
    card.dataset.note = note.id;
    const author = document.createElement('strong');
    const group = document.createElement('small');
    const message = document.createElement('p');
    const heart = document.createElement('button');
    author.textContent = note.name;
    group.textContent = note.classYear;
    message.textContent = note.message;
    heart.type = 'button';
    const update = data => {
      heart.textContent = '♥ ' + data.hearts;
      heart.setAttribute('aria-label', 'Thả tim lời nhắn (' + data.hearts + ')');
      heart.disabled = data.liked;
    };
    update(note);
    heart.onclick = async () => {
      heart.disabled = true;
      try { update((await post('/api/guestbook/heart', { id: requireRoom(), noteId: note.id, voter })).note); }
      catch (error) {
        heart.disabled = false;
        notice(error.message);
      }
    };
    card.append(author, group, message, heart);
    return card;
  }

  function captureAllowed() {
    return active && getPlayer() && !indoors && !ceremony && !dialog.open && !classrooms.blocked
      && !horseDialogue.talking && !flowers.giving && !secret.climbing && (!seated || seated.parking);
  }

  function groupMembers() {
    const connection = getRoom();
    const zone = zones.find(zone => distance(zone, walker) <= 5 && Math.abs(zone.y - walker.y) <= 2.7);
    if (!connection.id || !zone) return [];
    return [...connection.players.values()].filter(player => distance(zone, player.target) <= 5
      && distance(walker, player.target) <= 5 && Math.abs(walker.y - player.target.y) <= 2.7);
  }

  function framePortrait(player, members) {
    const center = player.position.clone();
    const subject = player.position.clone().add(vector(0, 1.1, 0));
    let span = 0;
    for (const member of members) {
      center.add(member.root.position);
      span = Math.max(span, distance(player.position, member.root.position));
    }
    center.divideScalar(members.length + 1).add(vector(0, 1.1, 0));
    const aspect = Math.min(1, camera.aspect);
    const distanceFromGroup = Math.max(4, (span + 2.4) / (1.1 * aspect));
    const direction = vector(0, 0, 0);
    const eye = vector(0, 0, 0);
    const probe = vector(0, 0, 0);
    for (const turn of [0, -.45, .45, -.9, .9]) {
      const yaw = walker.yaw + turn;
      direction.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      eye.copy(center).addScaledVector(direction, distanceFromGroup);
      eye.y += .88;
      let clear = true;
      for (let t = .18; t <= 1; t += .16) {
        probe.lerpVectors(subject, eye, t);
        if (!outdoorOpen(probe)) { clear = false; break; }
      }
      if (!clear) continue;
      camera.position.copy(eye);
      camera.lookAt(center);
      return;
    }
    // Back out of the player's eye position if the portrait angle is obstructed.
    if (camera.position.distanceToSquared(subject) < 4) positionCamera();
    camera.lookAt(center);
  }

  async function takePhoto() {
    const parkingPhoto = Boolean(seated?.parking);
    if (captured || !captureAllowed()) return;
    const members = parkingPhoto ? [] : groupMembers();
    const groupPhoto = members.length > 0;
    captured = true;
    resetInput();
    sound.setMemory(true);
    document.body.classList.add('campus-capture');
    try {
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (!captureAllowed()) return;
      const savedPosition = camera.position.clone();
      const savedRotation = camera.quaternion.clone();
      let source;
      try {
        if (!parkingPhoto) framePortrait(getPlayer(), members);
        renderer.render(scene, camera);
        source = renderer.domElement.toDataURL('image/png');
      } finally {
        camera.position.copy(savedPosition);
        camera.quaternion.copy(savedRotation);
        camera.updateMatrixWorld();
      }
      sound.effect('shutter');
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const edge = Math.max(4, Math.round(Math.min(canvas.width, canvas.height) * .018));
      ctx.strokeStyle = '#fff6dc';
      ctx.lineWidth = edge;
      ctx.strokeRect(edge / 2, edge / 2, canvas.width - edge, canvas.height - edge);
      ctx.strokeStyle = '#b08944';
      ctx.lineWidth = Math.max(1, edge * .15);
      ctx.strokeRect(edge * 1.35, edge * 1.35, canvas.width - edge * 2.7, canvas.height - edge * 2.7);
      const date = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
      const mark = 'Kỷ niệm THPT Nguyễn Khuyến - ' + date;
      const size = Math.max(11, Math.min(32, Math.floor(canvas.width / 36)));
      ctx.font = '600 ' + size + 'px system-ui';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      const margin = Math.max(size * .8, edge * 1.8);
      const width = ctx.measureText(mark).width;
      ctx.fillStyle = '#1c1915b8';
      ctx.fillRect(canvas.width - width - margin * 2, canvas.height - size - margin * 2, width + margin * 2, size + margin * 2);
      ctx.fillStyle = '#fff6dc';
      ctx.fillText(mark, canvas.width - margin, canvas.height - margin);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Không tạo được ảnh PNG.');
      openDialog(parkingPhoto ? 'Ảnh nhà xe' : groupPhoto ? 'Ảnh nhóm' : 'Ảnh kỷ niệm');
      document.body.classList.add('campus-photo-open');
      photoUrl = URL.createObjectURL(blob);
      const preview = document.createElement('img');
      preview.src = photoUrl;
      preview.alt = parkingPhoto ? 'Ảnh kỷ niệm nhà xe học sinh' : groupPhoto ? 'Ảnh nhóm trong sân trường' : 'Ảnh kỷ niệm trong sân trường';
      const download = document.createElement('a');
      download.className = 'campus-download';
      download.href = photoUrl;
      download.download = 'ky-niem-thpt-nguyen-khuyen-' + date.replaceAll('/', '-') + '.png';
      download.textContent = 'Tải ảnh PNG';
      content.append(preview, download);
      if (mobile && navigator.canShare) {
        const file = new File([blob], download.download, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          const share = document.createElement('button');
          share.type = 'button';
          share.className = 'campus-download';
          share.textContent = 'Chia sẻ hoặc lưu ảnh';
          share.onclick = () => navigator.share({ files: [file] }).catch(error => {
            if (error.name !== 'AbortError') notice('Dùng nút Tải ảnh PNG để lưu ảnh.');
          });
          content.append(share);
        }
      }
      if (groupPhoto) complete('photo');
    } catch (error) {
      notice(error.message || 'Không chụp được ảnh.');
    } finally {
      captured = false;
      sound.setMemory(Boolean(seated || memoryDialog));
      document.body.classList.remove('campus-capture');
    }
  }

  function handleKey(event) {
    if (captured || dialog.open || horseDialogue.modalOpen || flowers.giving || secret.climbing) return true;
    if (classrooms.blocked) {
      if (!event.repeat && (event.code === 'KeyE' || event.code === 'Space')) {
        event.preventDefault();
        classrooms.standUp();
      }
      return true;
    }
    if (horseDialogue.optionsOpen) {
      if (event.code === 'Escape') {
        horseDialogue.dismiss();
        return true;
      }
      if (event.code === 'KeyE' || event.code === 'KeyP'
        || (event.code === 'Space' && horseDialogue.owns(event.target))) return true;
    }
    if (seated) {
      if (seated.parking && event.code === 'KeyP') {
        if (!event.repeat) void takePhoto();
        return true;
      }
      if (!event.repeat && !['Alt', 'Control', 'Meta', 'Shift'].includes(event.key)) leaveSeat();
      return true;
    }
    if (ceremony) return true;
    if (event.repeat) return false;
    if (event.code === 'Enter' && nearby?.alternate && nearby.alternateReady?.()) { nearby.alternate(); return true; }
    if (event.code === 'KeyP' && captureAllowed()) { void takePhoto(); return true; }
    if (nearby && inReach(nearby) && event.code === nearby.key) { nearby.activate(); return true; }
    return false;
  }

  function click(x, y) {
    if (!active || seated || classrooms.blocked || ceremony || dialog.open || horseDialogue.modalOpen || flowers.giving || secret.climbing) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2);
    ray.setFromCamera(pointer, camera);
    const candidates = [...targets, ...classrooms.targetsNear()].filter(target => target.clickable !== false && inReach(target));
    const objects = new Map(candidates.map(target => [target.object, target]));
    const hit = ray.intersectObjects([...objects.keys()], true)[0];
    for (let object = hit?.object; object; object = object.parent) {
      if (objects.has(object)) { objects.get(object).activate(hit); return; }
    }
  }

  function update(dt, time, started) {
    active = started;
    // Classroom doors and desks reuse the regular movement and interaction loop.
    classrooms.update(dt, started && !indoors);
    flowers.update(dt, time, started);
    secret.update(started, Boolean(indoors || seated || ceremony || dialog.open || horseDialogue.modalOpen || flowers.giving));
    const now = performance.now();
    if (currentEmote && now >= emoteUntil) { currentEmote.removeFromParent(); currentEmote = undefined; }
    for (const door of doors) {
      door.pivot.rotation.y = THREE.MathUtils.lerp(door.pivot.rotation.y, door.open ? Math.PI / 2 : 0, 1 - Math.exp(-dt * 9));
    }
    if (fanOn) fan.rotation.y += dt * 9;
    if (ripples) {
      ripples.visible = Boolean(seated);
      if (seated) ripples.children.forEach((wave, i) => {
        const phase = (time * .48 + i / 4) % 1;
        wave.scale.setScalar(.45 + phase * 3.3);
        wave.material.opacity = .15 * (1 - phase);
      });
    }
    let closestIncense;
    let closestDistance = 18 ** 2;
    activeIncenseLights = 0;
    if (mobile && !indoors) {
      for (const tribute of urns) {
        const distanceSquared = tribute.point.distanceToSquared(camera.position);
        if (now < tribute.until && distanceSquared < closestDistance) {
          closestIncense = tribute;
          closestDistance = distanceSquared;
        }
      }
    }
    for (const tribute of urns) {
      const burning = now < tribute.until;
      tribute.smoke.visible = burning;
      tribute.sticks.visible = burning;
      if (!burning) continue;
      const position = tribute.smoke.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const tip = tribute.lights[i % 3].position;
        const phase = (time * .32 + i / position.count) % 1;
        position.setXYZ(i, tip.x + Math.sin(time * 1.4 + i) * phase * .19, tip.y + phase * 1.28,
          tip.z + Math.cos(time + i * 1.9) * phase * .14);
      }
      position.needsUpdate = true;
      const lit = !indoors && (!mobile || tribute === closestIncense);
      if (lit) activeIncenseLights += tribute.lights.length;
      tribute.lights.forEach((glow, i) => {
        glow.visible = lit;
        glow.intensity = lit ? .12 + Math.sin(time * 12 + i * 2) * .05 : 0;
      });
    }
    if (ceremony && now - ceremony.at >= 3600) {
      const flowers = ceremony.flowers;
      ceremony = undefined;
      biography.hidden = true;
      complete('tribute');
      notice(flowers ? 'Hoàn thành tri ân · Đã dâng hoa.' : 'Hoàn thành tri ân · Đã thắp hương.');
    }
    const player = getPlayer();
    if (seated && player) {
      const { point, direction, parking } = seated;
      const blend = Math.min((now - seated.time) / 320, 1);
      player.position.set(point.x, point.y - .82, point.z);
      player.rotation.y = Math.atan2(direction.x, direction.z);
      player.userData.legs.forEach((leg, i) => {
        leg.rotation.x = -(parking ? 1.13 : Math.PI / 2) * blend;
        player.userData.knees[i].rotation.x = (parking ? 1.51 : Math.PI / 2) * blend;
      });
      player.userData.arms.forEach(arm => { arm.rotation.x = (parking ? -.76 : -.22) * blend; });
      if (parking) {
        player.visible = true;
        camera.position.set(point.x + 1.88, point.y + 1.45, point.z - 3.65);
        camera.lookAt(point.x, point.y + .22, point.z - .22);
      } else {
        player.visible = blend < 1;
        camera.position.copy(point).addScaledVector(direction, .19).add(vector(0, .87, 0));
        camera.lookAt(point.clone().addScaledVector(direction, 12).add(vector(0, .48, 0)));
      }
    }
    if (ceremony) {
      const t = THREE.MathUtils.smoothstep(now - ceremony.at, 0, 900);
      camera.position.lerpVectors(ceremony.from, ceremony.view, t);
      camera.lookAt(ceremony.look);
    }
    if (now >= nextProximity) {
      nextProximity = now + 200;
      if (horseDialogue.optionsOpen && (!started || !horseTarget || !inReach(horseTarget))) horseDialogue.dismiss();
      nearby = undefined;
      let best = Infinity;
      let bestPriority = 0;
      if (started && !seated && !classrooms.blocked && !ceremony && !dialog.open && !flowers.giving && !secret.climbing) {
        for (const target of [...targets, ...classrooms.targetsNear()]) {
          if (target.proximity === false || !inReach(target)) continue;
          const range = distance(target.point, walker);
          const priority = target.priority?.() ?? 0;
          if (priority > bestPriority || (priority === bestPriority && range < best)) {
            nearby = target; best = range; bestPriority = priority;
          }
        }
      }
      if (boardSign && !indoors && distance(boardSign.position, walker) < 12 && now >= nextGuestbookRead) refreshGuestbookBoard();
    }
    const actionable = Boolean(nearby) && !seated && !classrooms.blocked && !ceremony && !dialog.open && !horseDialogue.talking && !flowers.giving && !secret.climbing;
    prompt.hidden = !actionable;
    if (actionable) {
      const label = typeof nearby.label === 'function' ? nearby.label() : nearby.label;
      const caption = mobile ? (nearby.icon || '↵') : label;
      if (action.textContent !== caption) action.textContent = caption;
      if (action.getAttribute('aria-label') !== label) {
        action.setAttribute('aria-label', label);
        action.title = label;
      }
      if (secondary.textContent !== (nearby.alternateLabel || '')) secondary.textContent = nearby.alternateLabel || '';
    }
    secondary.hidden = !(actionable && nearby.alternate && (nearby.alternateReady?.() ?? true));
    const parkingPhoto = Boolean(seated?.parking);
    const photoText = parkingPhoto ? 'Ảnh nhà xe' : 'Ảnh nhóm';
    if (photoCaption.textContent !== photoText) {
      photoCaption.textContent = photoText;
      photo.setAttribute('aria-label', photoText);
    }
    photo.hidden = !started || !captureAllowed();
    photo.disabled = captured;
    photo.title = parkingPhoto ? 'Chụp ảnh nhà xe (P)' : 'Chụp ảnh (P)';
  }

  function showEmote(owner, tile) {
    if (!owner) return;
    if (!emoteAtlas) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.font = '35px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ['👋', '💛', '✦', '☺'].forEach((symbol, i) => {
        ctx.fillStyle = '#302219dd';
        ctx.beginPath(); ctx.arc(32 + i * 64, 32, 23, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe8a1';
        ctx.fillText(symbol, 32 + i * 64, 33);
      });
      emoteAtlas = new THREE.CanvasTexture(canvas);
      emoteAtlas.colorSpace = THREE.SRGBColorSpace;
      emoteAtlas.repeat.set(.25, 1);
      const material = new THREE.SpriteMaterial({ map: emoteAtlas, transparent: true, depthWrite: false });
      emoteAtlas.userData.sprite = new THREE.Sprite(material);
      emoteAtlas.userData.sprite.scale.set(.42, .42, .42);
      emoteAtlas.userData.sprite.position.set(0, 2.48, 0);
    }
    emoteAtlas.offset.x = tile * .25;
    currentEmote = emoteAtlas.userData.sprite;
    owner.add(currentEmote);
    emoteUntil = performance.now() + 1700;
  }

  function openAudio() {
    openDialog('Âm thanh');
    const status = sound.status();
    const current = document.createElement('p');
    current.textContent = 'Đang chọn: ' + status.title;
    content.append(current);
    const options = [
      ['Tự đổi theo hoạt động', () => sound.setMode('auto')],
      ['Xe Đạp', () => sound.setMode('walk')],
      ['Mình Cùng Nhau Đóng Băng', () => sound.setMode('memory')],
      ['Phát luân phiên hai bài', () => sound.setMode('playlist')],
      [status.muted ? 'Bật tiếng' : 'Tắt tiếng', () => sound.toggleMute()]
    ];
    for (const [name, select] of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'campus-destination';
      button.textContent = name;
      button.onclick = () => {
        select();
        if (name === 'Bật tiếng' || name === 'Tắt tiếng') openAudio();
        else dialog.close();
      };
      content.append(button);
    }
  }

  function complete(task) {
    if (progress[task]) return;
    progress[task] = true;
    if (task !== 'photo' && task !== 'chill') showEmote(getPlayer(), task === 'history' ? 2 : 1);
    try { localStorage.setItem('nk-campus-missions', JSON.stringify(progress)); } catch {}
  }

  function showOptions(heading, message, options) {
    openDialog(heading);
    if (message) {
      const description = document.createElement('p');
      description.textContent = message;
      content.append(description);
    }
    for (const [caption, callback] of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'campus-destination';
      button.textContent = caption;
      button.onclick = () => {
        dialog.addEventListener('close', callback, { once: true });
        dialog.close();
      };
      content.append(button);
    }
  }

  function openProgress() {
    openDialog('Tiến độ nhiệm vụ');
    for (const [key, label] of Object.entries(missions)) {
      const line = document.createElement('p');
      line.className = 'campus-progress-item';
      line.textContent = ((key === 'flowers' ? flowers.done : progress[key]) ? '✓ Đã hoàn thành · ' : '○ Chưa hoàn thành · ') + label;
      content.append(line);
    }
    if (progress.history) {
      const badge = document.createElement('p');
      badge.textContent = '🏅 Huy hiệu Tam Nguyên Yên Đổ';
      content.append(badge);
    }
    secret.appendProgress(content);
  }

  function refreshGuestbookBoard() {
    if (!boardSign) return;
    nextGuestbookRead = performance.now() + 15000;
    fetch('/api/guestbook', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).then(data => {
      if (!data) return;
      const texture = boardSign.material.map;
      const ctx = texture.image.getContext('2d');
      ctx.fillStyle = '#3b2b22'; ctx.fillRect(0, 0, 1024, 416);
      ctx.fillStyle = '#ffe1a0'; ctx.font = '700 41px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('BẢNG VÀNG KỶ NIỆM', 512, 48);
      if (!data.notes.length) {
        ctx.font = '29px system-ui'; ctx.fillText('Bấm vào bảng để để lại lời nhắn đầu tiên', 512, 218);
      }
      data.notes.slice(0, 8).forEach((note, i) => {
        ctx.save();
        ctx.translate(140 + (i % 4) * 248, 157 + Math.floor(i / 4) * 151);
        ctx.rotate((i % 3 - 1) * .035);
        ctx.fillStyle = ['#ffe4a0', '#d8e7ba', '#f4c9b7', '#c4dfea'][i % 4];
        ctx.fillRect(-110, -66, 220, 132);
        ctx.fillStyle = '#31251d'; ctx.font = '700 20px system-ui';
        ctx.fillText(note.name, 0, -34, 196);
        ctx.font = '17px system-ui'; ctx.fillText(note.classYear, 0, -9, 196);
        ctx.fillText(note.message.slice(0, 38) + (note.message.length > 38 ? '…' : ''), 0, 29, 195);
        ctx.restore();
      });
      texture.needsUpdate = true;
    }).catch(() => {});
  }

  function registerGateHorse(root) {
    horseTarget = addTarget(root, '[E] Trò chuyện với Bùi Quốc Hiệp 06', 2.8, () => {
      if (!inReach(horseTarget) || !horseDialogue.open()) return;
      resetInput();
      faceHorse(root.position);
    }, { key: 'KeyE', icon: '🐴', preferAction: true, movingObject: root });
  }

  function registerNpc(npc, role) {
    roleNpcs.set(role, npc);
    const labels = { guard: 'Hỏi bác bảo vệ', teacher: 'Trò chuyện với thầy', canteen: 'Ghé cô căng-tin', monitor: 'Hỏi bạn lớp trưởng' };
    addTarget(npc.root, '[E] ' + labels[role], 3, () => talk(role), { key: 'KeyE', icon: '💬', movingObject: npc.root });
  }

  function giveProp(name, color, snack) {
    const player = getPlayer();
    if (!player) return;
    player.userData.campusProp?.removeFromParent();
    const prop = createCampusProp(snack ? 'snack' : name === 'trà sữa' ? 'tea' : 'soda', color);
    player.userData.arms[1].add(prop);
    prop.visible = !player.userData.flowerBouquet;
    player.userData.campusProp = prop;
    notice('Đã nhận ' + name + '.');
  }

  function talk(role) {
    dialogSpeaker = roleNpcs.get(role)?.root;
    showEmote(roleNpcs.get(role)?.root, role === 'guard' ? 0 : role === 'teacher' ? 2 : 3);
    if (role === 'guard') showOptions('Bác bảo vệ', 'Chào con! Ghé tượng đài thắp hương, dạo một vòng sân rồi ra bờ hồ ngồi nghỉ nhé.', [
      ['Xem sơ đồ và dịch chuyển', openTravel], ['Xem nhiệm vụ', openProgress]
    ]);
    if (role === 'teacher') showOptions('Thầy giáo', 'Nguyễn Khuyến là Tam Nguyên Yên Đổ, nhà thơ gắn với làng cảnh Việt Nam. Truyền thống hiếu học của cụ nhắc chúng ta trân trọng việc học. ' +
      (progress.tribute ? 'Thầy ghi nhận em đã tri ân tại tượng đài.' : 'Em có thể ghé lư hương để thực hiện nhiệm vụ tri ân.'), [
      ['Tìm tượng đài', openTravel], ['Thử câu đố lấy huy hiệu', () => showOptions('Câu đố Nguyễn Khuyến', 'Bài nào thuộc chùm thơ thu của Nguyễn Khuyến?', [
        ['Thu điếu', () => { complete('history'); notice('Đúng! Bạn đã nhận huy hiệu Tam Nguyên Yên Đổ.'); }],
        ['Qua Đèo Ngang', () => notice('Chưa đúng. Em có thể hỏi thầy để thử lại.')],
        ['Đây thôn Vĩ Dạ', () => notice('Chưa đúng. Em có thể hỏi thầy để thử lại.')]
      ])]
    ]);
    if (role === 'canteen') showOptions('Cô căng-tin', 'Mời con chọn một món miễn phí để cầm khi chụp ảnh. Gần hồ có ghế đá để nghe nhạc và nghỉ một lát.', [
      ['Trà sữa', () => giveProp('trà sữa', 0xc49a6c)], ['Nước ngọt', () => giveProp('nước ngọt', 0xb94734)],
      ['Bim bim', () => giveProp('bim bim', 0xefb830, true)]
    ]);
    if (role === 'monitor') showOptions('Bạn lớp trưởng',
      (() => {
        const players = getRoom().players;
        let alumni = 0;
        for (const player of players.values()) if (player.profile.role === 'alumni') alumni++;
        return 'Ký tên và ghi niên khóa lên Bảng vàng nhé. Đang có ' + players.size + ' bạn khác online, trong đó có ' + alumni + ' cựu học sinh. Rủ các bạn ra cổng chụp ảnh nhóm nhé!';
      })(), [
        ['Mở bảng vàng', openGuestbook], ['Tìm cổng trường', openTravel]
      ]);
  }

  return {
    init, update, click, handleKey, openTravel, openProgress, openAudio, registerNpc, registerGateHorse, talk,
    classrooms,
    leaveSeat, horseDialogue,
    teleportToMap(point, yaw) { teleport(point, yaw, false); },
    get dialogSpeaker() { return dialog.open ? dialogSpeaker : null; },
    registerFlowerTeacher: flowers.registerTeacher, flowersProfileChanged: flowers.profileChanged,
    registerSecretGuard: secret.registerGuard, registerSecretVendor: secret.registerVendor,
    revealSecretClue: secret.revealClue, secretProfileChanged: secret.profileChanged,
    get trafficWarningActive() { return secret.trafficWarningActive; },
    get blocksMovement() { return Boolean(captured || seated || classrooms.blocked || ceremony || dialog.open || horseDialogue.modalOpen || flowers.giving || secret.climbing); },
    get cameraOverride() { return Boolean(captured || seated || classrooms.blocked || ceremony || secret.climbing); },
    get chilling() { return Boolean(seated); },
    get activeIncenseLights() { return activeIncenseLights; },
    get insideClassroom() { return indoors; },
    get cameraRoomOrigin() { return indoors ? room.origin : null; },
    floorY() { return room.origin.y; },
    canMove(x, z) {
      const origin = room.origin;
      if (Math.abs(x - origin.x) > 4.62 || Math.abs(z - origin.z) > 5.64) return false;
      return !([-2.85, 2.85].some(deskX => Math.abs(x - origin.x - deskX) < 1.12)
        && [-2.1, .3, 2.7].some(deskZ => Math.abs(z - origin.z - deskZ) < .53));
    }
  };
}
