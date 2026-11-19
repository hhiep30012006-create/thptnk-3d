import * as THREE from 'three';

const backdropName = 'exec-f6f55854-0094-4da9-9209-4e0d2f24bded';

function paintBanner(mobile) {
  const canvas = document.createElement('canvas');
  const width = 2048, height = 1152;
  const scale = mobile ? .5 : 1;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const blue = ctx.createRadialGradient(1110, 415, 45, 1110, 500, 1120);
  blue.addColorStop(0, '#1e497a');
  blue.addColorStop(.58, '#143158');
  blue.addColorStop(1, '#08162e');
  ctx.fillStyle = blue;
  ctx.fillRect(0, 0, width, height);

  const gold = ctx.createLinearGradient(0, 0, 2100, 1070);
  gold.addColorStop(0, '#9b632a');
  gold.addColorStop(.26, '#f4d594');
  gold.addColorStop(.52, '#bc8548');
  gold.addColorStop(.76, '#ffdf9c');
  gold.addColorStop(1, '#a77336');
  ctx.strokeStyle = gold;
  for (const [inset, weight] of [[31, 7], [53, 2], [63, 1]]) {
    ctx.lineWidth = weight;
    ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
  }

  function line(points, width, color = gold) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.stroke();
  }
  function leaf(x, y, angle, size, fill) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(size * .24, -size * .47, size, 0);
    ctx.quadraticCurveTo(size * .24, size * .47, 0, 0);
    ctx.fill();
    ctx.restore();
  }
  function diamond(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
  }

  for (const [x, y, sx, sy] of [[65, 65, 1, 1], [1983, 65, -1, 1], [65, 1087, 1, -1], [1983, 1087, -1, -1]]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sx, sy);
    line([11, 102, 11, 32, 32, 11, 102, 11], 3);
    line([31, 121, 31, 47, 47, 31, 121, 31], 2);
    for (let i = 0; i < 3; i++) {
      leaf(26 + i * 28, 23, -.70, 32, '#ebc47c');
      leaf(23, 26 + i * 28, 1.68, 29, '#cf9b53');
    }
    diamond(13, 13, 10, '#ffdfa3');
    ctx.restore();
  }

  function text(value, x, y, font, fill, width) {
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fill;
    ctx.fillText(value, x, y, width);
  }

  // Keep all lettering inside the frame and below the canopy at the left edge.
  const center = 1080;
  text('TRƯỜNG THPT NGUYỄN KHUYẾN', center, 224, 'bold 58px Georgia, serif', '#f7d38b', 1280);
  line([855, 289, 1030, 289], 2);
  line([1130, 289, 1305, 289], 2);
  diamond(center, 289, 11, '#f1cc84');
  text('LỄ KỶ NIỆM', center, 409, 'bold 120px Georgia, serif', '#ffdda0', 1260);
  text('NGÀY NHÀ GIÁO VIỆT NAM', center, 535, 'bold 101px Georgia, serif', '#fff1d4', 1390);
  text('20/11', center, 689, 'bold 146px Georgia, serif', gold, 650);
  line([690, 793, 1470, 793], 2);
  text('Tôn sư trọng đạo — Tri ân thầy cô và mái trường mến yêu',
    center + 8, 923, 'italic 54px Georgia, serif', '#fffdf3', 1310);

  function bloom(x, y, radius, color, seed, petals) {
    for (let i = 0; i < petals; i++) {
      const a = i * Math.PI * 2 / petals;
      leaf(x + Math.cos(a) * radius * .2, y + Math.sin(a) * radius * .2, a, radius, color);
    }
    ctx.fillStyle = seed;
    ctx.beginPath();
    ctx.arc(x, y, radius * .41, 0, Math.PI * 2);
    ctx.fill();
  }

  // An open book and sunflowers on the left.
  line([230, 764, 256, 636, 298, 553], 7, '#7da48a');
  line([259, 762, 292, 658, 335, 628], 5, '#8bad91');
  leaf(255, 702, 2.88, 71, '#789978');
  leaf(265, 674, -.3, 66, '#a0b68a');
  bloom(299, 553, 54, '#e6ac53', '#925341', 12);
  bloom(335, 627, 36, '#ffd17a', '#a86147', 10);
  ctx.fillStyle = '#aa7549';
  ctx.beginPath();
  ctx.moveTo(118, 768); ctx.quadraticCurveTo(205, 742, 258, 788);
  ctx.quadraticCurveTo(326, 744, 421, 773); ctx.lineTo(411, 887);
  ctx.quadraticCurveTo(327, 861, 257, 908); ctx.quadraticCurveTo(196, 861, 128, 884); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff0cd';
  ctx.beginPath();
  ctx.moveTo(127, 755); ctx.quadraticCurveTo(202, 729, 257, 777);
  ctx.quadraticCurveTo(327, 731, 411, 761); ctx.lineTo(400, 868);
  ctx.quadraticCurveTo(328, 844, 257, 890); ctx.quadraticCurveTo(195, 842, 137, 866); ctx.closePath(); ctx.fill();
  line([257, 777, 257, 889], 3, '#c18c51');
  for (let i = 0; i < 3; i++) {
    line([155, 782 + i * 19, 192, 780 + i * 19, 226, 794 + i * 19], 2, '#caab73');
    line([286, 791 + i * 19, 325, 777 + i * 19, 378, 784 + i * 19], 2, '#caab73');
  }

  // Roses and a compact date ornament on the right.
  line([1783, 883, 1838, 784, 1900, 630], 7, '#8eaa87');
  line([1809, 845, 1775, 728, 1763, 669], 5, '#789d80');
  leaf(1824, 810, .35, 83, '#799977');
  leaf(1819, 805, 2.82, 76, '#93a887');
  leaf(1865, 740, -.48, 76, '#8fa783');
  leaf(1784, 764, 3.22, 65, '#a5a685');
  bloom(1900, 631, 47, '#e77c94', '#b74963', 10);
  bloom(1900, 631, 29, '#f5a8a8', '#a94d69', 7);
  bloom(1763, 669, 36, '#d46884', '#934357', 8);
  bloom(1851, 708, 30, '#ef9b9f', '#af5c75', 8);
  text('20 — 11', 1812, 447, 'italic bold 48px Georgia, serif', '#f2ca83', 210);
  diamond(1811, 494, 8, '#e8be82');

  return canvas;
}

export function addTeachersDayBanner(campus, scene, mobile) {
  const backing = campus.getObjectByName(backdropName);
  if (!backing?.isMesh) return;
  backing.updateWorldMatrix(true, false);
  const geometry = backing.geometry.clone();
  geometry.applyMatrix4(backing.matrixWorld);
  const points = geometry.attributes.position;
  const indices = geometry.index;
  const vertex = index => new THREE.Vector3().fromBufferAttribute(points, indices ? indices.getX(index) : index);
  const origin = vertex(0);
  const normal = vertex(1).sub(origin).cross(vertex(2).sub(origin)).normalize();
  if (normal.x < 0) normal.negate();
  const up = new THREE.Vector3(0, 1, 0).projectOnPlane(normal).normalize();
  const right = up.clone().cross(normal);
  const uv = new Float32Array(points.count * 2);
  const point = new THREE.Vector3();
  let left = Infinity, bottom = Infinity, highX = -Infinity, highY = -Infinity;
  for (let i = 0; i < points.count; i++) {
    point.fromBufferAttribute(points, i).sub(origin);
    const x = point.dot(right);
    const y = point.dot(up);
    uv[i * 2] = x;
    uv[i * 2 + 1] = y;
    left = Math.min(left, x);
    bottom = Math.min(bottom, y);
    highX = Math.max(highX, x);
    highY = Math.max(highY, y);
  }
  for (let i = 0; i < points.count; i++) {
    const u = (uv[i * 2] - left) / (highX - left);
    const v = (uv[i * 2 + 1] - bottom) / (highY - bottom);
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
    // Use more of the right side and leave the top margin below the canopy.
    point.fromBufferAttribute(points, i)
      .addScaledVector(right, (.12 - .134 * u) * (highX - left))
      .addScaledVector(up, (.025 - .235 * v) * (highY - bottom));
    points.setXYZ(i, point.x, point.y, point.z);
  }
  backing.material = new THREE.MeshBasicMaterial({ color: 0x142544, side: THREE.DoubleSide, toneMapped: false });
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.translate(normal.x * .02, normal.y * .02, normal.z * .02);
  const texture = new THREE.CanvasTexture(paintBanner(mobile));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const banner = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    map: texture, side: THREE.DoubleSide, toneMapped: false
  }));
  banner.name = 'TeachersDayBanner2011';
  scene.add(banner);
}
