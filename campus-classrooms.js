import * as THREE from 'three';
import { OBB } from 'three/addons/math/OBB.js';

export const classroomConfig = Object.freeze({
  doorOpenRadius: 2.5,
  doorCloseRadius: 3.5,
  doorAngle: Math.PI / 2,
  doorSeconds: .4,
  seatRadius: 1.5,
  seatSeconds: .6,
  boardRadius: 2.5
});

const CELL = 6;
const UP = new THREE.Vector3(0, 1, 0);
const WHITE = '#fff5dc';
const PRACTICE_BOARD = 'practice-c1';
const BOARD_PREVIEW_MS = 220;
const BOARD_KEEPALIVE_MS = 40_000;
const CHALK_REQUEST_TIMEOUT_MS = 5000;
const BOARD_PROMPT_PRIORITY_RADIUS = 1.35;
const chairHitGeometry = new THREE.BoxGeometry(.44, .6, .44);
const chairHitMaterial = new THREE.MeshBasicMaterial();
const smooth = t => t * t * (3 - 2 * t);
const originalName = object => object.userData.name || object.userData.detailedCampusName || object.name;
const boardId = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const cellKey = (x, z) => x * 4096 + z;
const angleBetween = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function setDeskPose(avatar, amount) {
  avatar.userData.legs.forEach((leg, index) => {
    leg.rotation.x = -1.45 * amount;
    avatar.userData.knees[index].rotation.x = 1.42 * amount;
  });
  avatar.userData.arms.forEach(arm => { arm.rotation.x = -.32 * amount; });
}

export function createClassroomSystems({ walker, getPlayer, getRoom, post, floor, collides, notice, resetInput,
  positionCamera, playerBox, openDialog, stand, sound, onBoardSaved }) {
  const doorGrid = new Map();
  const targetGrid = new Map();
  const movingDoors = new Set();
  const nearbyTargets = [];
  const boards = new Map();
  const scratch = new THREE.Vector3();
  const hitBox = new THREE.Box3();
  const rotation = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const cameraDoorHit = new THREE.Vector3();
  let doorTestBox;
  let seating;
  let pending;
  let pose = 0;
  let activeEditor;

  function index(grid, point, item) {
    const key = cellKey(Math.floor(point.x / CELL), Math.floor(point.z / CELL));
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(item);
  }

  function nearby(grid, x, z, visit) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      for (let iz = cz - 1; iz <= cz + 1; iz++) {
        const bucket = grid.get(cellKey(ix, iz));
        if (bucket) for (const item of bucket) if (visit(item)) return true;
      }
    }
    return false;
  }

  function addDoor(leaf, gallery) {
    const world = leaf.matrixWorld.clone();
    const local = new THREE.Box3().setFromObject(leaf, true);
    if (local.isEmpty()) return;
    // Transform the source geometry into hinge space, preserving the real thin leaf.
    const inverse = world.clone().invert();
    const meshBox = new THREE.Box3();
    const transform = new THREE.Matrix4();
    local.makeEmpty();
    leaf.traverse(mesh => {
      mesh.userData.classroomMovingDoor = true;
      if (!mesh.isMesh) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      transform.multiplyMatrices(inverse, mesh.matrixWorld);
      local.union(meshBox.copy(mesh.geometry.boundingBox).applyMatrix4(transform));
    });
    const closed = leaf.quaternion.clone();
    if (gallery && leaf.parent === gallery.parent) closed.copy(gallery.quaternion);
    const hinge = leaf.getWorldPosition(new THREE.Vector3());
    const size = local.getSize(new THREE.Vector3()).multiplyScalar(.5);
    const scale = leaf.getWorldScale(new THREE.Vector3());
    const door = { leaf, hinge, closed, center: local.getCenter(new THREE.Vector3()),
      collider: new OBB(new THREE.Vector3(), size.multiply(scale)), normal: new THREE.Vector3(),
      angle: 0, goal: 0, from: 0, age: 0 };
    setDoorAngle(door, 0);
    door.normal.set(0, 0, 1).transformDirection(leaf.matrixWorld);
    index(doorGrid, hinge, door);
  }

  function setDoorAngle(door, angle) {
    door.leaf.quaternion.copy(door.closed).multiply(turn.setFromAxisAngle(UP, angle));
    door.leaf.updateMatrixWorld(true);
    door.collider.center.copy(door.center).applyMatrix4(door.leaf.matrixWorld);
    door.collider.rotation.setFromMatrix4(rotation.extractRotation(door.leaf.matrixWorld));
  }

  function doorNear(door, x, y, z, limit) {
    return Math.abs(door.hinge.y - y) < 1.5 && Math.hypot(door.hinge.x - x, door.hinge.z - z) <= limit;
  }

  function openNearbyDoor(door) {
      if (door.goal === 0 && doorNear(door, walker.x, walker.y, walker.z, classroomConfig.doorOpenRadius)) {
        const side = scratch.set(walker.x, walker.y, walker.z).sub(door.hinge).dot(door.normal);
        // A positive local Y turn sweeps a +X leaf toward local -Z.
        door.goal = Math.sign(side || 1) * classroomConfig.doorAngle;
        door.from = door.angle;
        door.age = 0;
        movingDoors.add(door);
        sound.effect('door');
      }
      return false;
  }

  function updateDoors(dt, active) {
    if (active) nearby(doorGrid, walker.x, walker.z, openNearbyDoor);
    if (!movingDoors.size) return;
    playerBox(hitBox, walker.x, walker.y, walker.z);
    for (const door of movingDoors) {
      if (door.goal !== 0 && (!active || !doorNear(door, walker.x, walker.y, walker.z, classroomConfig.doorCloseRadius))) {
        door.goal = 0;
        door.from = door.angle;
        door.age = 0;
      }
      if (door.angle === door.goal) {
        if (door.goal === 0) movingDoors.delete(door);
        continue;
      }
      const age = Math.min(door.age + dt, classroomConfig.doorSeconds);
      const angle = age === classroomConfig.doorSeconds ? door.goal
        : THREE.MathUtils.lerp(door.from, door.goal, smooth(age / classroomConfig.doorSeconds));
      // Sample the swept leaf; a door pauses while its next motion would hit the player.
      const increments = Math.max(1, Math.ceil(Math.abs(angle - door.angle) / .14));
      let blocked = false;
      for (let step = 1; step <= increments; step++) {
        setDoorAngle(door, THREE.MathUtils.lerp(door.angle, angle, step / increments));
        if (door.collider.intersectsBox3(hitBox)) { blocked = true; break; }
      }
      if (blocked) setDoorAngle(door, door.angle);
      else { door.age = age; door.angle = angle; }
    }
  }

  function collidesDoor(box) {
    doorTestBox = box;
    return nearby(doorGrid, (box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2, doorTouchesPlayer);
  }

  function doorTouchesPlayer(door) {
    return Math.abs(door.hinge.y - doorTestBox.min.y) < 3 && door.collider.intersectsBox3(doorTestBox);
  }

  function traceCameraDoors(ray, extent, nearest) {
    // The hinge bin can sit just beyond the swept camera area when a leaf is open.
    const minX = Math.floor((extent.min.x - 2) / CELL), maxX = Math.floor((extent.max.x + 2) / CELL);
    const minZ = Math.floor((extent.min.z - 2) / CELL), maxZ = Math.floor((extent.max.z + 2) / CELL);
    for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
      const bucket = doorGrid.get(cellKey(x, z));
      if (!bucket) continue;
      for (const { collider } of bucket) {
        if (collider.center.y < extent.min.y - 2 || collider.center.y > extent.max.y + 2) continue;
        if (collider.containsPoint(ray.origin)) return 0;
        if (collider.intersectRay(ray, cameraDoorHit)) nearest = Math.min(nearest, cameraDoorHit.distanceTo(ray.origin));
      }
    }
    return nearest;
  }

  function addSeat(chair, desk, name) {
    const point = chair.localToWorld(new THREE.Vector3(0, .43, 0));
    const direction = desk.getWorldPosition(new THREE.Vector3()).sub(point).setY(0).normalize();
    if (direction.lengthSq() < .5) return;
    const seat = { point, direction, side: new THREE.Vector3(direction.z, 0, -direction.x),
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), yaw: Math.atan2(-direction.x, -direction.z) };
    // Keep a tiny raycast-only target even when static batching merges the chairs.
    const hitTarget = new THREE.Mesh(chairHitGeometry, chairHitMaterial);
    hitTarget.position.copy(point);
    hitTarget.updateMatrixWorld();
    index(targetGrid, point, { object: hitTarget, point, label: '[E] Ngồi vào bàn', key: 'KeyE', icon: '🪑',
      range: classroomConfig.seatRadius, available: () => !seating && !pending && walker.onGround,
      priority: () => 1, activate: () => { void beginSeat(seat); } });
  }

  function openSpace(point, referenceY) {
    const y = floor(point.x, point.z, referenceY, .14);
    if (y === null || Math.abs(y - referenceY) > .33 || collides(point.x, point.z, y)) return false;
    const room = getRoom();
    for (const remote of room.players.values()) {
      if (Math.abs(remote.target.y - y) < .8 && Math.hypot(remote.target.x - point.x, remote.target.z - point.z) < .5) return false;
    }
    point.y = y;
    return true;
  }

  function safeBySeat(seat, from) {
    const options = [seat.point.clone().addScaledVector(seat.direction, -.58),
      seat.point.clone().addScaledVector(seat.side, -.61), seat.point.clone().addScaledVector(seat.side, .61)];
    options.sort((a, b) => a.distanceToSquared(from) - b.distanceToSquared(from));
    return options.find(point => openSpace(point, seat.point.y - .43));
  }

  async function beginSeat(seat) {
    if (seating || pending || !walker.onGround) return;
    const player = getPlayer();
    const origin = new THREE.Vector3(walker.x, walker.y, walker.z);
    const approach = safeBySeat(seat, origin);
    if (!player || !approach) { notice('Không có lối trống để vào ghế này.'); return; }
    for (const fraction of [.25, .5, .75]) {
      const test = new THREE.Vector3().lerpVectors(origin, approach, fraction);
      if (collides(test.x, test.z, test.y)) { notice('Hãy đi vòng qua bàn để đến ghế.'); return; }
    }
    const id = getRoom().id;
    const token = { seat, id };
    pending = token;
    resetInput();
    try {
      if (id) await post('/api/classroom/seat', { id, seat: seat.id, action: 'claim' }, AbortSignal.timeout(3000));
      if (pending !== token || player !== getPlayer() || (id && getRoom().id !== id)) {
        release(token);
        return;
      }
      const end = seat.point.clone().setY(seat.point.y - .81);
      seating = { ...token, origin, approach, end, fromYaw: walker.yaw, phase: 'sit', elapsed: 0 };
      stand.textContent = 'Đứng dậy [E / Space]';
      stand.hidden = false;
    } catch (error) {
      if (error.name === 'TimeoutError') release(token);
      if (pending === token) notice(error.name === 'TimeoutError' ? 'Chưa giữ được ghế. Hãy thử lại.' : error.message);
    }
    finally { if (pending === token) pending = undefined; }
  }

  function release(state) {
    if (state?.id) post('/api/classroom/seat', { id: state.id, seat: state.seat.id, action: 'release' }).catch(() => {});
  }

  function standUp() {
    if (!seating || seating.phase !== 'seated') return;
    const exit = safeBySeat(seating.seat, seating.approach) || seating.origin.clone();
    if (!openSpace(exit, seating.seat.point.y - .43)) { notice('Lối ra đang bị chắn.'); return; }
    seating.exit = exit;
    seating.phase = 'stand';
    seating.elapsed = 0;
    resetInput();
  }

  function updateSeat(dt) {
    if (!seating || seating.phase === 'seated') return;
    const player = getPlayer();
    if (!player) { reset(); return; }
    seating.elapsed = Math.min(seating.elapsed + dt, classroomConfig.seatSeconds);
    const t = seating.elapsed / classroomConfig.seatSeconds;
    const sitting = seating.phase === 'sit';
    if (sitting && t < .4) scratch.lerpVectors(seating.origin, seating.approach, smooth(t / .4));
    else if (sitting) scratch.lerpVectors(seating.approach, seating.end, smooth((t - .4) / .6));
    else scratch.lerpVectors(seating.end, seating.exit, smooth(t));
    pose = sitting ? smooth(Math.max(0, (t - .4) / .6)) : 1 - smooth(t);
    walker.x = scratch.x; walker.y = scratch.y; walker.z = scratch.z;
    walker.yaw = seating.fromYaw + angleBetween(seating.fromYaw, seating.seat.yaw) * (sitting ? smooth(t) : 1);
    player.position.copy(scratch);
    player.rotation.y = walker.yaw + Math.PI;
    setDeskPose(player, pose);
    positionCamera();
    if (t === 1) {
      if (sitting) seating.phase = 'seated';
      else reset();
    }
  }

  function reset() {
    if (seating) {
      release(seating);
      stand.textContent = 'Đứng dậy';
      stand.hidden = true;
    }
    seating = undefined;
    pending = undefined;
    pose = 0;
  }

  function registerBoard(id, fields) {
    const shared = { id, text: '', color: WHITE, revision: -1 };
    const board = { ...fields, id, shared, text: shared.text, color: shared.color };
    boards.set(id, board);
    return board;
  }

  function addBoard(object, desks, name) {
    const face = object.children.find(child => /chalkboard enamel/i.test(child.material?.name ?? ''));
    if (!face || !desks.length) return;
    face.userData.classroomSurface = true;
    face.geometry.computeBoundingBox();
    const box = face.geometry.boundingBox;
    const center = box.getCenter(new THREE.Vector3());
    const point = face.localToWorld(center.clone());
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(face.matrixWorld);
    if (scratch.copy(desks[0].getWorldPosition(new THREE.Vector3())).sub(point).dot(normal) < 0) normal.negate();
    const front = scratch.set(0, 0, 1).transformDirection(face.matrixWorld).dot(normal) > 0 ? 1 : -1;
    const board = registerBoard(boardId(name), { face, box, center, front, title: 'Viết bảng đen · ' + name.split(' • ').at(-1) });
    point.y -= 1;
    index(targetGrid, point, { object, point, label: '[E] Viết bảng đen', key: 'KeyE', icon: '✍️',
      range: classroomConfig.boardRadius,
      priority: () => Math.hypot(point.x - walker.x, point.z - walker.z) < BOARD_PROMPT_PRIORITY_RADIUS ? 2 : 1,
      available() {
        const dx = point.x - walker.x, dz = point.z - walker.z;
        const length = Math.hypot(dx, dz);
        return Math.abs(walker.y - point.y) < 1.15 && dx * normal.x + dz * normal.z < -.06
          && (-Math.sin(walker.yaw) * dx - Math.cos(walker.yaw) * dz) > length * .43;
      },
      activate: () => editBoard(board) });
  }

  function paintBoard(board) {
    if (!board.canvas) {
      board.canvas = document.createElement('canvas');
      board.canvas.width = 768;
      board.canvas.height = 256;
      board.texture = new THREE.CanvasTexture(board.canvas);
      board.texture.colorSpace = THREE.SRGBColorSpace;
      const { box, center, front } = board;
      const layer = new THREE.Mesh(new THREE.PlaneGeometry(box.max.x - box.min.x, box.max.y - box.min.y),
        new THREE.MeshBasicMaterial({ map: board.texture, transparent: true, depthWrite: false }));
      layer.position.set(center.x, center.y, front > 0 ? box.max.z + .004 : box.min.z - .004);
      if (front < 0) layer.rotation.y = Math.PI;
      board.face.add(layer);
    }
    const ctx = board.canvas.getContext('2d');
    ctx.clearRect(0, 0, 768, 256);
    ctx.font = 'italic 38px "Segoe Print", "Comic Sans MS", cursive';
    ctx.fillStyle = board.color;
    ctx.globalAlpha = .84;
    let y = 51;
    for (const paragraph of board.text.split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > 700) {
          if (y <= 239) ctx.fillText(line, 32, y, 700);
          y += 44;
          line = word;
        } else line = next;
      }
      if (y <= 239) ctx.fillText(line, 32, y, 700);
      y += 44;
      if (y > 239) break;
    }
    // Subtle repeatable grain keeps the lettering from looking like flat signage.
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#0004';
    for (let i = 0; i < 520; i++) ctx.fillRect((i * 151) % 768, (i * 73) % 256, 1, 2);
    ctx.globalCompositeOperation = 'source-over';
    board.texture.needsUpdate = true;
  }

  function renderBoard(board, { text, color }) {
    if (board.text === text && board.color === color) return;
    Object.assign(board, { text, color });
    if (board.draw) board.draw(board);
    else if (text || board.canvas) paintBoard(board);
  }

  function syncBoard(state) {
    const board = boards.get(state?.id);
    if (!board || state.revision < board.shared.revision) return;
    board.shared = state;
    // A delayed preview acknowledgment must not replace newer local keystrokes.
    if (activeEditor?.board === board) {
      if (activeEditor.writing) return;
      activeEditor.follow(state);
    }
    renderBoard(board, state);
  }

  function restoreBoards(snapshot) {
    activeEditor?.dialog.close();
    activeEditor = undefined;
    const states = new Map(snapshot.map(state => [state.id, state]));
    for (const board of boards.values()) {
      board.shared = states.get(board.id) ?? { id: board.id, text: '', color: WHITE, revision: -1 };
      renderBoard(board, board.shared);
    }
  }

  function editBoard(board) {
    const { dialog, content } = openDialog(board.title);
    const id = getRoom().id;
    const sameRoom = () => getRoom().id === id;
    const request = (action, fields = {}) => post('/api/classroom/board', { id, boardId: board.id, action, ...fields }, AbortSignal.timeout(CHALK_REQUEST_TIMEOUT_MS));
    resetInput();
    const editor = document.createElement('textarea');
    editor.setAttribute('aria-label', 'Nội dung trên bảng');
    editor.placeholder = 'Nhập nội dung viết phấn…';
    editor.maxLength = 260;
    editor.rows = 4;
    editor.value = board.text;
    const color = document.createElement('select');
    color.setAttribute('aria-label', 'Màu phấn');
    color.append(new Option('Trắng kem', WHITE), new Option('Xanh nhạt', '#c6e8f9'), new Option('Hồng nhạt', '#ffd4db'));
    color.value = board.color;
    const session = { board, dialog, writing: !id, follow(state) { editor.value = state.text; color.value = state.color; } };
    activeEditor = session;
    const clear = document.createElement('button');
    clear.textContent = 'Xóa bảng';
    const done = document.createElement('button');
    done.textContent = 'Xong';
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const sharedHint = 'Người chơi cùng phòng thấy nội dung bạn đang viết.';
    const setDisabled = disabled => { editor.disabled = color.disabled = clear.disabled = done.disabled = disabled; };
    const draft = () => ({ text: editor.value, color: color.value });
    let token;
    let timer;
    let keepalive;
    let preview;
    let save;
    let closed = false;
    let saved = false;

    function schedulePreview() {
      if (!token || timer || closed || save || !sameRoom()) return;
      timer = setTimeout(sendPreview, BOARD_PREVIEW_MS);
    }

    function sendPreview() {
      timer = undefined;
      if (!token || preview || closed || save || !sameRoom()) return;
      const sent = draft();
      preview = request('preview', { token, ...sent }).then(result => {
        if (sameRoom()) syncBoard(result.board);
        if (!closed) status.textContent = sharedHint;
      }).catch(error => {
        if (!closed) status.textContent = error.message;
      }).finally(() => {
        preview = undefined;
        if (sent.text !== editor.value || sent.color !== color.value) schedulePreview();
      });
    }

    const update = () => { renderBoard(board, draft()); schedulePreview(); };
    editor.oninput = event => { if (!event.isComposing) update(); };
    editor.oncompositionend = update;
    color.onchange = update;
    clear.onclick = () => { editor.value = ''; update(); };

    const opening = id ? (async () => {
      setDisabled(true);
      status.textContent = 'Đang kết nối bảng…';
      try {
        if (board.id === PRACTICE_BOARD) await post('/api/move', { id, position: walker }, AbortSignal.timeout(CHALK_REQUEST_TIMEOUT_MS));
        const result = await request('edit');
        token = result.token;
        if (!sameRoom()) return;
        syncBoard(result.board);
        if (closed) return;
        session.writing = true;
        setDisabled(false);
        status.textContent = sharedHint;
        editor.focus();
        keepalive = setInterval(schedulePreview, BOARD_KEEPALIVE_MS);
      } catch (error) {
        if (!closed) status.textContent = error.message;
      }
    })() : Promise.resolve();

    done.onclick = () => {
      if (save) return;
      clearTimeout(timer);
      timer = undefined;
      const fields = draft();
      setDisabled(true);
      save = (async () => {
        await preview;
        if (!sameRoom()) throw new Error('Phòng chơi đã ngắt. Hãy mở lại bảng.');
        if (id) {
          const result = await request('save', { token, ...fields });
          if (sameRoom()) syncBoard(result.board);
        } else board.shared = { ...board.shared, ...fields };
        saved = true;
        sound.effect('chalk');
        onBoardSaved();
        if (!closed) dialog.close();
      })().catch(error => { if (!closed) status.textContent = error.message; }).finally(() => {
        save = undefined;
        if (!closed) setDisabled(false);
      });
    };

    dialog.addEventListener('close', async () => {
      closed = true;
      clearTimeout(timer);
      clearInterval(keepalive);
      if (activeEditor === session) activeEditor = undefined;
      await opening;
      await save;
      await preview;
      if (!saved && token) {
        try {
          const result = await request('cancel', { token });
          if (sameRoom()) syncBoard(result.board);
        } catch { /* A closed or disconnected room releases the edit on the server. */ }
      }
      if (sameRoom() && activeEditor?.board !== board) renderBoard(board, board.shared);
    }, { once: true });
    const controls = document.createElement('div');
    controls.className = 'classroom-board-controls';
    controls.append(color, clear, done);
    content.append(editor, controls, status);
    if (!id) {
      status.textContent = 'Chưa kết nối phòng. Chữ viết chỉ hiện trên máy của bạn.';
      editor.focus();
    }
  }

  function prepare(campus) {
    campus.updateMatrixWorld(true);
    const rooms = new Map();
    const galleries = new Map();
    campus.traverseVisible(object => {
      const name = originalName(object);
      if (name.endsWith(' • Gallery terracotta')) galleries.set(name.split(' • ').slice(0, -1).join(' • '), object);
      const match = name.match(/^(.+) • P(\d{3}) • (Door|Blackboard|(?:Chair|Desk) \d+\.\d+)$/u);
      if (!match) return;
      const key = `${match[1]} • P${match[2]}`;
      if (!rooms.has(key)) rooms.set(key, { wing: match[1], objects: new Map() });
      rooms.get(key).objects.set(match[3], object);
    });
    for (const [name, { wing, objects }] of rooms) {
      if (objects.has('Door')) addDoor(objects.get('Door'), galleries.get(wing));
      const desks = [];
      for (const [kind, object] of objects) {
        if (!kind.startsWith('Desk ')) continue;
        desks.push(object);
        const chair = objects.get(`Chair ${kind.slice(5)}`);
        if (chair) addSeat(chair, object, `${name}-${kind}`);
      }
      if (objects.has('Blackboard')) addBoard(objects.get('Blackboard'), desks, name);
    }
  }

  return {
    prepare, collidesDoor, traceCameraDoors, standUp, reset, syncBoard, restoreBoards, editBoard,
    registerPracticeBoard: draw => registerBoard(PRACTICE_BOARD, { draw, title: 'Bảng xanh lớp C1' }),
    targetsNear() { nearbyTargets.length = 0; nearby(targetGrid, walker.x, walker.z, target => { nearbyTargets.push(target); }); return nearbyTargets; },
    update(dt, active) { updateDoors(dt, active); if (active) updateSeat(dt); },
    get blocked() { return Boolean(seating || pending); },
    get pose() { return pose; }
  };
}
