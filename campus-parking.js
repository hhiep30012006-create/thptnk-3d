
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const parkingZone = {
  id: 'parking', name: 'Nhà xe học sinh', short: 'Nhà xe', icon: '🅿️',
  areas: [[-57.8, -95.5, 4.2, -84.4]], anchor: [-44, -94], pad: [-23.8, .34, -93.3, Math.PI]
};

const paint = [0x9e3f4e, 0x345b95, 0xe6ded0, 0x34363c, 0x65837a];
const color = {
  panel: 0xf4f1eb, sidePanel: 0xc9c9cb, rubber: 0x27262a, saddle: 0x3b3736,
  metal: 0x6d7377, chrome: 0xaeb3b4, lamp: 0xfff2cf, rear: 0xbd303d, license: 0xf5f0e6
};
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const wheelShape = new THREE.CylinderGeometry(1, 1, 1, 10).rotateZ(Math.PI / 2);
const pipeShape = new THREE.CylinderGeometry(1, 1, 1, 6);
const roundPanel = new THREE.SphereGeometry(1, 8, 4);
const up = new THREE.Vector3(0, 1, 0);

function addPart(parts, geometry, tint, position, scale, painted = false, rotation) {
  const part = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  part.scale(...scale);
  if (rotation) part.applyQuaternion(rotation);
  part.translate(...position);
  const count = part.attributes.position.count;
  const rgb = new THREE.Color(tint);
  const colors = new Float32Array(count * 3);
  const paintMask = new Float32Array(count);
  if (painted) paintMask.fill(1);
  for (let i = 0; i < count; i++) rgb.toArray(colors, i * 3);
  part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  part.setAttribute('parkingPaint', new THREE.BufferAttribute(paintMask, 1));
  parts.push(part);
}

function buildVehicle(scooter) {
  const parts = [];
  const box = (tint, position, scale, painted) => addPart(parts, unitBox, tint, position, scale, painted);
  const round = (tint, position, scale, painted) => addPart(parts, roundPanel, tint, position, scale, painted);
  const tube = (tint, from, to, radius) => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const offset = end.clone().sub(start);
    const length = offset.length();
    const rotation = new THREE.Quaternion().setFromUnitVectors(up, offset.normalize());
    addPart(parts, pipeShape, tint, start.lerp(end, .5).toArray(), [radius, length, radius], false, rotation);
  };
  const radius = scooter ? .255 : .275;
  for (const z of [-.65, .64]) {
    addPart(parts, wheelShape, color.rubber, [0, radius, z], [scooter ? .15 : .105, radius, radius]);
    addPart(parts, wheelShape, color.metal, [0, radius, z], [scooter ? .162 : .117, radius * .61, radius * .61]);
  }
  box(color.rubber, [0, .43, .04], [.34, .09, .73]);
  box(color.sidePanel, [0, .36, -.04], [.31, .12, .52], true);
  tube(color.metal, [0, .29, .64], [0, 1.04, .46], .039);
  tube(color.metal, [-.29, 1.09, .45], [.29, 1.09, .45], .023);
  box(color.rubber, [-.25, 1.09, .45], [.12, .055, .058]);
  box(color.rubber, [.25, 1.09, .45], [.12, .055, .058]);
  tube(color.metal, [-.09, .37, -.21], [-.27, .028, -.09], .027);

  let saddle;
  if (scooter) {
    round(color.panel, [0, .56, -.39], [.265, .22, .49], true);
    round(color.panel, [0, .72, .43], [.251, .31, .16], true);
    saddle = [0, .839, -.36];
    box(color.saddle, [0, .781, -.39], [.39, .115, .65]);
    round(color.panel, [0, 1.09, .49], [.205, .087, .102], true);
    box(color.lamp, [0, 1.09, .59], [.21, .082, .033]);
    for (const side of [-1, 1]) {
      tube(color.metal, [side * .18, 1.085, .45], [side * .34, 1.31, .47], .016);
      box(color.chrome, [side * .34, 1.32, .47], [.12, .062, .041]);
    }
    box(color.rear, [0, .61, -.826], [.19, .064, .035]);
    box(color.license, [0, .48, -.84], [.19, .096, .024]);
    box(color.rubber, [0, .484, -.854], [.10, .012, .008]);
  } else {
    box(color.panel, [0, .48, -.46], [.36, .16, .67], true);
    box(color.panel, [0, .58, -.34], [.27, .16, .31], true);
    saddle = [0, .8, -.35];
    box(color.saddle, [0, .744, -.39], [.29, .112, .62]);
    box(color.panel, [0, .60, .38], [.22, .31, .16], true);
    box(color.lamp, [0, .76, .51], [.16, .09, .044]);
    box(color.rear, [0, .51, -.812], [.15, .065, .033]);
    box(color.metal, [0, .855, .65], [.32, .046, .33]);
    for (const side of [-1, 1]) {
      box(color.metal, [side * .162, .923, .65], [.035, .116, .36]);
    }
    box(color.metal, [0, .923, .831], [.32, .116, .033]);
    box(color.metal, [0, .923, .469], [.32, .116, .033]);
  }

  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return { geometry, saddle: new THREE.Vector3(...saddle) };
}

function makeHelmet(matrix) {
  const parts = [];
  const dome = new THREE.SphereGeometry(1, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  addPart(parts, dome, 0xf6bc55, [0, .08, 0], [.151, .151, .158]);
  addPart(parts, unitBox, 0x483f38, [0, .07, 0], [.27, .043, .25]);
  addPart(parts, unitBox, 0x524945, [0, .085, .112], [.248, .035, .134]);
  addPart(parts, unitBox, 0xffecd1, [0, .187, 0], [.033, .044, .14]);
  const helmet = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8 }));
  for (const part of parts) part.dispose();
  dome.dispose();
  helmet.name = 'ParkingSecretHelmet';
  helmet.position.set(0, .89, .65).applyMatrix4(matrix);
  helmet.quaternion.setFromRotationMatrix(matrix);
  helmet.visible = false;
  return helmet;
}

export function addStudentParking(campus, scene, findFloor) {
  const columns = [];
  const sectionOrder = ['004', '003', '002'];
  const box = new THREE.Box3();
  const column = (side, index, suffix) => {
    const mesh = campus.getObjectByName('CotXeGV' + side + '_' + index + suffix);
    return mesh ? box.setFromObject(mesh).getCenter(new THREE.Vector3()) : null;
  };
  for (const suffix of sectionOrder) {
    for (let bay = 4; bay > 0; bay--) {
      const front = column('Truoc', bay, suffix);
      const nextFront = column('Truoc', bay - 1, suffix);
      const rear = column('Sau', bay, suffix);
      const nextRear = column('Sau', bay - 1, suffix);
      if (front && nextFront && rear && nextRear) {
        columns.push([front.lerp(nextFront, .5), rear.lerp(nextRear, .5)]);
      }
    }
  }
  if (!columns.length) return null;

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8 });
  // Instance colors affect painted panels while the tires, trim and license plates retain their palette.
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float parkingPaint;\n' + shader.vertexShader.replace(
      '#include <color_vertex>',
      THREE.ShaderChunk.color_vertex.replace(
        'vColor.xyz *= instanceColor.xyz;',
        'vColor.xyz *= mix(vec3(1.0), instanceColor.xyz, parkingPaint);'
      )
    );
  };
  const slots = [[], []];
  const vacancies = [new Set([4, 9, 11]), new Set([1, 6, 10])];
  for (const [row, gaps] of vacancies.entries()) {
    for (const [bay, [front, rear]] of columns.entries()) {
      if (gaps.has(bay)) continue;
      const point = front.clone().lerp(rear, row === 0 ? .22 : .73);
      point.y = findFloor(point.x, point.z, .34) ?? .339;
      slots[(bay + row) % 2].push({ point, bay, row });
    }
  }

  const group = new THREE.Group();
  group.name = 'StudentParking';
  const models = [];
  let helmet;
  const orientation = new THREE.Quaternion();
  const rotation = new THREE.Euler(0, Math.PI, 0, 'YXZ');
  const matrix = new THREE.Matrix4();
  const unitScale = new THREE.Vector3(1, 1, 1);
  for (const [type, placements] of slots.entries()) {
    if (!placements.length) continue;
    const { geometry, saddle } = buildVehicle(type === 1);
    const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
    mesh.name = type ? 'ParkingElectricScooters' : 'ParkingElectricBikes';
    const seats = placements.map(({ point, bay, row }, index) => {
      rotation.z = THREE.MathUtils.degToRad(5 + (bay + row * 2) % 4);
      orientation.setFromEuler(rotation);
      point.y += .014;
      matrix.compose(point, orientation, unitScale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, new THREE.Color(paint[(bay * 3 + row * 2 + type) % paint.length]));
      if (type === 0 && row === 1 && bay === 5) helmet = makeHelmet(matrix);
      return {
        point: saddle.clone().applyMatrix4(matrix),
        approach: point,
        direction: new THREE.Vector3(0, 0, -1),
        parking: true
      };
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    models.push({ mesh, seats });
  }
  if (helmet) group.add(helmet);
  scene.add(group);
  return { models, helmet };
}
