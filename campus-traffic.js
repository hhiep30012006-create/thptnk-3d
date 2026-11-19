import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const palette = {
  tire: 0x22262b, rim: 0x88909a, glass: 0x536b7a, frame: 0x31383c,
  white: 0xded5bd, skin: 0xc88d68, pants: 0x333942, rear: 0xaa3d32
};
const trafficGlow = { value: 0 };
const trafficMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85 });
trafficMaterial.onBeforeCompile = shader => {
  shader.uniforms.trafficGlow = trafficGlow;
  shader.vertexShader = `
    attribute float paintSource;
    attribute float partStyle;
    attribute float lampFace;
    attribute float cabOffset;
    attribute float trafficStyle;
    attribute vec3 trafficShirt;
    attribute vec3 trafficHelmet;
    varying float vTrafficLamp;
  ` + shader.vertexShader.replace(
    '#include <color_vertex>',
    THREE.ShaderChunk.color_vertex.replace('vColor.xyz *= instanceColor.xyz;', `
      if (paintSource == 1.0) vColor.xyz *= instanceColor.xyz;
      if (paintSource == 2.0) vColor.xyz *= trafficShirt;
      if (paintSource == 3.0) vColor.xyz *= trafficHelmet;
    `)
  ).replace('#include <begin_vertex>', `
    #include <begin_vertex>
    vTrafficLamp = lampFace;
    if (trafficStyle == 4.0) transformed.z += cabOffset;
    if ((partStyle == 1.0 && trafficStyle >= 2.0) ||
        (partStyle == 2.0 && trafficStyle < 2.0) ||
        (partStyle == 3.0 && trafficStyle != 2.0) ||
        (partStyle == 4.0 && trafficStyle != 4.0) ||
        (partStyle == 5.0 && trafficStyle != 1.0)) transformed = vec3(0.0);
  `);
  shader.fragmentShader = `
    uniform float trafficGlow;
    varying float vTrafficLamp;
  ` + shader.fragmentShader.replace('#include <emissivemap_fragment>', `
    #include <emissivemap_fragment>
    totalEmissiveRadiance += vec3(1.0, .72, .37) * trafficGlow * vTrafficLamp;
  `);
};
const shape = {
  box: new THREE.BoxGeometry(1, 1, 1),
  wheel: new THREE.CylinderGeometry(1, 1, 1, 10).rotateZ(Math.PI / 2),
  head: new THREE.IcosahedronGeometry(1, 0)
};

const schedule = [
  { type: 'motorbike', color: 0x655f83, shirt: 0x396781, helmet: 0xdcd8cb, side: -1, start: .36 },
  { type: 'scooter', color: 0xab534c, shirt: 0x986c42, helmet: 0x31343c, side: -1, start: .56 },
  { type: 'ebike', color: 0x7a9690, shirt: 0x777e86, helmet: 0x477786, side: -1, start: .78 },
  { type: 'car', color: 0xc8c4b8, shirt: 0x726755, helmet: 0x242830, side: -1, start: .63 },
  { type: 'bicycle', color: 0x666393, shirt: 0xb2a178, helmet: 0xa04b45, side: 1, start: .32 },
  { type: 'motorbike', color: 0x315d72, shirt: 0x747b85, helmet: 0xe8dec7, side: 1, start: .52 },
  { type: 'scooter', color: 0xb39465, shirt: 0x526e84, helmet: 0x365b7d, side: 1, start: .74 },
  { type: 'truck', color: 0x557377, shirt: 0xb29858, helmet: 0x9d4f46, side: 1, start: .44 }
];

// Part styles select optional bodywork using a single geometry per wheel class.
const styleByType = { motorbike: 0, scooter: 1, ebike: 2, bicycle: 3, car: 0, truck: 4 };
const PAINT = 1, SHIRT = 2, HELMET = 3;

function makeVehicleGeometry(wide) {
  const geometries = [];
  let cabin = 0;
  const part = (g, tint, x, y, z, w, h, d, angle = 0, style = 0, lamp = 0) => {
    const copy = g.index ? g.toNonIndexed() : g.clone();
    copy.scale(w, h, d);
    if (angle) copy.rotateX(angle);
    copy.translate(x, y, z);
    const source = tint <= HELMET ? tint : 0;
    const color = new THREE.Color(source ? 0xffffff : tint);
    const count = copy.attributes.position.count;
    const values = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) color.toArray(values, i * 3);
    copy.setAttribute('color', new THREE.BufferAttribute(values, 3));
    for (const [name, value] of [['paintSource', source], ['partStyle', style], ['lampFace', lamp], ['cabOffset', cabin]]) {
      copy.setAttribute(name, new THREE.BufferAttribute(new Float32Array(count).fill(value), 1));
    }
    geometries.push(copy);
  };
  const box = (tint, x, y, z, w, h, d, angle, style) => part(shape.box, tint, x, y, z, w, h, d, angle, style);
  const lamp = (x, y, z, w, h) => part(shape.box, 0xeddfb7, x, y, z, w, h, .045, 0, 0, 1);
  function wheel(x, z, r, thickness) {
    part(shape.wheel, palette.tire, x, r, z, thickness, r, r);
    part(shape.wheel, palette.rim, x, r, z, thickness + .008, r * .57, r * .57);
  }
  function rider(x, y, z, scale = 1) {
    const k = scale;
    box(SHIRT, x, y + .25 * k, z, .33 * k, .46 * k, .23 * k, -.14);
    for (const side of [-1, 1]) {
      box(SHIRT, x + side * .183 * k, y + .22 * k, z + .17 * k, .085 * k, .275 * k, .08 * k, -.73);
      box(palette.pants, x + side * .115 * k, y - .015 * k, z + .103 * k, .108 * k, .27 * k, .12 * k, .64);
    }
    part(shape.head, palette.skin, x, y + .58 * k, z + .039, .119 * k, .144 * k, .115 * k);
    part(shape.head, HELMET, x, y + .636 * k, z + .018, .143 * k, .107 * k, .132 * k);
    box(palette.frame, x, y + .632 * k, z + .127 * k, .239 * k, .027 * k, .119 * k);
  }

  if (wide) {
    for (const x of [-.64, .64]) for (const z of [-1.13, 1.12]) wheel(x, z, .32, .23);
    box(PAINT, 0, .59, 0, 1.53, .44, 3.44);
    box(palette.frame, 0, .44, 1.71, 1.53, .13, .09);
    box(palette.frame, 0, .43, -1.71, 1.53, .16, .09);
    box(0xb6a386, 0, 1.24, -.86, 1.49, 1.04, 1.64, 0, 4);
    for (const side of [-1, 1]) {
      box(palette.rear, side * .55, .65, -1.72, .23, .13, .05);
      lamp(side * .53, .65, 1.72, .28, .15);
    }
    cabin = .58;
    box(PAINT, 0, 1.49, .12, 1.37, .11, 1.43);
    box(palette.glass, 0, 1.20, .78, 1.19, .43, .038);
    box(palette.glass, 0, 1.20, -.54, 1.18, .43, .038);
    for (const side of [-1, 1]) {
      for (const z of [-.52, .75]) box(PAINT, side * .635, 1.17, z, .10, .59, .10);
      box(PAINT, side * .65, .98, .12, .12, .19, 1.30);
    }
    rider(-.34, .83, .21, .73);
  } else {
    wheel(0, -.67, .305, .105);
    wheel(0, .67, .305, .105);
    box(PAINT, 0, .52, 0, .075, .09, 1.16, .10, 2);
    box(PAINT, 0, .48, -.21, .077, .076, .68, -.69, 2);
    box(PAINT, 0, .56, .36, .063, .074, .59, .77, 2);
    box(PAINT, 0, .46, -.18, .24, .225, .53, 0, 3);
    box(PAINT, 0, .55, -.11, .365, .31, 1.20, 0, 1);
    box(PAINT, 0, .68, .42, .29, .40, .33, .22, 1);
    box(PAINT, 0, .39, .21, .37, .14, .60, 0, 5);
    box(palette.rear, 0, .64, -.73, .22, .071, .07, 0, 1);
    box(palette.frame, 0, .77, -.23, .26, .10, .54);
    box(palette.rim, 0, .59, .62, .075, .57, .11, .18);
    box(palette.frame, 0, .92, .66, .46, .052, .075);
    lamp(0, .792, .735, .164, .109);
    rider(0, .85, -.18);
  }
  const geometry = mergeGeometries(geometries);
  for (const piece of geometries) piece.dispose();
  return geometry;
}

function makeTrafficBatch(wide, specs, bounds) {
  const geometry = makeVehicleGeometry(wide);
  const count = specs.length;
  const styles = new Float32Array(count);
  const shirts = new Float32Array(count * 3);
  const helmets = new Float32Array(count * 3);
  const mesh = new THREE.InstancedMesh(geometry, trafficMaterial, count);
  mesh.name = wide ? 'QL37CarsAndTruck' : 'QL37TwoWheelers';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
  for (const [i, spec] of specs.entries()) {
    styles[i] = styleByType[spec.type];
    new THREE.Color(spec.shirt).toArray(shirts, i * 3);
    new THREE.Color(spec.helmet).toArray(helmets, i * 3);
    mesh.setColorAt(i, new THREE.Color(spec.color));
  }
  geometry.setAttribute('trafficStyle', new THREE.InstancedBufferAttribute(styles, 1));
  geometry.setAttribute('trafficShirt', new THREE.InstancedBufferAttribute(shirts, 3));
  geometry.setAttribute('trafficHelmet', new THREE.InstancedBufferAttribute(helmets, 3));
  return mesh;
}

function makeVehicle(spec, wide, mesh, index) {
  const root = new THREE.Object3D();
  if (spec.type === 'truck') root.scale.z = 1.16;
  if (spec.type === 'bicycle' || spec.type === 'ebike') root.scale.set(.85, .97, .94);
  return { root, mesh, index, halfLength: wide ? (spec.type === 'truck' ? 2.05 : 1.72) : .96,
    halfWidth: wide ? .77 : .34, speed: wide ? 9.4 : 8.15, side: spec.side * (wide ? 1.18 : 3.04) };
}

function roadSections(campus) {
  const road = campus.getObjectByName('Street_MainRoad');
  if (!road?.isMesh) return [];
  road.updateWorldMatrix(true, false);
  const points = [];
  const position = road.geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(road.matrixWorld);
    if (!points.some(other => other.distanceToSquared(point) < .0001)) points.push(point);
  }
  points.sort((a, b) => a.x - b.x);
  const sections = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const next = points[i].clone().lerp(points[i + 1], .5);
    const last = sections.at(-1);
    sections.push({ point: next, at: last ? last.at + last.point.distanceTo(next) : 0 });
  }
  return sections;
}

export function createCampusTraffic({ scene, walker, sound, qualifies, nudge }) {
  const vehicles = [];
  const batches = [];
  const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  let sections = [];
  let length = 0;
  let nextSoundAt = 0;
  let lastBumpAt = -Infinity;
  let spoken;
  const anchor = new THREE.Vector3();

  function place(vehicle) {
    const s = vehicle.station;
    const end = sections.findIndex(section => section.at >= s);
    const a = sections[Math.max(0, end - 1)];
    const b = sections[Math.max(1, end)];
    const dx = b.point.x - a.point.x;
    const dz = b.point.z - a.point.z;
    const span = b.at - a.at;
    const mix = (s - a.at) / span;
    vehicle.tx = dx / span;
    vehicle.tz = dz / span;
    vehicle.nx = -vehicle.tz;
    vehicle.nz = vehicle.tx;
    vehicle.root.position.lerpVectors(a.point, b.point, mix);
    vehicle.root.position.x += vehicle.nx * vehicle.side;
    vehicle.root.position.z += vehicle.nz * vehicle.side;
    vehicle.root.position.y += .012;
    vehicle.root.rotation.y = Math.atan2(vehicle.tx * vehicle.direction, vehicle.tz * vehicle.direction);
  }

  function init(campus) {
    sections = roadSections(campus);
    if (sections.length < 2) return;
    length = sections.at(-1).at;
    const bounds = new THREE.Box3().setFromPoints(sections.map(section => section.point)).expandByScalar(7);
    for (const wide of [false, true]) {
      const specs = schedule.filter(spec => wide === (spec.type === 'car' || spec.type === 'truck'));
      const batch = makeTrafficBatch(wide, specs, bounds);
      batches.push(batch);
      for (const [index, spec] of specs.entries()) {
        const vehicle = makeVehicle(spec, wide, batch, index);
        Object.assign(vehicle, { station: spec.start * length, direction: spec.side, speedNow: vehicle.speed,
          hiddenUntil: 0, stoppedUntil: 0 });
        place(vehicle);
        vehicle.root.updateMatrix();
        batch.setMatrixAt(index, vehicle.root.matrix);
        vehicles.push(vehicle);
      }
      scene.add(batch);
    }
  }

  function update(dt, night, active) {
    if (!vehicles.length) return;
    const now = performance.now();
    trafficGlow.value = night * 1.35;
    let nearest;
    let closest = 24 ** 2;
    for (const vehicle of vehicles) {
      const { root, direction, side } = vehicle;
      if (vehicle.hiddenUntil > now) continue;
      root.visible = true;
      let targetSpeed = now < vehicle.stoppedUntil ? 0 : vehicle.speed;
      let allowedStep = Infinity;
      for (const other of vehicles) {
        if (other === vehicle || !other.root.visible || other.side !== side) continue;
        const gap = (other.station - vehicle.station) * direction;
        if (gap > 0 && gap < vehicle.halfLength + other.halfLength + 3) {
          targetSpeed = Math.min(targetSpeed, other.speedNow);
          allowedStep = Math.max(0, Math.min(allowedStep, gap - vehicle.halfLength - other.halfLength - .8));
        }
      }
      vehicle.speedNow = THREE.MathUtils.lerp(vehicle.speedNow, targetSpeed, 1 - Math.exp(-dt * 5));
      vehicle.station += Math.min(allowedStep, vehicle.speedNow * dt) * direction;
      if (vehicle.station < 0 || vehicle.station > length) {
        vehicle.station = direction > 0 ? 0 : length;
        vehicle.hiddenUntil = now + 300;
        root.visible = false;
        vehicle.mesh.setMatrixAt(vehicle.index, hiddenMatrix);
        continue;
      }
      place(vehicle);
      root.updateMatrix();
      vehicle.mesh.setMatrixAt(vehicle.index, root.matrix);
      if (!active) continue;
      const dx = walker.x - root.position.x;
      const dz = walker.z - root.position.z;
      const squared = dx * dx + dz * dz;
      if (squared < closest) { closest = squared; nearest = vehicle; }
      if (now - lastBumpAt < 3000 || Math.abs(walker.y - root.position.y) > 1.25 || !qualifies()) continue;
      const along = Math.abs(dx * vehicle.tx + dz * vehicle.tz);
      const across = dx * vehicle.nx + dz * vehicle.nz;
      if (along > vehicle.halfLength + .23 || Math.abs(across) > vehicle.halfWidth + .21) continue;
      lastBumpAt = now;
      vehicle.stoppedUntil = now + 2200;
      vehicle.speedNow = 0;
      spoken = vehicle;
      sound.effect('traffic-brake');
      const directionToCurb = Math.sign(side + across) || direction;
      nudge(vehicle.nx * directionToCurb, vehicle.nz * directionToCurb);
    }
    for (const batch of batches) batch.instanceMatrix.needsUpdate = true;
    if (now >= nextSoundAt) {
      nextSoundAt = now + 130;
      sound.setTrafficSource(active && nearest ? nearest.root.position : null, nearest?.speedNow ?? 0, nearest?.halfWidth > .5);
    }
  }

  function speech(camera) {
    if (!spoken || performance.now() - lastBumpAt > 4200) return null;
    anchor.copy(spoken.root.position);
    anchor.y += 1.95;
    return anchor.project(camera);
  }

  return { init, update, speech };
}
