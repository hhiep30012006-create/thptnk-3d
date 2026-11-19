import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Leaf gaps under the two large courtyard trees by the stage and stone benches.
const leafGaps = [
  [-7.7, 6.20, -40.1, .17, 1.08],
  [-7.2, 5.82, -38.7, .11, .82],
  [-7.9, 6.36, -37.0, .22, 1.25],
  [-7.7, 6.20, -29.0, .18, 1.0],
  [-7.3, 5.78, -27.55, .12, .74],
  [-7.9, 6.52, -26.17, .19, 1.16]
];

function makeBeamMask() {
  const width = 32, height = 64;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const along = y / (height - 1);
    const profile = THREE.MathUtils.smoothstep(along, 0, .13)
      * (1 - THREE.MathUtils.smoothstep(along, .43, 1));
    for (let x = 0; x < width; x++) {
      const across = Math.sin(Math.PI * x / (width - 1)) ** 2.4;
      const index = (y * width + x) * 4;
      pixels[index] = pixels[index + 1] = pixels[index + 2] = 255;
      pixels[index + 3] = Math.round(255 * profile * across);
    }
  }
  const mask = new THREE.DataTexture(pixels, width, height);
  mask.minFilter = mask.magFilter = THREE.LinearFilter;
  mask.needsUpdate = true;
  return mask;
}

export function createMorningSunbeams(direction, mobile) {
  const positions = [];
  const uv = [];
  const indices = [];
  const across = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
  const vertical = direction.clone().cross(across).normalize();
  const point = new THREE.Vector3();

  for (const [index, [x, y, z, startWidth, endWidth]] of leafGaps.entries()) {
    if (mobile && (index === 2 || index === 5)) continue;
    const start = new THREE.Vector3(x, y, z);
    const end = start.clone().addScaledVector(direction, -(y - .58) / direction.y);
    for (const angle of [.25, 1.32]) {
      const side = across.clone().multiplyScalar(Math.cos(angle)).addScaledVector(vertical, Math.sin(angle));
      const first = positions.length / 3;
      positions.push(
        ...point.copy(start).addScaledVector(side, -startWidth).toArray(),
        ...point.copy(start).addScaledVector(side, startWidth).toArray(),
        ...point.copy(end).addScaledVector(side, -endWidth).toArray(),
        ...point.copy(end).addScaledVector(side, endWidth).toArray()
      );
      uv.push(0, 0, 1, 0, 0, 1, 1, 1);
      indices.push(first, first + 1, first + 2, first + 1, first + 3, first + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);

  const material = new THREE.MeshBasicMaterial({
    color: 0xfffdf5, map: makeBeamMask(), transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    depthWrite: false, fog: false, toneMapped: false
  });
  const beams = new THREE.Mesh(geometry, material);
  beams.name = 'MorningSunbeams';
  beams.renderOrder = 1;
  return beams;
}

export function createMorningStructureShadows(campus) {
  const parts = [];
  campus.traverse(object => {
    if (!object.isMesh || !/^(?:MaiNhaXeGV|CotXeGV|Khu_C1_2Tang_(?:Mai|SanT2|ThanNha)|Nha_Hieu_Bo_(?:Mai|ThanNha))/.test(object.name)) return;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position') geometry.deleteAttribute(name);
    }
    geometry.applyMatrix4(object.matrixWorld);
    parts.push(geometry);
  });
  if (!parts.length) return null;
  const geometry = mergeGeometries(parts);
  parts.forEach(part => part.dispose());
  const casters = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    colorWrite: false, depthWrite: false, side: THREE.DoubleSide
  }));
  casters.name = 'MorningCampusShadowCasters';
  casters.castShadow = true;
  casters.visible = false;
  return casters;
}
