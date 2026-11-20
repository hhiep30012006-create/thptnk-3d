import * as THREE from 'three';

export const REMEMBER_CAMERA_MODE = true;
export const ENABLE_CAMERA_HEAD_BOB = true;
export const CameraMode = Object.freeze({ THIRD: 'third', FIRST: 'first', OVERVIEW: 'overview' });
const MODE_ORDER = [CameraMode.THIRD, CameraMode.FIRST, CameraMode.OVERVIEW];
const STORAGE_KEY = 'thptnk-camera-mode';
const radians = THREE.MathUtils.degToRad;
const { clamp, lerp } = THREE.MathUtils;

export const CAMERA_VIEWS = Object.freeze({
  third: { label: 'Góc nhìn thứ ba', fov: 58, near: .1, far: 900, height: 3.2,
    liftLimits: [1.6, 6.2], distance: 7.5, zoomLimits: [4.5, 13], focus: 1.12 },
  first: { label: 'Góc nhìn thứ nhất', fov: 76, near: .035, far: 900, height: 1.64,
    forward: .15, pitchLimit: radians(80), bobHeight: .024, bobRate: 10 },
  overview: { label: 'Góc nhìn từ trên cao', fov: 62, near: .18, far: 900, height: 32,
    zoomLimits: [25, 40], pitch: radians(53), pitchLimits: [radians(45), radians(60)],
    followRate: 7, roofClearance: 2, fogFactor: .38 }
});

const TRANSITION_SECONDS = .7;
const DRAG_THRESHOLD = 6;
const YAW_PER_PIXEL = .005;
const COLLISION_RADIUS = .16;
const COLLISION_PADDING = .22;
const COLLISION_RELEASE_RATE = 12;
const ROOM_HALF_WIDTH = 4.75;
const ROOM_HALF_DEPTH = 5.77;
const UP = new THREE.Vector3(0, 1, 0);
const smooth = t => t * t * (3 - 2 * t);

function initialMode() {
  if (REMEMBER_CAMERA_MODE) {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (MODE_ORDER.includes(saved)) return saved;
    } catch { /* The browser can disable storage. */ }
  }
  return CameraMode.THIRD;
}

export class CameraController {
  constructor({ camera, canvas, walker, getAvatar, getRoomOrigin, canLook, onTap, trace, roofHeight, onModeChanged }) {
    Object.assign(this, { camera, canvas, walker, getAvatar, getRoomOrigin, canLook, onTap, trace, roofHeight, onModeChanged });
    this.mode = initialMode();
    this.modeBeforeBlend = this.mode;
    this.blendAge = TRANSITION_SECONDS;
    this.overviewWeight = Number(this.mode === CameraMode.OVERVIEW);
    this.distance = CAMERA_VIEWS.third.distance;
    this.lift = CAMERA_VIEWS.third.height;
    this.overviewHeight = CAMERA_VIEWS.overview.height;
    this.overviewPitch = CAMERA_VIEWS.overview.pitch;
    this.firstPitch = 0;
    this.bobPhase = 0;
    this.bobWeight = 0;
    this.avatarAlpha = 1;
    this.orbitFraction = 1;
    this.suspended = false;
    this.ready = false;
    this.pointers = new Map();
    this.abort = new AbortController();
    this.focus = new THREE.Vector3();
    this.eye = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.follow = new THREE.Vector3();
    this.previousFeet = new THREE.Vector3();
    this.fromFeet = new THREE.Vector3();
    this.fromEye = new THREE.Vector3();
    this.rotation = new THREE.Quaternion();
    this.fromRotation = new THREE.Quaternion();
    this.lookMatrix = new THREE.Matrix4();
    this.bindInput();
    this.notify();
  }

  get inTransition() { return this.blendAge < TRANSITION_SECONDS; }
  get fogFactor() { return lerp(1, CAMERA_VIEWS.overview.fogFactor, this.overviewWeight); }
  get firstPersonHidden() { return !this.suspended && this.avatarAlpha < .5; }

  get yaw() {
    this.camera.getWorldDirection(this.forward);
    return Math.atan2(-this.forward.x, -this.forward.z);
  }

  notify() {
    this.onModeChanged(this.mode, this.inTransition || this.suspended);
  }

  setMode(mode) {
    if (!MODE_ORDER.includes(mode) || mode === this.mode || this.inTransition || this.suspended) return;
    this.modeBeforeBlend = this.mode;
    this.mode = mode;
    if (REMEMBER_CAMERA_MODE) {
      try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* Storage is optional. */ }
    }
    this.beginBlend();
  }

  cycleMode() {
    this.setMode(MODE_ORDER[(MODE_ORDER.indexOf(this.mode) + 1) % MODE_ORDER.length]);
  }

  beginBlend() {
    this.cancelLook();
    this.blendAge = 0;
    this.fromEye.copy(this.camera.position);
    this.fromRotation.copy(this.camera.quaternion);
    this.fromFeet.set(this.walker.x, this.walker.y, this.walker.z);
    this.fromFov = this.camera.fov;
    this.fromNear = this.camera.near;
    this.fromFar = this.camera.far;
    this.fromOverviewWeight = this.overviewWeight;
    this.fromAvatarAlpha = this.avatarAlpha;
    this.notify();
  }

  firstFrame() {
    this.ready = false;
    this.suspended = false;
    this.blendAge = TRANSITION_SECONDS;
    this.update(0);
    this.notify();
  }

  suspend() {
    if (this.suspended) return;
    this.suspended = true;
    this.cancelLook();
    this.overviewWeight = 0;
    this.setAvatarAlpha(1);
    const { fov, near, far } = CAMERA_VIEWS.third;
    this.setProjection(fov, near, far);
    this.notify();
  }

  setProjection(fov, near, far) {
    const camera = this.camera;
    if (camera.fov === fov && camera.near === near && camera.far === far) return;
    camera.fov = fov;
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  }

  setAvatarAlpha(alpha) {
    const avatar = this.getAvatar();
    if (avatar !== this.avatar) {
      this.avatar = avatar;
      this.avatarAlpha = 1;
      const materials = new Set();
      avatar?.traverse(mesh => {
        if (!mesh.isMesh) return;
        if (Array.isArray(mesh.material)) mesh.material.forEach(material => materials.add(material));
        else materials.add(mesh.material);
      });
      this.avatarMaterials = Array.from(materials, material => ({
        material, transparent: material.transparent, opacity: material.opacity, depthWrite: material.depthWrite
      }));
    }
    if (!avatar || this.avatarAlpha === alpha) return;
    this.avatarAlpha = alpha;
    avatar.visible = alpha > .001;
    const fading = alpha > .001 && alpha < .999;
    for (const { material, transparent, opacity, depthWrite } of this.avatarMaterials) {
      material.transparent = transparent || fading;
      material.opacity = fading ? opacity * alpha : opacity;
      material.depthWrite = depthWrite && !fading;
    }
  }

  clampRoom(eye, room) {
    eye.x = clamp(eye.x, room.x - ROOM_HALF_WIDTH, room.x + ROOM_HALF_WIDTH);
    eye.z = clamp(eye.z, room.z - ROOM_HALF_DEPTH, room.z + ROOM_HALF_DEPTH);
  }

  orbitPose(dt, room, distance = this.distance) {
    const { x, y, z } = this.walker;
    this.focus.set(x, y + CAMERA_VIEWS.third.focus, z);
    this.eye.copy(this.focus).addScaledVector(this.forward, -(room ? Math.min(2.6, distance) : distance));
    this.eye.y = y + (room ? 2.35 : this.lift);
    this.target.copy(this.focus);
    if (room) {
      this.clampRoom(this.eye, room);
      this.target.add(this.forward).setY(y + 1.42);
      this.orbitFraction = 1;
    } else {
      const clear = this.trace(this.focus, this.eye);
      // Constrain immediately on a hit. Ease outward as the obstacle clears.
      this.orbitFraction = Math.min(clear, lerp(this.orbitFraction, 1, 1 - Math.exp(-dt * COLLISION_RELEASE_RATE)));
      this.eye.lerpVectors(this.focus, this.eye, this.orbitFraction);
    }
  }

  firstPersonPose(dt, room, moving) {
    const { x, y, z, onGround } = this.walker;
    const view = CAMERA_VIEWS.first;
    this.bobWeight = lerp(this.bobWeight, Number(ENABLE_CAMERA_HEAD_BOB && moving && onGround), 1 - Math.exp(-dt * 11));
    this.bobPhase += dt * view.bobRate;
    this.focus.set(x, y + view.height + Math.sin(this.bobPhase) * view.bobHeight * this.bobWeight, z);
    this.eye.copy(this.focus).addScaledVector(this.forward, view.forward);
    if (room) this.clampRoom(this.eye, room);
    else this.eye.lerpVectors(this.focus, this.eye, this.trace(this.focus, this.eye));
    this.target.copy(this.eye).addScaledVector(this.forward, Math.cos(this.firstPitch));
    this.target.y += Math.sin(this.firstPitch);
  }

  overviewPose(room) {
    const view = CAMERA_VIEWS.overview;
    const y = room ? 3.24 : this.overviewHeight;
    this.target.copy(this.follow).addScaledVector(UP, view.roofClearance * .35);
    this.eye.copy(this.follow).addScaledVector(this.forward, -y / Math.tan(this.overviewPitch));
    this.eye.y += y;
    if (room) this.clampRoom(this.eye, room);
    else this.eye.y = Math.max(this.eye.y, this.roofHeight(this.eye.x, this.eye.z) + view.roofClearance);
  }

  // Existing desk and photo scripts can request a compact shot with the same collision probe.
  placeThirdPerson(distance) {
    this.forward.set(-Math.sin(this.walker.yaw), 0, -Math.cos(this.walker.yaw));
    this.orbitFraction = 1;
    this.orbitPose(0, this.getRoomOrigin(), distance);
    this.camera.position.copy(this.eye);
    this.camera.lookAt(this.target);
  }

  update(dt) {
    const { x, y, z, yaw } = this.walker;
    const room = this.getRoomOrigin();
    if (!this.canLook() && this.pointers.size) this.cancelLook();
    if (!this.ready || room !== this.previousRoom) {
      this.follow.set(x, y, z);
      this.previousFeet.copy(this.follow);
      this.previousRoom = room;
      this.orbitFraction = 1;
    }
    this.ready = true;
    if (this.suspended) {
      this.suspended = false;
      this.modeBeforeBlend = null;
      this.beginBlend();
    }
    const moving = Math.hypot(x - this.previousFeet.x, z - this.previousFeet.z) > dt * .35;
    this.previousFeet.set(x, y, z);
    this.forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    // A map teleport already fades the screen. Reset the overview's follow lag across that distance.
    if (this.follow.distanceToSquared(this.previousFeet) > 8 ** 2) this.follow.copy(this.previousFeet);
    this.follow.lerp(this.previousFeet, 1 - Math.exp(-dt * CAMERA_VIEWS.overview.followRate));
    if (this.mode === CameraMode.FIRST) this.firstPersonPose(dt, room, moving);
    else if (this.mode === CameraMode.OVERVIEW) this.overviewPose(room);
    else this.orbitPose(dt, room);

    const preset = CAMERA_VIEWS[this.mode];
    const overview = Number(this.mode === CameraMode.OVERVIEW);
    const alpha = Number(this.mode !== CameraMode.FIRST);
    this.rotation.setFromRotationMatrix(this.lookMatrix.lookAt(this.eye, this.target, UP));
    const camera = this.camera;
    camera.position.copy(this.eye);
    camera.quaternion.copy(this.rotation);
    if (this.inTransition) {
      this.blendAge = Math.min(TRANSITION_SECONDS, this.blendAge + dt);
      const t = smooth(this.blendAge / TRANSITION_SECONDS);
      camera.position.lerp(this.fromEye, 1 - t).addScaledVector(this.previousFeet, 1 - t).addScaledVector(this.fromFeet, t - 1);
      // A low orbit/eye blend still has to stay on the player's side of walls.
      if (!room && this.mode !== CameraMode.OVERVIEW && this.modeBeforeBlend !== CameraMode.OVERVIEW && this.modeBeforeBlend !== null) {
        camera.position.lerp(this.focus, 1 - this.trace(this.focus, camera.position));
      }
      camera.quaternion.slerpQuaternions(this.fromRotation, this.rotation, t);
      this.setProjection(lerp(this.fromFov, preset.fov, t), lerp(this.fromNear, preset.near, t), lerp(this.fromFar, preset.far, t));
      this.overviewWeight = lerp(this.fromOverviewWeight, overview, t);
      const fade = alpha === 0 ? smooth(clamp(t * 2.8, 0, 1)) : smooth(clamp((t - .25) * 2.2, 0, 1));
      this.setAvatarAlpha(lerp(this.fromAvatarAlpha, alpha, fade));
      if (!this.inTransition) this.notify();
    } else {
      this.setProjection(preset.fov, preset.near, preset.far);
      this.overviewWeight = overview;
      this.setAvatarAlpha(alpha);
    }
  }

  zoom(amount) {
    if (this.mode === CameraMode.THIRD) this.distance = clamp(this.distance + amount, ...CAMERA_VIEWS.third.zoomLimits);
    if (this.mode === CameraMode.OVERVIEW) this.overviewHeight = clamp(this.overviewHeight + amount * 2, ...CAMERA_VIEWS.overview.zoomLimits);
  }

  bindInput() {
    const { canvas } = this;
    const { signal } = this.abort;
    const available = () => !this.inTransition && !this.suspended && this.canLook();
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !available() || this.pointers.size >= 2) return;
      const { pointerId, clientX: x, clientY: y } = event;
      this.pointers.set(pointerId, { x, y, startX: x, startY: y, moved: this.pointers.size > 0 });
      if (this.pointers.size > 1) for (const pointer of this.pointers.values()) pointer.moved = true;
      canvas.setPointerCapture(pointerId);
    }, { signal });
    canvas.addEventListener('pointermove', event => {
      const pointer = this.pointers.get(event.pointerId);
      if (!pointer || !available()) return;
      const { clientX: x, clientY: y } = event;
      if (this.pointers.size > 1) {
        for (const other of this.pointers.values()) {
          if (other === pointer) continue;
          this.zoom((Math.hypot(pointer.x - other.x, pointer.y - other.y) - Math.hypot(x - other.x, y - other.y)) * .025);
        }
      } else {
        if (!pointer.moved && Math.hypot(x - pointer.startX, y - pointer.startY) < DRAG_THRESHOLD) return;
        pointer.moved = true;
        this.walker.yaw -= (x - pointer.x) * YAW_PER_PIXEL;
        const dy = y - pointer.y;
        if (this.mode === CameraMode.THIRD) this.lift = clamp(this.lift + dy * .015, ...CAMERA_VIEWS.third.liftLimits);
        if (this.mode === CameraMode.FIRST) {
          const limit = CAMERA_VIEWS.first.pitchLimit;
          this.firstPitch = clamp(this.firstPitch - dy * .004, -limit, limit);
        }
        if (this.mode === CameraMode.OVERVIEW) this.overviewPitch = clamp(this.overviewPitch + dy * .004, ...CAMERA_VIEWS.overview.pitchLimits);
      }
      pointer.x = x;
      pointer.y = y;
    }, { signal });
    const release = event => {
      const pointer = this.pointers.get(event.pointerId);
      this.pointers.delete(event.pointerId);
      if (event.type === 'pointerup' && pointer && !pointer.moved && available()) this.onTap(event.clientX, event.clientY);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, release, { signal });
    canvas.addEventListener('wheel', event => {
      if (!available() || this.mode === CameraMode.FIRST) return;
      event.preventDefault();
      this.zoom(Math.sign(event.deltaY) * .7);
    }, { signal, passive: false });
    window.addEventListener('blur', () => this.cancelLook(), { signal });
  }

  cancelLook() {
    for (const id of this.pointers.keys()) {
      this.pointers.delete(id);
      if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    }
  }

  dispose() {
    this.cancelLook();
    this.abort.abort();
    this.setAvatarAlpha(1);
  }
}

// Reuse the movement broad phase. Camera rays also see roofs and upper branches,
// which are excluded from movement colliders so balconies stay walkable.
export function createCameraProbe({ cellSize, cellKey, wallGrid, surfaceGrid, obstacleGrid, traceDoors }) {
  const ray = new THREE.Ray();
  const extent = new THREE.Box3();
  const hit = new THREE.Vector3();
  const side = new THREE.Vector3();
  const lift = new THREE.Vector3();
  const visited = new Set();
  const candidates = [];
  const grids = [wallGrid, surfaceGrid, obstacleGrid];
  return function trace(from, to) {
    const length = ray.direction.subVectors(to, from).length();
    if (length < .001) return 1;
    ray.direction.divideScalar(length);
    side.crossVectors(ray.direction, UP).normalize().multiplyScalar(COLLISION_RADIUS);
    lift.crossVectors(side, ray.direction);
    if (!side.lengthSq()) { side.set(COLLISION_RADIUS, 0, 0); lift.set(0, 0, COLLISION_RADIUS); }
    extent.min.copy(from).min(to).addScalar(-COLLISION_RADIUS);
    extent.max.copy(from).max(to).addScalar(COLLISION_RADIUS);
    const minX = Math.floor(extent.min.x / cellSize), maxX = Math.floor(extent.max.x / cellSize);
    const minZ = Math.floor(extent.min.z / cellSize), maxZ = Math.floor(extent.max.z / cellSize);
    visited.clear();
    candidates.length = 0;
    for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
      const key = cellKey(x, z);
      for (const grid of grids) {
        const bucket = grid.get(key);
        if (!bucket) continue;
        for (const entry of bucket) {
          if (visited.has(entry)) continue;
          visited.add(entry);
          if (extent.intersectsBox(entry.box ?? entry)) candidates.push(entry);
        }
      }
    }
    let nearest = length + COLLISION_PADDING;
    for (let i = 0; i < 5; i++) {
      ray.origin.copy(from);
      if (i === 1 || i === 2) ray.origin.addScaledVector(side, i === 1 ? 1 : -1);
      if (i === 3 || i === 4) ray.origin.addScaledVector(lift, i === 3 ? 1 : -1);
      for (const entry of candidates) {
        const box = entry.box ?? entry;
        if (!ray.intersectBox(box, hit)) continue;
        if (entry.triangle) {
          const { a, b, c } = entry.triangle;
          if (!ray.intersectTriangle(a, b, c, false, hit)) continue;
        } else if (box.containsPoint(ray.origin)) return 0;
        nearest = Math.min(nearest, hit.distanceTo(ray.origin));
      }
      nearest = traceDoors(ray, extent, nearest);
      if (nearest <= COLLISION_PADDING) return 0;
    }
    return clamp((nearest - COLLISION_PADDING) / length, 0, 1);
  };
}
