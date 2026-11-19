import * as THREE from 'three';
import { createCampusActivities, createCampusProp } from './campus-activities.js';
import { createCampusSound } from './campus-audio.js';
import { createFlowerBouquet } from './campus-flowers.js';
import { addTeachersDayBanner } from './campus-banner.js';
import { createCampusTraffic } from './campus-traffic.js';
import { createCampusMap } from './campus-map.js';
import { createMorningSunbeams, createMorningStructureShadows } from './campus-morning-light.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const $ = selector => document.querySelector(selector);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xddf0ff);
scene.fog = new THREE.FogExp2(0xddf0ff, .00245);

const mobile = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && matchMedia('(any-pointer: coarse)').matches);
document.body.classList.toggle('mobile-campus', mobile);
const maxPixelRatio = mobile ? 1.5 : 1.8;
const moveStick = new THREE.Vector2();
const cameraForward = new THREE.Vector3();
let nextShadowUpdate = 0;
const projectedLabel = new THREE.Vector3();
let nextNameTagCheck = 0;
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 900);
const renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, maxPixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.type = mobile ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
renderer.shadowMap.enabled = true;
renderer.shadowMap.autoUpdate = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.domElement.setAttribute('aria-label', 'Góc nhìn tham quan khuôn viên');
renderer.domElement.tabIndex = 0;
renderer.domElement.style.outline = 'none';
let stage = $('#stage');
if (!stage) {
  stage = document.createElement('div');
  stage.id = 'stage';
  document.body.prepend(stage);
}
stage.appendChild(renderer.domElement);

const hemisphereLight = new THREE.HemisphereLight(0xf0f8ff, 0xefe6d8, 1.3);
const ambientLight = new THREE.AmbientLight(0xffffff, .55);
const sun = new THREE.DirectionalLight(0xfff9ed, 2.2);
const duskFill = new THREE.DirectionalLight(0xffa458, 0);
const moonLight = new THREE.DirectionalLight(0xc5d5ff, 0);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(mobile ? 512 : 1024);
Object.assign(sun.shadow.camera, { left: -23, right: 23, top: 22, bottom: -22, near: .5, far: 128 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.normalBias = .04;
sun.shadow.bias = -.0003;
sun.shadow.radius = 2.2;
scene.add(hemisphereLight, ambientLight, sun, sun.target, duskFill, moonLight);
const treeShadowLimit = mobile ? 8 : 15;
const treeShadowAnchors = [];
const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
const crownShadows = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), depthOnly, treeShadowLimit);
const trunkShadows = new THREE.InstancedMesh(new THREE.CylinderGeometry(.6, 1, 1, 5), depthOnly, treeShadowLimit);
const characterShadowLimit = mobile ? 5 : 9;
const characterShadows = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.27, 1.28, 1, 6), depthOnly, characterShadowLimit);
characterShadows.name = 'MorningCharacterShadows';
for (const mesh of [crownShadows, trunkShadows, characterShadows]) {
  mesh.count = 0;
  mesh.visible = false;
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);
}
const shadowTransform = new THREE.Object3D();

// Atmospheric sky dome, a visible sun, and soft procedural cloud clusters.
const skyDome = new Sky();
skyDome.scale.setScalar(850);
skyDome.renderOrder = -10;
skyDome.material.depthWrite = false;
skyDome.material.transparent = true;
Object.assign(skyDome.material.uniforms, {
  dayOpacity: { value: 1 },
  morningMix: { value: 0 },
  morningHorizon: { value: new THREE.Color(0xf7fbff).multiplyScalar(1.15) },
  morningZenith: { value: new THREE.Color(0xa9d6fa) }
});
skyDome.material.fragmentShader = `
  uniform float dayOpacity;
  uniform float morningMix;
  uniform vec3 morningHorizon;
  uniform vec3 morningZenith;
` + skyDome.material.fragmentShader.replace('vec4( retColor, 1.0 )', `
  vec4( mix(retColor, mix(
    mix(morningHorizon, morningZenith, smoothstep(-.025, .63, direction.y)),
    vec3(1.66, 1.57, 1.38), .30 * pow(max(cosTheta, 0.0), 69.0)
  ), morningMix), dayOpacity )
`);
scene.add(skyDome);
skyDome.material.uniforms.turbidity.value = 4.8;
skyDome.material.uniforms.rayleigh.value = 2.1;
skyDome.material.uniforms.mieCoefficient.value = 0.006;
skyDome.material.uniforms.mieDirectionalG.value = 0.9;

function makeSunGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64,64,3,64,64,64);
  gradient.addColorStop(0, 'rgba(255,255,250,1)');
  gradient.addColorStop(0.12, 'rgba(255,253,244,.91)');
  gradient.addColorStop(0.36, 'rgba(255,249,228,.28)');
  gradient.addColorStop(1, 'rgba(255,248,226,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0,0,128,128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeMoonGlowTexture() {
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');
  const gradient=ctx.createRadialGradient(64,64,8,64,64,64);
  gradient.addColorStop(0,'rgba(235,242,255,.72)');
  gradient.addColorStop(0.35,'rgba(195,211,245,.24)');
  gradient.addColorStop(1,'rgba(170,192,235,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

const sunDirection = new THREE.Vector3(0,1,0);
let morningBeams, morningStructureShadows;
const sunDisk = new THREE.Sprite(new THREE.SpriteMaterial({
  color: 0xfff0c4, map: makeSunGlowTexture(), transparent: true,
  depthWrite: false, fog: false, toneMapped: false
}));
sunDisk.name = 'MorningSunGlare';
const morningGlare = new THREE.Color(0xfffdf5);
const sunsetGlare = new THREE.Color(0xffc483);
sunDisk.scale.set(58,58,1);
sunDisk.renderOrder = 5;
scene.add(sunDisk);
const sunCore = new THREE.Mesh(
  new THREE.SphereGeometry(1, 20, 14),
  new THREE.MeshBasicMaterial({ color: 0xfff3cf, transparent: true, depthWrite: false, fog: false, toneMapped: false })
);
sunCore.scale.setScalar(5.5);
sunCore.renderOrder = 6;
scene.add(sunCore);
const moonDisk = new THREE.Sprite(new THREE.SpriteMaterial({
  color:0xe7edff,map:makeMoonGlowTexture(),transparent:true,opacity:0,
  depthWrite:false,fog:false,toneMapped:false
}));
moonDisk.scale.set(24,24,1);
moonDisk.renderOrder=5;
scene.add(moonDisk);
const moonCore = new THREE.Mesh(
  new THREE.SphereGeometry(1,20,14),
  new THREE.MeshBasicMaterial({color:0xe7edff,transparent:true,opacity:0,depthWrite:false,fog:false,toneMapped:false})
);
moonCore.scale.setScalar(2.5);
moonCore.renderOrder=6;
scene.add(moonCore);
const lampAnchors = [];
const campusLampLights = Array.from({ length: mobile ? 3 : 6 }, () => {
  const light = new THREE.PointLight(0xffd59a, 0, 22, 2);
  light.visible = false;
  scene.add(light);
  return light;
});
let nextNightLightUpdate = 0;
let exteriorLightBudget = () => campusLampLights.length;
const glowingLampMaterials=[];

const cloudClusters = [];
const cloudGeometry = new THREE.SphereGeometry(1, 12, 8);
let cloudSeed = 7519;
function cloudRandom() {
  cloudSeed = (cloudSeed * 16807) % 2147483647;
  return (cloudSeed - 1) / 2147483646;
}
const cloudTransform = new THREE.Object3D();
const cloudLimit = mobile ? 12 : 36;
for (let i = 0; i < cloudLimit; i++) {
  const group = new THREE.Group();
  const materials = [];
  const centerX = -160 + cloudRandom() * 320;
  const centerZ = -150 + cloudRandom() * 235;
  const height = 42 + cloudRandom() * 32;
  group.position.set(centerX, height, centerZ);
  group.userData.basePosition = group.position.clone();
  group.userData.phase = cloudRandom() * Math.PI * 2;
  const puffCount = 5 + Math.floor(cloudRandom() * 4);
  const material = new THREE.MeshBasicMaterial({
    color: 0xf5f7f8, transparent: true, opacity: 0.7,
    depthWrite: false, fog: false, toneMapped: false
  });
  const puffs = new THREE.InstancedMesh(cloudGeometry, material, puffCount);
  for (let j = 0; j < puffCount; j++) {
    const spread = j === 0 ? 0 : (cloudRandom() - 0.5) * 18;
    cloudTransform.position.set(spread, (j === 0 ? 0 : cloudRandom() * 3), (cloudRandom() - 0.5) * 8);
    cloudTransform.scale.set(8 + cloudRandom() * 7, 2.8 + cloudRandom() * 2.2, 5 + cloudRandom() * 5);
    cloudTransform.updateMatrix();
    puffs.setMatrixAt(j, cloudTransform.matrix);
  }
  puffs.computeBoundingSphere();
  group.add(puffs);
  materials.push(material);
  group.visible = false;
  group.renderOrder = -2;
  scene.add(group);
  cloudClusters.push({ group, materials, index: i });
}

// Dawn uses a fixed art preset. Live weather still informs the other scenes.
const SCHOOL_WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=20.69795&longitude=106.46866&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m&timezone=Asia%2FHo_Chi_Minh';
const SCHOOL_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const environmentStatus = $('#environmentStatus');
const environment = { cloudCover: 0, weatherCode: 0, temperature: null, rain: 0, updatedAt: null, unavailable: false };

const timeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: SCHOOL_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
function weatherLabel(code) {
  if ([0].includes(code)) return 'Trời quang';
  if ([1].includes(code)) return 'Ít mây';
  if ([2].includes(code)) return 'Mây rải rác';
  if ([3].includes(code)) return 'Nhiều mây';
  if ([45, 48].includes(code)) return 'Sương mù';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Mưa phùn';
  if ([61, 63, 65, 66, 67].includes(code)) return 'Trời mưa';
  if ([80, 81, 82].includes(code)) return 'Mưa rào';
  if ([95, 96, 99].includes(code)) return 'Mưa dông';
  return 'Thời tiết hiện tại';
}

const scenesOfDay = [
  { label: 'Buổi sáng', icon: '☀️', status: '07:30 · Nắng sớm · 24°C',
    direction: [-.39, .766, .52], sky: 0xddf0ff, sun: 0xfff9ed, fog: 0xddf0ff, fogDensity: .00245,
    ambient: 0xf0f8ff, ground: 0xefe6d8, power: 2.2, duskPower: 0, fill: 1.3, exposure: 1.3,
    morning: 1, night: 0, sunset: 0 },
  { label: 'Hoàng hôn', icon: '🌅', direction: [-.73, .19, -.65], sky: 0xf2aa79, sun: 0xffa458,
    fog: 0xf2aa79, fogDensity: .0021, ambient: 0xffdec3, ground: 0xa56b72,
    power: .89, duskPower: 1.22, fill: 1.16, exposure: 1.13, morning: 0, night: 0, sunset: 1 },
  { label: 'Buổi tối', icon: '🌙', direction: [-.72, .37, -.55], sky: 0x081329, sun: 0x9ab8ff,
    fog: 0x081329, fogDensity: .0021, ambient: 0xb3c9ff, ground: 0x4f596f,
    power: 0, duskPower: 0, fill: .67, exposure: 1.05, morning: 0, night: 1, sunset: 0 }
].map(scene => ({
  ...scene,
  direction: new THREE.Vector3(...scene.direction).normalize(),
  sky: new THREE.Color(scene.sky), sun: new THREE.Color(scene.sun), fog: new THREE.Color(scene.fog),
  ambient: new THREE.Color(scene.ambient), ground: new THREE.Color(scene.ground)
}));
let dayMode = 0;
try {
  const saved = Number(localStorage.getItem('nk-day-mode'));
  if (Number.isInteger(saved) && scenesOfDay[saved]) dayMode = saved;
} catch {}
const currentDay = {
  ...scenesOfDay[dayMode], direction: new THREE.Vector3(), sky: new THREE.Color(),
  sun: new THREE.Color(), ambient: new THREE.Color(), ground: new THREE.Color(), fog: new THREE.Color()
};
const moonDirection = new THREE.Vector3(.32, .48, -.81).normalize();
const cloudTint = new THREE.Color();
const warmCloud = new THREE.Color(0xffbe94);
const dayCloud = new THREE.Color(0xfff8eb);
const nightCloud = new THREE.Color(0x50617c);
let dayBlend = null;
const dayButtons = document.querySelectorAll('[data-day-cycle]');

function makeStars() {
  const count = mobile ? 230 : 410;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  let seed = 3047;
  function random() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  for (let i = 0; i < count; i++) {
    const azimuth = random() * Math.PI * 2;
    const y = .08 + random() * .91;
    const radius = Math.sqrt(1 - y * y);
    const shade = .48 + random() * .50;
    positions.set([Math.cos(azimuth) * radius * 575, y * 575, Math.sin(azimuth) * radius * 575], i * 3);
    colors.set([shade * .89, shade * .93, shade], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const stars = new THREE.Points(geometry, new THREE.PointsMaterial({
    size: mobile ? 1.3 : 1.65, sizeAttenuation: false, vertexColors: true,
    transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false
  }));
  stars.renderOrder = -9;
  stars.visible = false;
  scene.add(stars);
  return stars;
}
const nightStars = makeStars();

const dayColors = ['sky', 'sun', 'ambient', 'ground', 'fog'];
const dayValues = ['power', 'duskPower', 'fill', 'exposure', 'morning', 'night', 'sunset', 'fogDensity'];

function sampleDay(from, to, t) {
  currentDay.direction.lerpVectors(from.direction, to.direction, t).normalize();
  for (const field of dayColors) currentDay[field].lerpColors(from[field], to[field], t);
  for (const field of dayValues) currentDay[field] = THREE.MathUtils.lerp(from[field], to[field], t);
}

function applyDayLighting() {
  const { direction, sky, morning, night, sunset } = currentDay;
  const clouds = THREE.MathUtils.clamp(environment.cloudCover / 100, 0, 1) * (1 - morning);
  const skyAlpha = 1 - night;
  skyDome.material.uniforms.dayOpacity.value = skyAlpha;
  skyDome.material.uniforms.morningMix.value = morning;
  skyDome.material.uniforms.sunPosition.value.copy(direction).multiplyScalar(500);
  skyDome.material.uniforms.turbidity.value = 4.8 + sunset * 4;
  skyDome.visible = skyAlpha > .005;
  sunDirection.copy(direction);
  sun.position.copy(sun.target.position).addScaledVector(direction, 69);
  sun.color.copy(currentDay.sun);
  sun.intensity = currentDay.power;
  duskFill.position.copy(direction).multiplyScalar(120);
  duskFill.color.copy(currentDay.sun);
  duskFill.intensity = currentDay.duskPower * (1 - clouds * .32);
  sunDisk.position.copy(direction).multiplyScalar(500);
  sunCore.position.copy(sunDisk.position);
  sunDisk.visible = sunCore.visible = skyAlpha > .005;
  sunDisk.material.color.lerpColors(morningGlare, sunsetGlare, sunset);
  sunCore.material.color.copy(sunDisk.material.color);
  sunDisk.material.opacity = skyAlpha * (1 - clouds * .38) * (1 - morning * .26);
  sunCore.material.opacity = skyAlpha * (1 - clouds * .32);
  sunDisk.scale.set(58 + morning * 15, 58 + morning * 15, 1);
  if (morningBeams) {
    morningBeams.visible = morning > .005;
    morningBeams.material.opacity = morning * .12;
  }
  if (morningStructureShadows) morningStructureShadows.visible = morning > .005;
  moonLight.position.copy(moonDirection).multiplyScalar(120);
  moonLight.intensity = night * .52;
  moonDisk.position.copy(moonDirection).multiplyScalar(500);
  moonCore.position.copy(moonDisk.position);
  moonDisk.visible = moonCore.visible = night > .005;
  moonDisk.material.opacity = night * .93;
  moonCore.material.opacity = night;
  nightStars.visible = night > .005;
  nightStars.material.opacity = night * (1 - clouds * .62);
  hemisphereLight.color.copy(currentDay.ambient);
  hemisphereLight.groundColor.copy(currentDay.ground);
  hemisphereLight.intensity = currentDay.fill;
  ambientLight.intensity = morning * .55;
  renderer.toneMappingExposure = currentDay.exposure;
  scene.background.copy(sky);
  scene.fog.color.copy(currentDay.fog);
  scene.fog.density = currentDay.fogDensity;
  if (night > .995) {
    for (const mesh of [crownShadows, trunkShadows, characterShadows]) {
      mesh.visible = false;
      mesh.count = 0;
    }
  }
  const coverage = Math.max(0, (clouds - .04) / .96);
  const visibleCount = Math.round(coverage * cloudClusters.length);
  cloudTint.copy(dayCloud).lerp(warmCloud, sunset).lerp(nightCloud, night);
  for (const cloud of cloudClusters) {
    cloud.group.visible = cloud.index < visibleCount;
    for (const material of cloud.materials) {
      material.color.copy(cloudTint);
      material.opacity = (.24 + coverage * .44) * (1 - night * .65);
    }
  }
  for (const material of glowingLampMaterials) material.emissiveIntensity = night * .9;
  updateNightLights();
}

function syncEnvironmentStatus() {
  if (!environmentStatus) return;
  const presetStatus = scenesOfDay[dayMode].status;
  if (presetStatus) {
    if (environmentStatus.textContent !== presetStatus) environmentStatus.textContent = presetStatus;
    environmentStatus.title = 'Chế độ ánh sáng buổi sáng';
    return;
  }
  const weather = environment.temperature === null
    ? (environment.unavailable ? 'chưa có dữ liệu thời tiết' : 'đang tải thời tiết')
    : weatherLabel(environment.weatherCode) + ' · ' + Math.round(environment.temperature) + '°C';
  environmentStatus.textContent = '🕒 ' + timeFormatter.format(new Date()) + ' · ' + weather;
  environmentStatus.title = 'Giờ địa phương Hải Phòng · Thời tiết hiện tại';
}

function updateEnvironmentLighting() {
  applyDayLighting();
  syncEnvironmentStatus();
}

function cycleDayMode() {
  dayMode = (dayMode + 1) % scenesOfDay.length;
  dayBlend = {
    at: performance.now(),
    from: { ...currentDay, direction: currentDay.direction.clone(), sky: currentDay.sky.clone(),
      sun: currentDay.sun.clone(), ambient: currentDay.ambient.clone(), ground: currentDay.ground.clone(), fog: currentDay.fog.clone() }
  };
  try { localStorage.setItem('nk-day-mode', String(dayMode)); } catch {}
  syncDayButtons();
  syncEnvironmentStatus();
  showToast(scenesOfDay[dayMode].label);
}

function syncDayButtons() {
  for (const button of dayButtons) {
    const { label, icon } = scenesOfDay[dayMode];
    button.querySelector('[aria-hidden]').textContent = icon;
    button.setAttribute('aria-label', 'Ánh sáng: ' + label + '. Bấm để đổi chế độ');
    button.title = 'Ánh sáng: ' + label + ' · Bấm để đổi chế độ';
  }
}

function animateDayLighting() {
  if (!dayBlend) return;
  const t = THREE.MathUtils.clamp((performance.now() - dayBlend.at) / 2500, 0, 1);
  sampleDay(dayBlend.from, scenesOfDay[dayMode], t * t * (3 - 2 * t));
  applyDayLighting();
  if (t === 1) dayBlend = null;
}

function updateNightLights() {
  const night = currentDay.night;
  const shouldReplace = performance.now() >= nextNightLightUpdate;
  if (shouldReplace) {
    nextNightLightUpdate = performance.now() + 250;
    lampAnchors.sort((a, b) => a.position.distanceToSquared(camera.position) - b.position.distanceToSquared(camera.position));
  }
  const budget = exteriorLightBudget();
  for (let i = 0; i < campusLampLights.length; i++) {
    const light = campusLampLights[i];
    const anchor = lampAnchors[i];
    if (!anchor || i >= budget || night < .002) { light.visible = false; light.intensity = 0; continue; }
    if (light.userData.anchor !== anchor) {
      light.userData.anchor = anchor;
      light.color.set(anchor.color);
      light.position.copy(anchor.position);
      light.distance = anchor.range;
    }
    light.visible = true;
    light.intensity = anchor.intensity * night;
  }
}

sampleDay(scenesOfDay[dayMode], scenesOfDay[dayMode], 1);
syncDayButtons();
for (const button of dayButtons) button.addEventListener('click', cycleDayMode);

async function refreshCurrentWeather() {
  if (!navigator.onLine) return;
  try {
    const response = await fetch(SCHOOL_WEATHER_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
    const data = await response.json();
    if (!data.current) throw new Error('Weather response is missing current conditions');
    environment.cloudCover = Number(data.current.cloud_cover ?? 0);
    environment.weatherCode = Number(data.current.weather_code ?? 0);
    environment.temperature = Number(data.current.temperature_2m);
    environment.rain = Number(data.current.rain ?? 0) + Number(data.current.showers ?? 0);
    environment.updatedAt = new Date();
    environment.unavailable = false;
    updateEnvironmentLighting();
  } catch (error) {
    console.warn('Không lấy được thời tiết hiện tại:', error);
    environment.unavailable = true;
    updateEnvironmentLighting();

  }
}

updateEnvironmentLighting();
refreshCurrentWeather();
setInterval(updateEnvironmentLighting, 15000);
setInterval(refreshCurrentWeather, 10 * 60 * 1000);
window.addEventListener('online', refreshCurrentWeather);

// Ground cover hides empty space between the modeled features in the GLB.
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(420, 280),
  new THREE.MeshStandardMaterial({ color: 0x777c69, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, -0.48, -28);
scene.add(ground);
const walkableMeshes = [ground];
const CAMPUS_MODEL_URL = './assets/Nguyenkhuyen1999.draco.glb';
const groundRaycaster = new THREE.Raycaster();
const walkSurfaceNormalMatrix = new THREE.Matrix3();
const MAX_STEP_UP = 1.15;
const MAX_STEP_DOWN = 2.4;
const groundProbeCache = { x: NaN, z: NaN, feetY: NaN, surfaceY: null };

// Campus walkable outline (Blender XY maps to GLTF XZ), extended around the
// sports field and volleyball court present in the GLB.
const boundary = [
  [-43,-117],[51,-117],[55,-113],[53,-100],[56,-80],[56,-70],[68,-68],[70,-53],
  [84,-40],[105,-27],[106,-8],[115,3],[124,22],[125,38],[114,47],[97,50],
  [88,47],[74,36],[61,29],[49,26],[22,25],[-11,26],[-25,32],[-66,32],
  [-68,42],[-80,49],[-99,48],[-110,41],[-113,30],[-113,20],[-108,11],
  [-98,7],[-89,7],[-84,10],[-84,14],[-92,10],[-102,1],[-108,-4],[-109,-10],
  [-119,-10],[-134,-9],[-145,-12],[-146,-24],[-145,-49],[-146,-72],[-137,-80],
  [-79,-80],[-68,-73],[-67,-41],[-74,-26],[-74,-20],[-66,-15],[-57,-13],
  [-53,-17],[-53,-94],[-48,-108],
  [-58,-108],[-59,-145],[-50,-152],[-28,-159],[40,-159],[42,-154],[42,-118]
];

const walker = { x: 0, y: 0, z: 4, velocityY: 0, onGround: true, yaw: 0, speed: 5.2, running: false };
const keys = new Set();
let avatar = null;
let campusLoaded = false;
let started = false;
let roomServerClockOffsetMs = 0;
let stepDistance = 0;
let nextAmbience = 0;
const PLAYER_RADIUS = 0.28;
const PLAYER_HEIGHT = 1.78;
const COLLISION_CELL_SIZE = 6;
const obstacleGrid = new Map();
let fountainEffectGroup = null;
let fountainDroplets = [];
let fountainRipples = [];
let fountainMistMesh = null;
let fountainMistParticles = [];
let fountainSource = null;
let drag = false;
let lastPointer = null;
let pointerOrigin = null;
let pointerMoved = false;
let lookingPointer = null;
let introducedByGuard = false;
let cameraDistance = 7.5;
let cameraLift = 3.2;
let toastTimer = 0;
let profile = null;
let playerWasNearPrincipal = false;
let playerGreetingStart = null;
const ROOM_API_ORIGIN = location.origin;
let roomPollController = null;
let roomConnectionGeneration = 0;
let roomId = '';
let roomJoined = false;
let roomSendClock = 0;
let roomHeartbeatClock = 0;
let lastRoomPosition = null;
let roomSpawnOffsetApplied = false;
const remotePlayers = new Map();
const sound = createCampusSound(() => walker);
const activities = createCampusActivities({
  scene, camera, renderer, walker, keys,
  post: roomPost,
  getPlayer: () => avatar,
  getProfile: () => profile,
  setFace,
  getRoom: () => ({ id: roomJoined ? roomId : '', players: remotePlayers }),
  floor: findWalkSurface,
  outdoorOpen: point => pointInBoundary(point.x, point.z) && !collidesAt(point.x, point.z, point.y),
  notice: showToast,
  pickupClearance,
  resetInput: resetPlayerInput,
  faceHorse(position) {
    if (!avatar) return;
    walker.yaw = Math.atan2(walker.x - position.x, walker.z - position.z);
    avatar.rotation.y = walker.yaw + Math.PI;
    positionOutdoorView();
  },
  mobile, sound,
  openTravel: () => campusMap.open()
});
const campusMap = createCampusMap({
  active: () => started,
  player: () => avatar.position,
  yaw: () => walker.yaw,
  indoors: () => activities.insideClassroom,
  players: () => remotePlayers,
  canOpen: () => !activities.blocksMovement,
  stopInput() {
    activities.horseDialogue.dismiss();
    resetPlayerInput();
  },
  floor: findWalkSurface,
  outdoorOpen: point => pointInBoundary(point.x, point.z) && !collidesAt(point.x, point.z, point.y),
  teleport(point, angle) {
    activities.teleportToMap(point, angle);
    avatar.position.set(walker.x, walker.y, walker.z);
    avatar.rotation.y = angle + Math.PI;
    positionOutdoorView();
  },
  notice: showToast
});
const traffic = createCampusTraffic({
  scene, walker, sound,
  qualifies: () => activities.trafficWarningActive && !campusMap.blocking && !activities.blocksMovement && !activities.insideClassroom,
  nudge: (x, z) => {
    const beforeX = walker.x, beforeZ = walker.z;
    moveWithCollision(x * 1.17, z * 1.17);
    const floorY = findWalkSurface(walker.x, walker.z, walker.y);
    if (floorY === null) {
      walker.x = beforeX;
      walker.z = beforeZ;
    } else walker.y = floorY;
    walker.velocityY = 0;
    walker.onGround = true;
    avatar?.position.set(walker.x, walker.y, walker.z);
    keys.clear();
  }
});
exteriorLightBudget = () => activities.insideClassroom ? 0 : Math.max(0, campusLampLights.length - activities.activeIncenseLights);

function pointInBoundary(x, z) {
  let inside = false;
  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
    const [xi, zi] = boundary[i];
    const [xj, zj] = boundary[j];
    const crosses = ((zi > z) !== (zj > z)) &&
      (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi);
    if (crosses) inside = !inside;
  }
  return inside;
}

function collisionCellKey(x, z) {
  return `${x},${z}`;
}

function addObstacleToGrid(box) {
  const minX = Math.floor((box.min.x - PLAYER_RADIUS) / COLLISION_CELL_SIZE);
  const maxX = Math.floor((box.max.x + PLAYER_RADIUS) / COLLISION_CELL_SIZE);
  const minZ = Math.floor((box.min.z - PLAYER_RADIUS) / COLLISION_CELL_SIZE);
  const maxZ = Math.floor((box.max.z + PLAYER_RADIUS) / COLLISION_CELL_SIZE);
  // Skip huge ground/building shells; their AABBs would falsely block whole areas.
  if ((maxX - minX + 1) * (maxZ - minZ + 1) > 180) return;
  for (let cx = minX; cx <= maxX; cx++) {
    for (let cz = minZ; cz <= maxZ; cz++) {
      const key = collisionCellKey(cx, cz);
      if (!obstacleGrid.has(key)) obstacleGrid.set(key, []);
      obstacleGrid.get(key).push(box);
    }
  }
}

const lowPlacementObstacles = [];
const fenceTileSize = .40;
function isPerimeterFence(object) {
  for (let parent = object; parent; parent = parent.parent) {
    if (/^(?:Batch_Fence_(?:02_Cong_Truong|WORLD)|Fence_FrontWest_|TruRao_|TuongChanRao_|TruCong(?:Trai|Phai)|TuongBienTen)/i.test(parent.name)) return true;
  }
  return false;
}

function rasterFence(object, rows) {
  const { position } = object.geometry.attributes;
  if (!position) return;
  const index = object.geometry.index;
  const points = new Float32Array(position.count * 2);
  const vertex = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
    points[i * 2] = vertex.x;
    points[i * 2 + 1] = vertex.z;
  }
  const length = index?.count ?? position.count;
  for (let i = 0; i + 2 < length; i += 3) {
    const a = (index ? index.getX(i) : i) * 2;
    const b = (index ? index.getX(i + 1) : i + 1) * 2;
    const c = (index ? index.getX(i + 2) : i + 2) * 2;
    const left = Math.floor((Math.min(points[a], points[b], points[c]) - .015) / fenceTileSize);
    const right = Math.floor((Math.max(points[a], points[b], points[c]) + .015) / fenceTileSize);
    const top = Math.floor((Math.min(points[a + 1], points[b + 1], points[c + 1]) - .015) / fenceTileSize);
    const bottom = Math.floor((Math.max(points[a + 1], points[b + 1], points[c + 1]) + .015) / fenceTileSize);
    for (let z = top; z <= bottom; z++) {
      let row = rows.get(z);
      if (!row) rows.set(z, row = new Set());
      for (let x = left; x <= right; x++) row.add(x);
    }
  }
}

function addHardFences(rows) {
  for (const [z, tiles] of rows) {
    const row = [...tiles].sort((a, b) => a - b);
    let start = row[0];
    for (let i = 0; i < row.length; i++) {
      if (row[i + 1] === row[i] + 1) continue;
      addObstacleToGrid(new THREE.Box3(
        new THREE.Vector3(start * fenceTileSize, -128, z * fenceTileSize),
        new THREE.Vector3((row[i] + 1) * fenceTileSize, 128, (z + 1) * fenceTileSize)
      ));
      start = row[i + 1];
    }
  }
}

function buildCampusColliders(campus) {
  const fenceRows = new Map();
  campus.updateMatrixWorld(true);
  campus.traverse(obj => {
    if (!obj.isMesh) return;
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    if (/Bon(?:Gach|Vuong|Cay|Hoa)|VienCay|^ChauHo|^Bench_/i.test(obj.name)) lowPlacementObstacles.push(box);
    if (isPerimeterFence(obj)) { rasterFence(obj, fenceRows); return; }
    // This repeated low fence is the pitch border. Its section AABBs seal the
    // narrow side path, so keep this one fence non-blocking while retaining
    // collisions for the rest of the campus.
    const isPitchFence = (obj.name.startsWith('Lop_rao_ben_') || obj.name.startsWith('Lop_rao_phia_'))
      && box.min.x >= -30 && box.max.x <= 41
      && box.min.z >= -159 && box.max.z <= -113;
    if (isPitchFence) return;
    const size = box.getSize(new THREE.Vector3());
    const horizontalSpan = Math.max(size.x, size.z);
    if (!obj.userData.collision && horizontalSpan > 0.35 && size.y <= Math.max(0.65, horizontalSpan * 0.3)) {
      walkableMeshes.push(obj);
    }
    if (obj.userData.collision) return;
    // Ground, paving, road paint and roofs are not upright obstacles.
    // Low curbs and raised strips are step-over surfaces rather than walls.
    if (size.y < 0.92 || box.max.y < 0.05 || box.min.y > PLAYER_HEIGHT + 5) return;
    const horizontalCells = Math.ceil(size.x / COLLISION_CELL_SIZE) * Math.ceil(size.z / COLLISION_CELL_SIZE);
    if (horizontalCells > 180) return;
    addObstacleToGrid(box);
  });
  addHardFences(fenceRows);
}

function collidesAt(x, z, feetY = walker.y) {
  const cellX = Math.floor(x / COLLISION_CELL_SIZE);
  const cellZ = Math.floor(z / COLLISION_CELL_SIZE);
  const nearby = obstacleGrid.get(collisionCellKey(cellX, cellZ));
  if (!nearby) return false;
  const minY = feetY + 0.08;
  const maxY = feetY + PLAYER_HEIGHT;
  for (const box of nearby) {
    if (maxY <= box.min.y || minY >= box.max.y) continue;
    if (x + PLAYER_RADIUS <= box.min.x || x - PLAYER_RADIUS >= box.max.x) continue;
    if (z + PLAYER_RADIUS <= box.min.z || z - PLAYER_RADIUS >= box.max.z) continue;
    return true;
  }
  return false;
}

function pickupClearance(point) {
  const searchRadius = 1.35;
  let nearest = searchRadius;
  const consider = box => {
    if (box.max.y <= point.y + .06 || box.min.y >= point.y + 1.4) return;
    const dx = Math.max(0, box.min.x - point.x, point.x - box.max.x);
    const dz = Math.max(0, box.min.z - point.z, point.z - box.max.z);
    nearest = Math.min(nearest, Math.hypot(dx, dz));
  };
  for (const box of lowPlacementObstacles) consider(box);
  const minX = Math.floor((point.x - searchRadius) / COLLISION_CELL_SIZE);
  const maxX = Math.floor((point.x + searchRadius) / COLLISION_CELL_SIZE);
  const minZ = Math.floor((point.z - searchRadius) / COLLISION_CELL_SIZE);
  const maxZ = Math.floor((point.z + searchRadius) / COLLISION_CELL_SIZE);
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      const boxes = obstacleGrid.get(collisionCellKey(x, z));
      if (boxes) for (const box of boxes) consider(box);
    }
  }
  return nearest;
}

function canMoveTo(x, z) {
  if (activities.insideClassroom) return activities.canMove(x, z);
  return pointInBoundary(x, z) && !collidesAt(x, z);
}

function moveWithCollision(dx, dz) {
  const distance = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(distance / 0.12));
  const stepX = dx / steps;
  const stepZ = dz / steps;
  for (let i = 0; i < steps; i++) {
    const nx = walker.x + stepX;
    const nz = walker.z + stepZ;
    if (canMoveTo(nx, nz)) {
      walker.x = nx;
      walker.z = nz;
      continue;
    }
    // Try each axis separately so the student can slide along a wall.
    if (canMoveTo(nx, walker.z)) walker.x = nx;
    if (canMoveTo(walker.x, nz)) walker.z = nz;
  }
}

function jumpPlayer() {
  if (!started || !avatar || !walker.onGround || campusMap.blocking || activities.blocksMovement || (playerGreetingStart!==null&&clock.elapsedTime-playerGreetingStart<1.8)) return;
  walker.velocityY = 6.1;
  walker.onGround = false;
  if (roomJoined && roomId) {
    roomPost('/api/action', {
      id: roomId,
      action: 'jump',
      position: { x: walker.x, y: walker.y, z: walker.z, yaw: walker.yaw }
    }).catch(() => {});
  }
}

const packedCharacterMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .82 });
function packCharacterPart(part) {
  const meshes = part.children.filter(child => child.isMesh && child.material.color && !child.material.map);
  if (meshes.length < 2) return;
  const geometries = meshes.map(mesh => {
    mesh.updateMatrix();
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
    }
    geometry.applyMatrix4(mesh.matrix);
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) mesh.material.color.toArray(colors, i);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  });
  const packed = mergeGeometries(geometries);
  for (const geometry of geometries) geometry.dispose();
  if (!packed) return;
  for (const mesh of meshes) mesh.removeFromParent();
  part.add(new THREE.Mesh(packed, packedCharacterMaterial));
}

function instanceCampusProps(campus) {
  const groups = new Map();
  const size = new THREE.Vector3();
  campus.traverse(object => {
    if (!object.isMesh || !object.visible || Array.isArray(object.material) || object.material.map) return;
    const isBench = /^Bench_(?:Courtyard_)?\d+$/.test(object.name);
    const isFence = /^Lop_rao_(?:ben|phia)_/.test(object.name);
    if (!isBench && !isFence) return;
    const geometry = object.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    geometry.boundingBox.getSize(size);
    const kind = isBench ? 'bench' : object.name.includes('_Chan') ? 'fence-foot' : 'fence-panel';
    const key = [kind, geometry.index?.count, ...size.toArray().map(value => value.toFixed(2))].join('|');
    if (!groups.has(key)) groups.set(key, { kind, objects: [] });
    groups.get(key).objects.push(object);
  });
  const inverse = campus.matrixWorld.clone().invert();
  const transform = new THREE.Matrix4();
  const offset = new THREE.Matrix4();
  const center = new THREE.Vector3();
  for (const { kind, objects } of groups.values()) {
    if (objects.length < 2) continue;
    const prototype = objects[0];
    prototype.geometry.boundingBox.getCenter(center);
    const geometry = prototype.geometry.clone().translate(-center.x, -center.y, -center.z);
    const material = prototype.material.clone();
    material.color.set(0xffffff);
    const instances = new THREE.InstancedMesh(geometry, material, objects.length);
    instances.name = 'CampusInstances:' + kind;
    instances.receiveShadow = true;
    instances.castShadow = kind === 'bench';
    for (const [i, object] of objects.entries()) {
      object.geometry.boundingBox.getCenter(center);
      transform.multiplyMatrices(inverse, object.matrixWorld).multiply(offset.makeTranslation(center.x, center.y, center.z));
      instances.setMatrixAt(i, transform);
      instances.setColorAt(i, object.material.color);
      // Bench targets keep the original meshes for ground and click raycasts.
      if (kind === 'bench') object.visible = false;
      else object.removeFromParent();
    }
    instances.computeBoundingSphere();
    campus.add(instances);
  }
}

function batchCampusMeshes(campus) {
  campus.updateMatrixWorld(true);
  const groups = new Map();
  const collisionMeshes = new THREE.Group();
  const inverseWorld = campus.matrixWorld.clone().invert();
  const palettes = new Map();
  const position = new THREE.Vector3();
  campus.traverse(object => {
    if (!object.isMesh || !object.visible || object.userData.collision || object.isSkinnedMesh || object.isInstancedMesh
      || Array.isArray(object.material) || object.material.transparent || /^BongDen(?:Phai|Trai)_/.test(object.name)) return;
    for (let parent = object; parent !== campus; parent = parent.parent) {
      if (/^Bench_|^MatBangTinGiua|Incense_Urn/.test(parent.name)) return;
    }
    const geometry = object.geometry;
    const material = object.material;
    const canPackColor = material.isMeshStandardMaterial && !material.map && !material.alphaMap
      && !material.normalMap && !material.roughnessMap && !material.metalnessMap && !material.aoMap
      && !material.emissiveMap && !material.vertexColors && material.emissive.getHex() === 0
      && geometry.hasAttribute('normal');
    const palette = canPackColor ? material.side + '|' + Math.round(material.metalness * 4) : '';
    const prefix = canPackColor ? 'color|' + palette : material.uuid;
    const attributes = canPackColor ? 'position,normal' : Object.keys(geometry.attributes).sort().join(',');
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    geometry.boundingBox.getCenter(position).applyMatrix4(object.matrixWorld);
    const sector = Math.floor(position.x / 64) + ',' + Math.floor(position.z / 64);
    const key = prefix + '|' + attributes + '|' + sector;
    if (!groups.has(key)) groups.set(key, { objects: [], palette });
    groups.get(key).objects.push(object);
  });
  for (const { objects, palette } of groups.values()) {
    if (objects.length < 2) continue;
    const copies = objects.map(object => {
      const transform = new THREE.Matrix4().multiplyMatrices(inverseWorld, object.matrixWorld);
      const copy = object.geometry.clone().applyMatrix4(transform);
      if (!copy.index) {
        const indices = new Uint32Array(copy.attributes.position.count);
        for (let i = 0; i < indices.length; i++) indices[i] = i;
        copy.setIndex(new THREE.BufferAttribute(indices, 1));
      }
      if (transform.determinant() < 0) {
        const indices = copy.index.array;
        for (let i = 0; i < indices.length; i += 3) {
          const swapped = indices[i + 1];
          indices[i + 1] = indices[i + 2];
          indices[i + 2] = swapped;
        }
      }
      if (palette) {
        for (const name of Object.keys(copy.attributes)) if (name !== 'position' && name !== 'normal') copy.deleteAttribute(name);
        const colors = new Float32Array(copy.attributes.position.count * 3);
        for (let i = 0; i < colors.length; i += 3) object.material.color.toArray(colors, i);
        copy.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }
      return copy;
    });
    const combined = mergeGeometries(copies);
    for (const geometry of copies) geometry.dispose();
    if (!combined) continue;
    combined.computeBoundingSphere();
    if (palette && !palettes.has(palette)) {
      const { side, metalness } = objects[0].material;
      palettes.set(palette, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, side, metalness }));
    }
    const batch = new THREE.Mesh(combined, palettes.get(palette) || objects[0].material);
    batch.name = 'CampusStaticBatch';
    batch.receiveShadow = true;
    campus.add(batch);
    for (const object of objects) collisionMeshes.attach(object);
  }
}

function createCampusLampLights(campus) {
  campus.updateMatrixWorld(true);
  const fixtureGeometry = new THREE.SphereGeometry(.095, 6, 4);
  const fixture = new THREE.MeshStandardMaterial({ color: 0xffdfa9, emissive: 0xffb95e, emissiveIntensity: 0 });
  const lampCovers = [];
  const addLamp = (position, color, range, intensity, marker) => {
    lampAnchors.push({ position, color, range, intensity });
    if (marker) lampCovers.push(position);
  };
  campus.traverse(object => {
    if (!object.isMesh || !/^BongDen(?:Phai|Trai)_\d+$/.test(object.name)) return;
    const box = new THREE.Box3().setFromObject(object);
    const point = box.getCenter(new THREE.Vector3());
    addLamp(point, 0xffd59a, 25, 45, false);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const glowing = materials.map(material => {
      const copy = material.clone();
      if (copy.emissive) {
        copy.emissive.set(0xffc56d);
        glowingLampMaterials.push(copy);
      }
      return copy;
    });
    object.material = Array.isArray(object.material) ? glowing : glowing[0];
  });
  const anchorBox = name => {
    const object = campus.getObjectByName(name);
    return object ? new THREE.Box3().setFromObject(object) : null;
  };
  for (const floor of ['Khu_C1_2Tang_SanT1', 'Khu_C1_2Tang_SanT2']) {
    const box = anchorBox(floor);
    if (!box) continue;
    for (const offset of [.2, .5, .8]) {
      addLamp(new THREE.Vector3(THREE.MathUtils.lerp(box.min.x, box.max.x, offset), box.max.y + 3.2, box.max.z - .5),
        0xffd0a0, 15, 24, true);
    }
  }
  const stageBox = anchorBox('BucSanKhau');
  if (stageBox) {
    const point = stageBox.getCenter(new THREE.Vector3());
    for (const offset of [-4, 4]) addLamp(new THREE.Vector3(point.x + offset, stageBox.max.y + 4, point.z + 1), 0xffba7a, 20, 42, true);
  }
  for (const name of ['Statue_Head', 'Statue02_Statue_Head']) {
    const box = anchorBox(name);
    if (!box) continue;
    const point = box.getCenter(new THREE.Vector3());
    addLamp(new THREE.Vector3(point.x + 1.6, box.min.y - 1.7, point.z + 1.4), 0xffbd85, 13, 33, true);
  }
  if (lampCovers.length) {
    const covers = new THREE.InstancedMesh(fixtureGeometry, fixture, lampCovers.length);
    lampCovers.forEach((point, index) => {
      shadowTransform.position.copy(point);
      shadowTransform.scale.setScalar(1);
      shadowTransform.updateMatrix();
      covers.setMatrixAt(index, shadowTransform.matrix);
    });
    scene.add(covers);
    glowingLampMaterials.push(fixture);
  }
  nextNightLightUpdate = 0;
  updateEnvironmentLighting();
}

function collectTreeShadowAnchors(campus) {
  campus.traverse(object => {
    if ((!/^(?:Cay.*_Than$|(?:Tree|Palm|Broadleaf|FeatheryTree|SeaAlmond|Bougainvillea|BoundaryTree|SlimTree)_)/i.test(object.name))
        || /(?:Nhanh|BonGach|DatBon)/i.test(object.name)) return;
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const height = box.max.y - box.min.y;
    if (height < 1.8 || height > 18) return;
    const treeHeight = Math.max(height, 4.8);
    const broadCourtyardTree = /^CayCoThuTrai_[12]_Than$/.test(object.name);
    treeShadowAnchors.push({ x: center.x, y: box.min.y, z: center.z, height: treeHeight, broadCourtyardTree });
  });
}

function updateCampusShadows(time) {
  if (!started || currentDay.night > .995 || time < nextShadowUpdate) return;
  nextShadowUpdate = time + .18;
  const target = sun.target.position.set(walker.x, walker.y, walker.z);
  sun.position.copy(target).addScaledVector(sunDirection, 69);
  sun.target.updateMatrixWorld();
  const outside = !activities.insideClassroom;
  if (morningBeams) morningBeams.visible = outside && currentDay.morning > .005;
  if (morningStructureShadows) morningStructureShadows.visible = outside && currentDay.morning > .005;
  const distance = tree => (tree.x - walker.x) ** 2 + (tree.z - walker.z) ** 2;
  treeShadowAnchors.sort((a, b) => distance(a) - distance(b));
  let count = 0;
  if (outside && currentDay.morning + currentDay.sunset > .02) {
    for (const tree of treeShadowAnchors) {
      if (count >= treeShadowLimit || distance(tree) > 45 ** 2) break;
      const { x, y, z, height, broadCourtyardTree } = tree;
      const wideCrown = currentDay.morning * Number(broadCourtyardTree);
      const crownRadius = height * (.37 + .39 * wideCrown);
      shadowTransform.position.set(x, y + height * (.31 + .17 * wideCrown), z);
      shadowTransform.scale.set(.24 + .17 * wideCrown, height * (.62 + .36 * wideCrown), .24 + .17 * wideCrown);
      shadowTransform.updateMatrix();
      trunkShadows.setMatrixAt(count, shadowTransform.matrix);
      shadowTransform.position.set(x, y + height * (.77 + .44 * wideCrown), z);
      shadowTransform.scale.set(crownRadius, height * (.32 + .12 * wideCrown), crownRadius);
      shadowTransform.updateMatrix();
      crownShadows.setMatrixAt(count, shadowTransform.matrix);
      count++;
    }
  }
  for (const mesh of [crownShadows, trunkShadows]) {
    mesh.count = count;
    mesh.visible = count > 0;
    mesh.instanceMatrix.needsUpdate = true;
  }
  let characterCount = 0;
  if (outside && currentDay.morning > .005) {
    for (const { root } of campusNpcs) {
      if (characterCount >= characterShadowLimit) break;
      if (!root.visible || root.position.distanceToSquared(walker) > 25 ** 2) continue;
      shadowTransform.position.copy(root.position);
      shadowTransform.position.y += .89;
      shadowTransform.scale.set(.9, 1, .75);
      shadowTransform.updateMatrix();
      characterShadows.setMatrixAt(characterCount++, shadowTransform.matrix);
    }
  }
  characterShadows.count = characterCount;
  characterShadows.visible = characterCount > 0;
  characterShadows.instanceMatrix.needsUpdate = true;
  renderer.shadowMap.needsUpdate = true;
}

function createFountainEffect(campus) {
  const pool = campus.getObjectByName('MatNuocHo');
  if (!pool) return;
  const poolBounds = new THREE.Box3().setFromObject(pool);
  const poolSize = poolBounds.getSize(new THREE.Vector3());
  const center = poolBounds.getCenter(new THREE.Vector3());
  const waterY = poolBounds.max.y + 0.035;
  const nozzle = campus.getObjectByName('OngPhunNuoc');
  const nozzleBounds = nozzle ? new THREE.Box3().setFromObject(nozzle) : null;
  const nozzleCenter = nozzleBounds ? nozzleBounds.getCenter(new THREE.Vector3()) : center.clone();
  // Emit directly from the tip of the actual nozzle, not from points around the basin.
  const source = new THREE.Vector3(
    nozzleCenter.x,
    nozzleBounds ? nozzleBounds.max.y - 0.025 : waterY + 0.95,
    nozzleCenter.z
  );
  fountainSource = source.clone();

  fountainEffectGroup = new THREE.Group();
  fountainEffectGroup.name = 'HieuUngNuocDaiPhun';
  fountainDroplets = [];
  fountainRipples = [];
  fountainMistParticles = [];
  const outerWater = new THREE.MeshBasicMaterial({
    color: 0x72dfff, transparent: true, opacity: 0.68, depthWrite: false,
    side: THREE.DoubleSide
  });
  const innerWater = new THREE.MeshBasicMaterial({
    color: 0xe5fcff, transparent: true, opacity: 0.88, depthWrite: false,
    side: THREE.DoubleSide
  });
  const dropletMaterial = new THREE.MeshBasicMaterial({
    color: 0xc8f5ff, transparent: true, opacity: 0.92, depthWrite: false
  });
  const dropletGeometry = new THREE.SphereGeometry(0.052, 8, 6);
  const jetCount = 8;

  for (let i = 0; i < jetCount; i++) {
    const angle = (Math.PI * 2 * i) / jetCount + Math.PI / 8;
    const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const start = source.clone();
    const landing = new THREE.Vector3(
      center.x + direction.x * poolSize.x * 0.28,
      waterY + 0.025,
      center.z + direction.z * poolSize.z * 0.28
    );
    const apex = source.y + 0.95 + (i % 3) * 0.2;
    const mid = new THREE.Vector3(
      THREE.MathUtils.lerp(start.x, landing.x, 0.52),
      apex,
      THREE.MathUtils.lerp(start.z, landing.z, 0.52)
    );
    const curve = new THREE.CatmullRomCurve3([start, mid, landing]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.045, 6, false), outerWater);
    tube.name = `TiaNuoc_${i + 1}`;
    fountainEffectGroup.add(tube);
    const core = new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.014, 5, false), innerWater);
    core.name = `LoiTiaNuoc_${i + 1}`;
    fountainEffectGroup.add(core);

    for (let j = 0; j < 4; j++) {
      const droplet = new THREE.Mesh(dropletGeometry, dropletMaterial);
      droplet.userData.curve = curve;
      droplet.userData.phase = (j / 4 + i * 0.071) % 1;
      droplet.scale.setScalar(0.7 + ((i + j) % 3) * 0.18);
      fountainEffectGroup.add(droplet);
      fountainDroplets.push(droplet);
    }

    for (let j = 0; j < 2; j++) {
      const rippleMaterial = new THREE.MeshBasicMaterial({
        color: 0x8deaff, transparent: true, opacity: 0.38,
        depthWrite: false, side: THREE.DoubleSide
      });
      const ripple = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 5, 28), rippleMaterial);
      ripple.rotation.x = Math.PI / 2;
      ripple.position.set(landing.x, waterY + 0.055 + j * 0.012, landing.z);
      ripple.userData.phase = (i / jetCount + j * 0.5) % 1;
      fountainEffectGroup.add(ripple);
      fountainRipples.push(ripple);
    }
  }

  // Fine spray follows small outward arcs from the same nozzle, like a light drizzle.
  const mistCount = 120;
  const mistGeometry = new THREE.SphereGeometry(0.03, 6, 5);
  const mistMaterial = new THREE.MeshBasicMaterial({
    color: 0xc8f5ff, transparent: true, opacity: 0.82, depthWrite: false
  });
  fountainMistMesh = new THREE.InstancedMesh(mistGeometry, mistMaterial, mistCount);
  fountainMistMesh.name = 'HatNuocMuaPhun';
  fountainMistMesh.frustumCulled = false;
  fountainMistMesh.userData.dummy = new THREE.Object3D();
  const mistDummy = fountainMistMesh.userData.dummy;
  for (let i = 0; i < mistCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spread = 0.12 + Math.random() * 0.3;
    fountainMistParticles.push({
      target: new THREE.Vector3(
        center.x + Math.cos(angle) * poolSize.x * spread,
        waterY + 0.025,
        center.z + Math.sin(angle) * poolSize.z * spread
      ),
      phase: Math.random(),
      height: 0.18 + Math.random() * 0.72,
      size: 0.55 + Math.random() * 0.75
    });
    mistDummy.position.copy(source);
    mistDummy.scale.setScalar(0.001);
    mistDummy.updateMatrix();
    fountainMistMesh.setMatrixAt(i, mistDummy.matrix);
  }
  fountainEffectGroup.add(fountainMistMesh);

  scene.add(fountainEffectGroup);
  animateFountain(0);
}

function animateFountain(time) {
  for (const droplet of fountainDroplets) {
    const t = (time * 0.42 + droplet.userData.phase) % 1;
    droplet.position.copy(droplet.userData.curve.getPointAt(t));
    droplet.visible = t > 0.06 && t < 0.97;
  }
  for (const ripple of fountainRipples) {
    const t = (time * 0.34 + ripple.userData.phase) % 1;
    const scale = 0.22 + t * 0.75;
    ripple.scale.set(scale, scale, scale);
    ripple.material.opacity = (1 - t) * 0.38;
  }
  if (fountainMistMesh) {
    const dummy = fountainMistMesh.userData.dummy;
    for (let i = 0; i < fountainMistParticles.length; i++) {
      const particle = fountainMistParticles[i];
      const t = (time * 0.52 + particle.phase) % 1;
      dummy.position.set(
        THREE.MathUtils.lerp(fountainSource.x, particle.target.x, t) + Math.sin(time * 2.1 + i) * 0.045,
        THREE.MathUtils.lerp(fountainSource.y, particle.target.y, t) + Math.sin(Math.PI * t) * particle.height,
        THREE.MathUtils.lerp(fountainSource.z, particle.target.z, t) + Math.cos(time * 1.8 + i) * 0.045
      );
      const edgeFade = Math.min(1, t * 10, (1 - t) * 10);
      dummy.scale.setScalar(particle.size * edgeFade);
      dummy.updateMatrix();
      fountainMistMesh.setMatrixAt(i, dummy.matrix);
    }
    fountainMistMesh.instanceMatrix.needsUpdate = true;
  }
}

function findWalkSurface(x, z, feetY) {
  if (Math.abs(x - groundProbeCache.x) < 0.025 && Math.abs(z - groundProbeCache.z) < 0.025
      && Math.abs(feetY - groundProbeCache.feetY) < 0.025) return groundProbeCache.surfaceY;
  const originY = feetY + MAX_STEP_UP + 0.08;
  groundRaycaster.set(new THREE.Vector3(x, originY, z), new THREE.Vector3(0, -1, 0));
  groundRaycaster.near = 0;
  groundRaycaster.far = MAX_STEP_UP + MAX_STEP_DOWN + 0.08;
  const hits = groundRaycaster.intersectObjects(walkableMeshes, false);
  for (const hit of hits) {
    if (hit.point.y > feetY + MAX_STEP_UP || hit.point.y < feetY - MAX_STEP_DOWN) continue;
    if (!hit.face) continue;
    walkSurfaceNormalMatrix.getNormalMatrix(hit.object.matrixWorld);
    const normalY = hit.face.normal.clone().applyMatrix3(walkSurfaceNormalMatrix).normalize().y;
    if (normalY > 0.62) {
      groundProbeCache.x = x;
      groundProbeCache.z = z;
      groundProbeCache.feetY = feetY;
      groundProbeCache.surfaceY = hit.point.y;
      return hit.point.y;
    }
  }
  groundProbeCache.x = x;
  groundProbeCache.z = z;
  groundProbeCache.feetY = feetY;
  groundProbeCache.surfaceY = null;
  return null;
}

function makeMat(color, roughness = 0.8) {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function rigBone(name) {
  const bone = new THREE.Bone();
  bone.name = 'mixamorig' + name;
  return bone;
}

function avatarTag(profile = {}) {
  return [profile.name || 'Học sinh', profile.className,
    profile.year ? 'K' + profile.year + '–' + (Number(profile.year) + 3) : ''].filter(Boolean).join(' · ');
}

let faceAtlas;
let speakingCharacter;

function characterFaces() {
  if (faceAtlas) return faceAtlas;
  const tile = 128;
  const canvas = document.createElement('canvas');
  canvas.width = tile * 4;
  canvas.height = tile * 2;
  const ctx = canvas.getContext('2d');
  const frames = [];
  for (let row = 0; row < 2; row++) {
    frames[row] = [];
    for (let frame = 0; frame < 4; frame++) {
      ctx.save();
      ctx.translate(frame * tile, row * tile);
      ctx.lineCap = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = ctx.fillStyle = '#35241f';
      for (const x of [38, 90]) {
        ctx.beginPath();
        ctx.moveTo(x - 10, frame === 3 && x === 90 ? 43 : 38);
        ctx.quadraticCurveTo(x, frame === 3 ? 38 : 31, x + 10, frame === 3 && x === 38 ? 43 : 38);
        ctx.stroke();
        ctx.beginPath();
        if (frame === 1 || frame === 2) {
          ctx.moveTo(x - 8, 61);
          ctx.quadraticCurveTo(x, 46, x + 8, 61);
          ctx.stroke();
        } else {
          ctx.ellipse(x, 58, frame === 3 ? 6 : 5, frame === 3 ? 8.5 : 7, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.strokeStyle = '#91614d';
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(64, 65); ctx.lineTo(62, 75); ctx.lineTo(66, 75); ctx.stroke();
      ctx.strokeStyle = ctx.fillStyle = '#633530';
      ctx.lineWidth = 3.3;
      ctx.beginPath();
      if (frame === 3) {
        ctx.ellipse(64, 93, 7, 8, 0, 0, Math.PI * 2); ctx.fill();
      } else if (frame === 2) {
        ctx.moveTo(53, 88); ctx.lineTo(75, 88);
        ctx.bezierCurveTo(73, 103, 55, 103, 53, 88); ctx.fill();
      } else {
        ctx.moveTo(53, 88); ctx.quadraticCurveTo(64, frame === 1 ? 102 : 97, 75, 88); ctx.stroke();
      }
      if (row) {
        ctx.strokeStyle = '#2c282a';
        ctx.lineWidth = 3.2;
        for (const x of [38, 90]) {
          ctx.beginPath(); ctx.roundRect(x - 17, 44, 34, 28, 9); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(55, 56); ctx.quadraticCurveTo(64, 51, 73, 56); ctx.stroke();
      }
      ctx.restore();
      const geometry = new THREE.PlaneGeometry(.375, .36);
      const uv = geometry.attributes.uv;
      const inset = 1 / tile;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, (frame + inset + uv.getX(i) * (1 - 2 * inset)) / 4,
          (1 - row + inset + uv.getY(i) * (1 - 2 * inset)) / 2);
      }
      frames[row].push(geometry);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  faceAtlas = { frames, material: new THREE.MeshBasicMaterial({ map: texture, alphaTest: .32, toneMapped: false }) };
  return faceAtlas;
}

function addCharacterHead(owner, skin, kind, y, glasses = false, hairStyle) {
  const pivot = rigBone('Head');
  pivot.position.y = y - .17;
  owner.add(pivot);
  const head = new THREE.Group();
  head.position.y = .17;
  pivot.add(head);
  const width = .45, height = .47, depth = .41;
  const rounded = (w, h, d, radius, material, x, py, z) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 1, radius), material);
    mesh.position.set(x, py, z);
    head.add(mesh);
    return mesh;
  };
  rounded(width, height, depth, .069, skin, 0, 0, 0);
  const teacher = kind === 'principal';
  const girl = kind === 'girl' || kind === 'studentGirl' || kind === 'flowerTeacher';
  const hair = makeMat(teacher ? 0x595451 : girl ? 0x2e201a : 0x25201e);
  const edge = makeMat(teacher ? 0x746e69 : 0x352821);
  const wearsHat = kind === 'guard' || kind === 'banhmi' || kind === 'xoi';
  rounded(width * 1.05, teacher ? .18 : .148, depth * 1.05, .031, hair,
    0, wearsHat ? .133 : teacher ? .205 : .198, 0);
  if (wearsHat) {
    const hat = makeMat(kind === 'xoi' ? 0xf8f1dc : 0x263343);
    rounded(.47, .12, .42, .035, hat, 0, .194, -.008);
    rounded(.355, .028, .135, .012, hat, 0, .152, .204);
    if (kind === 'guard') rounded(.054, .052, .012, .004, makeMat(0xe7c36b), 0, .194, .205);
    rounded(.40, .20, .115, .025, edge, 0, -.006, -.175);
  } else {
    rounded(.416, girl ? .32 : .31, .16, .036, hair, 0, .025, -.152);
    for (const side of [-1, 1]) rounded(.055, teacher ? .14 : .17, .155, .023, hair, side * .203, .077, -.029);
    const fringe = rounded(teacher ? .262 : .32, teacher ? .060 : .055, .07, .020, edge,
      teacher ? -.073 : -.024, .153, .189);
    fringe.rotation.z = teacher ? -.15 : .09;
    if (teacher) rounded(.092, .045, .052, .012, hair, .133, .154, .189);
    if (hairStyle === 'low-bun' || hairStyle === 'half-up') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 5), hair);
      bun.scale.set(.115, .091, .095);
      bun.position.set(0, hairStyle === 'low-bun' ? -.112 : .064, -.258);
      head.add(bun);
      if (hairStyle === 'half-up') {
        rounded(.29, .28, .095, .035, hair, 0, -.20, -.186);
        rounded(.082, .036, .031, .010, makeMat(0xe68d92), .003, .027, -.33);
      }
    } else if (hairStyle === 'loose') {
      rounded(.36, .61, .12, .04, hair, 0, -.267, -.185);
      for (const side of [-1, 1]) {
        rounded(.09, .38, .091, .028, hair, .152 * side, -.134, -.121).rotation.z = .11 * side;
      }
      rounded(.057, .015, .083, .004, makeMat(0xefbf67), .188, .118, .097).rotation.z = -.38;
    } else if (girl) {
      rounded(.101, .065, .078, .022, makeMat(0xa8423d), 0, -.061, -.25);
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(.058, .034, .24, 7, 1), hair);
      tail.position.set(0, -.171, -.28);
      tail.rotation.x = .18;
      head.add(tail);
    }
  }
  const atlas = characterFaces();
  const frames = atlas.frames[Number(glasses)];
  const face = new THREE.Mesh(frames[0], atlas.material);
  face.name = 'characterFace';
  face.position.set(0, -.014, depth / 2 + .003);
  head.add(face);
  owner.userData.face = { face, frames, pivot, frame: 0 };
  packCharacterPart(head);
}

function setFace(owner, frame, nod = 0) {
  const parts = owner?.userData.face;
  if (!parts) return;
  if (owner.userData.flowerSmile && frame !== 3) frame = 1;
  if (parts.frame !== frame) {
    parts.frame = frame;
    parts.face.geometry = parts.frames[frame];
  }
  parts.pivot.rotation.x = nod;
}

function updateTalkingFace(owner, time) {
  if (speakingCharacter !== owner) setFace(speakingCharacter, 0);
  speakingCharacter = owner;
  const now = performance.now();
  if (owner) {
    const warning = owner.userData.warningUntil > now;
    setFace(owner, warning ? 3 : Math.sin(time * 12) > 0 ? 2 : 1, warning ? -.04 : Math.sin(time * 4.5) * .065);
  }
  const guard = campusNpcs[0]?.root;
  if (guard && guard !== owner && guard.userData.warningUntil) {
    const warning = guard.userData.warningUntil > now;
    setFace(guard, warning ? 3 : 0);
    if (!warning) delete guard.userData.warningUntil;
  }
}

function warnUniform() {
  sound.effect('warning');
  const guard = campusNpcs.find(npc => npc.kind === 'guard');
  if (guard) guard.root.userData.warningUntil = performance.now() + 2400;
}

function makeAvatar(kind, outfit = {}) {
  const root = rigBone('Hips');
  const shirt = makeMat(outfit.shirt === 'blue' ? 0x70b9df : 0xf8f7ee);
  const pants = makeMat(outfit.pants === 'blue' ? 0x243b5a : 0x151515);
  const skin = makeMat(0xe8bd98);
  const shoes = makeMat(0x282522);
  const white = makeMat(0xffffff);
  const addBox = (w,h,d,mat,x,y,z,parent=root) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    mesh.position.set(x,y,z);
    parent.add(mesh);
    return mesh;
  };

  const legs = [];
  const knees = [];
  for (const side of [-1, 1]) {
    const leg = rigBone(side < 0 ? 'LeftUpLeg' : 'RightUpLeg');
    leg.position.set(side * 0.105, 0.82, 0);
    root.add(leg);
    addBox(0.18,0.38,0.2,pants,0,-0.17,0,leg);
    const knee = rigBone(side < 0 ? 'LeftLeg' : 'RightLeg');
    knee.position.y = -0.35;
    leg.add(knee);
    knees.push(knee);
    addBox(0.18,0.37,0.2,pants,0,-0.17,0,knee);
    addBox(0.2,0.07,0.28,shoes,0,-0.35,0.04,knee);
    if (outfit.footwear === 'slides') {
      addBox(0.2,0.065,0.075,shoes,0,-0.31,0.10,knee);
    } else {
      addBox(0.2,0.055,0.07,shoes,0,-0.31,0.06,knee);
      addBox(0.035,0.085,0.045,shoes,-0.085,-0.31,-0.065,knee);
      addBox(0.035,0.085,0.045,shoes,0.085,-0.31,-0.065,knee);
    }
    legs.push(leg);
  }
  const isTucked = outfit.tucked !== 'no';
  addBox(0.49,isTucked ? 0.62 : 0.78,0.3,shirt,0,isTucked ? 1.13 : 1.04,0);
  if (kind === 'girl' && (outfit.pants === 'skirt' || outfit.pants === 'aodai')) {
    const length = outfit.pants === 'skirt' ? .4 : .66;
    const hem = new THREE.Mesh(new THREE.CylinderGeometry(.24, .34, length, 8, 1), outfit.pants === 'skirt' ? pants : shirt);
    hem.position.y = .82 - length / 2;
    root.add(hem);
  }
  if (isTucked) addBox(0.50,0.045,0.31,pants,0,0.84,0);
  // Shorten and connect the neck to the head so it no longer looks stretched.
  addBox(0.13,0.12,0.13,skin,0,1.49,0);
  addCharacterHead(root, skin, kind, 1.71);
  // Upper arms, forearms and hands; shoulders are separate pivots for walk animation.
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = rigBone(side < 0 ? 'LeftArm' : 'RightArm');
    arm.position.set(side * 0.27,1.34,0);
    root.add(arm);
    addBox(0.16,0.25,0.18,shirt,side * 0.025,-0.075,0,arm);
    addBox(0.105,0.27,0.115,skin,side * 0.045,-0.32,0,arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065,10,8),skin);
    hand.position.set(side * 0.045,-0.49,0.005);
    arm.add(hand);
    arm.rotation.z = side * -0.08;
    arms.push(arm);
  }

  // Small school badge and the selected school bag make the uniform readable.
  addBox(0.065,0.065,0.018,makeMat(0x9d2b25),-0.14,1.24,0.16);
  if (outfit.bag === 'backpack') {
    addBox(0.32,0.42,0.15,makeMat(0x8d332d),0,0.98,-0.22);
    addBox(0.1,0.34,0.045,makeMat(0x6e2925),-0.19,1.09,0.035);
    addBox(0.1,0.34,0.045,makeMat(0x6e2925),0.19,1.09,0.035);
  } else {
    const strapFront = addBox(0.04,0.62,0.022,makeMat(0x523a2a),0,1.11,0.17);
    strapFront.rotation.z = -0.38;
    const strapBack = addBox(0.04,0.62,0.022,makeMat(0x523a2a),0,1.11,-0.17);
    strapBack.rotation.z = 0.38;
    // The hip satchel protrudes from the side, so it stays visible from behind.
    addBox(0.19,0.24,0.12,makeMat(0x8d332d),0.23,0.91,-0.20);
    addBox(0.14,0.035,0.015,makeMat(0xc59658),0.23,0.91,-0.27);
  }
  addBox(0.16,0.025,0.015,white,0,1.12,0.252);
  const bodyPivot = rigBone('Spine');
  const legSet = new Set(legs);
  for (const child of [...root.children]) {
    if (legSet.has(child)) continue;
    root.remove(child);
    child.position.y -= 1.02;
    bodyPivot.add(child);
  }
  bodyPivot.position.y = 1.02;
  root.add(bodyPivot);
  root.position.set(walker.x,walker.y,walker.z);
  root.userData.legs = legs;
  root.userData.knees = knees;
  for (const part of [bodyPivot, ...legs, ...knees, ...arms]) packCharacterPart(part);
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.name === 'characterFace') return;
    mesh.castShadow = mesh.receiveShadow = true;
  });
  root.userData.arms = arms;
  root.userData.bodyPivot = bodyPivot;
  return root;
}

const campusNpcs = [];
const footballPlayers = [];
let footballBall = null;
function makeNpc(name, kind, x, z, style = {}) {
  const flowerTeacher = kind === 'flowerTeacher';
  const root = new THREE.Group();
  const mat = (color, roughness=0.42) => new THREE.MeshStandardMaterial({ color, roughness });
  const skin=mat(kind==='principal'?0xe6c6aa:0xf0c29b), dark=mat(0x25211f), pants=mat(flowerTeacher ? 0xf6f2e7 : kind==='guard'?0x24334a:kind==='principal'?0x323943:0x17191b);
  const shirt=mat(style.dress ?? (kind==='guard'?0x5ba8d9:kind==='football'?0xfffdf5:kind==='principal'?0xdce8ee:kind==='xoi'?0xf5f0e6:kind==='studentGirl'?0xfffdf5:kind==='studentBoy'?0xf8f7ee:0x9aaa83));
  const apron=mat(kind==='xoi'?0xb29a6a:0x34453d);
  const gold=mat(0xe7c36b), white=mat(0xfffaf0), shoeMat=mat(0x302b28);
  const add = (geometry, material, px, py, pz, parent=root) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(px,py,pz); parent.add(mesh); return mesh;
  };
  const box = (w,h,d,material,px,py,pz,parent=root) => add(new THREE.BoxGeometry(w,h,d),material,px,py,pz,parent);
  const softBox=(w,h,d,radius,material,px,py,pz,parent=root)=>
    add(Math.max(w,h,d) < .35 ? new THREE.BoxGeometry(w,h,d) : new RoundedBoxGeometry(w,h,d,1,radius),material,px,py,pz,parent);
  const oval=(sx,sy,sz,material,px,py,pz,parent=root)=>{
    const mesh=add(new THREE.SphereGeometry(1,8,5),material,px,py,pz,parent);
    mesh.scale.set(sx,sy,sz); return mesh;
  };
  const capsule=(radius,length,material,px,py,pz,parent=root)=>add(new THREE.CapsuleGeometry(radius,length,2,7),material,px,py,pz,parent);
  // Balanced block-figure proportions inspired by the Roblox reference.
  softBox(flowerTeacher ? .45 : .54,0.62,0.31,0.055,shirt,0,1.04,0);
  if (flowerTeacher) {
    for (const side of [-1, 1]) {
      const flap = softBox(.44,.73,.059,.028,shirt,0,.49,side * .155);
      flap.rotation.x = -side * .095;
    }
    box(.145,.053,.12,shirt,0,1.346,.017);
    box(.022,.23,.011,mat(0xffe1af),.105,1.14,.153).rotation.z = -.29;
  }
  softBox(0.45,0.20,0.29,0.04,pants,0,0.65,0);
  const legs=[];
  for(const side of [-1,1]){
    const leg=rigBone(side < 0 ? 'LeftUpLeg' : 'RightUpLeg');
    leg.position.set(side*0.12,0.66,0);
    root.add(leg);
    softBox(0.20,0.59,0.22,0.035,pants,0,-0.24,0,leg);
    softBox(0.22,0.14,0.29,0.04,shoeMat,0,-0.52,0.035,leg);
    legs.push(leg);
  }
  // Role-specific uniform details.
  if(kind==='principal'){
    const pocket=mat(0xf8fbfc), button=mat(0xaebdc4);
    box(0.12,0.08,0.025,gold,-0.16,1.18,0.17);
    box(0.14,0.09,0.02,pocket,-0.16,0.94,0.164);
    for(let i=0;i<3;i++) oval(0.012,0.012,0.008,button,0,1.16-i*0.12,0.164);
  }else if(kind==='guard'){
    box(0.11,0.08,0.025,gold,-0.16,1.15,0.17);
    box(0.13,0.035,0.045,dark,-0.15,1.14,0.19);
    box(0.09,0.045,0.07,gold,-0.16,1.42,0);
    box(0.09,0.045,0.07,gold,0.16,1.42,0);
    box(0.48,0.045,0.025,dark,0,0.77,0.15);
    box(0.075,0.06,0.025,gold,0,0.77,0.17);
  }else if(kind==='xoi'||kind==='banhmi'){
    box(0.43,0.34,0.035,apron,0,1.00,0.18);
    box(0.25,0.13,0.04,apron,0,0.85,0.20);
    box(0.09,0.055,0.012,gold,0,0.88,0.224);
    // Apron straps over the shoulders.
    box(0.055,0.28,0.04,apron,-0.14,1.28,0.14).rotation.z=-0.18;
    box(0.055,0.28,0.04,apron,0.14,1.28,0.14).rotation.z=0.18;
  }
  // Short neck and a broad cuboid head keep the toy-like silhouette in proportion.
  softBox(0.15,0.13,0.15,0.045,skin,0,1.42,0);
  addCharacterHead(root, skin, kind, 1.68, kind === 'principal' || name === 'Bạn lớp trưởng' || style.glasses === true, style.hair);
  if (['football', 'studentBoy', 'studentGirl'].includes(kind)) {
    const badgeColor = mat(kind === 'studentGirl' ? 0xa64f77 : 0x3c6e8a);
    softBox(0.09,0.10,0.025,0.018,badgeColor,-0.16,1.13,0.17);
    box(0.045,0.04,0.012,white,-0.16,1.13,0.19);
  }
  const arms=[];
  for (const side of [-1,1]) {
    const arm=rigBone(side < 0 ? 'LeftArm' : 'RightArm'); arm.position.set(side * (flowerTeacher ? .275 : .34),1.27,0); root.add(arm);
    softBox(0.20,0.36,0.22,0.04,shirt,side*0.025,-0.08,0,arm);
    const forearm=softBox(0.17,0.32,0.19,0.035,flowerTeacher ? shirt : skin,side*0.035,-0.39,0.015,arm);
    const palm=softBox(0.19,0.18,0.17,0.035,skin,side*0.045,-0.62,0.025,arm);

    arm.userData.forearm=forearm; arm.userData.palm=palm;
    arms.push(arm);
  }
  if (kind === 'guard') {
    box(.06,.12,.035,gold,.26,.71,.2);
    box(.035,.1,.035,mat(0x858687),.2,1.82,-.06);
  }
  let lessonBook;
  if (flowerTeacher) {
    lessonBook = new THREE.Group();
    arms[0].add(lessonBook);
    box(.245,.305,.054,mat(style.book),-.035,-.547,.171,lessonBook);
    box(.211,.264,.056,white,-.035,-.547,.169,lessonBook);
    box(.251,.311,.017,mat(style.book),-.035,-.547,.212,lessonBook);
    packCharacterPart(lessonBook);
  }
  if (name === 'Thầy giáo') {
    box(.23,.29,.055,mat(0x445d55),.035,-.58,.13,arms[1]);
    root.scale.y = 1.12;
  }
  if (name === 'Cô căng-tin') root.scale.x = 1.13;
  if (name === 'Bạn lớp trưởng') {
    box(.42,.025,.022,mat(0x4e728b),0,.94,.172);
    box(.23,.29,.045,mat(0xa36f42),.035,-.54,.16,arms[1]);
  }
  const bodyPivot=rigBone('Spine');
  const legSet=new Set(legs);
  for(const child of [...root.children]){
    if(legSet.has(child)) continue;
    root.remove(child);
    child.position.y-=1.04;
    bodyPivot.add(child);
  }
  bodyPivot.position.y=1.04;
  root.add(bodyPivot);
  for (const part of [bodyPivot, ...legs, ...arms]) packCharacterPart(part);
  const referenceY = style.floor ?? 0;
  root.position.set(x, findWalkSurface(x, z, referenceY) ?? referenceY, z);
  scene.add(root);
  const npc = {
    name,kind,root,arms,legs,bodyPivot,lessonBook,homeX:x,homeZ:z,
    isStudent:kind==='studentBoy'||kind==='studentGirl',
    greetingStart:null,wasNearPrincipal:false,
    dialogue:kind==='guard'?'Em sơ vin chưa? Đi dép quai hậu chưa?':kind==='xoi'?'Em trai, em gái ăn gì nào?':kind==='banhmi'?'Bánh mì nóng không con ơi?':kind==='principal'?'Chào các em!':kind==='studentBoy'||kind==='studentGirl'?'Chào bạn!':'Chuyền đi!'
  };
  npc.nameTag=document.createElement('div');
  npc.nameTag.className=`npc-name-tag${kind==='principal'?' principal-name-tag':''}`;
  npc.nameTag.textContent=name;
  $('#npcLabels').append(npc.nameTag);
  if (npc.isStudent) {
    npc.mixer = new THREE.AnimationMixer(root);
    const wave = new THREE.AnimationClip('wave', .85, [
      new THREE.NumberKeyframeTrack('mixamorigRightArm.rotation[x]', [0,.2,.55,.85], [0,-1.85,-1.85,0]),
      new THREE.NumberKeyframeTrack('mixamorigRightArm.rotation[z]', [0,.22,.38,.55,.7,.85], [-.08,.4,.15,.45,.19,-.08])
    ]);
    npc.wave = npc.mixer.clipAction(wave);
    npc.wave.setLoop(THREE.LoopOnce, 1);
    npc.lastWave = -Infinity;
  }
  campusNpcs.push(npc);
  return npc;
}

let gateHorse;
const gateHorseName = 'Bùi Quốc Hiệp 06';

function createGateHorse(campus) {
  const pillar = campus.getObjectByName('TruCongPhai');
  if (!pillar) return;
  const box = new THREE.Box3().setFromObject(pillar);
  const x = THREE.MathUtils.lerp(box.min.x, box.max.x, .48);
  const ray = new THREE.Raycaster(new THREE.Vector3(x, box.min.y + 1.3, box.max.z + 2), new THREE.Vector3(0, 0, -1));
  const contact = ray.intersectObject(pillar, true)[0];
  if (!contact) return;
  const root = new THREE.Group();
  root.name = gateHorseName;
  const wall = contact.point.z;
  root.position.set(x, findWalkSurface(x, wall + .42, box.min.y) ?? box.min.y, wall + .016);

  const coat = makeMat(0x55301f);
  const cheek = makeMat(0x623a29);
  const mane = makeMat(0x241b18);
  const muzzle = makeMat(0x947764);
  const hoof = makeMat(0x332826);
  const pupil = makeMat(0x17110e);
  const eyeWhite = makeMat(0xf0dcc3);
  const innerEar = makeMat(0x996650);
  const part = (parent, width, height, depth, material, px, py, pz) => {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    piece.position.set(px, py, pz);
    parent.add(piece);
    return piece;
  };
  const up = new THREE.Vector3(0, 1, 0);
  const segment = (parent, material, width, depth, from, to) => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const middle = a.clone().lerp(b, .5);
    const piece = part(parent, width, a.distanceTo(b), depth, material, middle.x, middle.y, middle.z);
    piece.quaternion.setFromUnitVectors(up, b.sub(a).normalize());
    return piece;
  };

  // +Z faces the sidewalk. Both the back and the lifted hoof meet the pillar plane.
  part(root, .61, .90, .50, coat, 0, 1.20, .255);
  part(root, .62, .38, .49, coat, 0, .79, .25);
  part(root, .49, .41, .42, cheek, 0, 1.55, .34);
  segment(root, coat, .33, .34, [0, 1.45, .3], [0, 1.96, .54]);
  segment(root, mane, .24, .15, [0, 1.51, .12], [0, 2.02, .40]);

  // One hind leg stands on the ground. The other angles back against the wall.
  segment(root, coat, .21, .22, [-.205, .79, .30], [-.25, .43, .39]);
  segment(root, coat, .15, .16, [-.25, .44, .39], [-.25, .11, .43]);
  part(root, .19, .13, .22, hoof, -.25, .065, .46);
  segment(root, coat, .21, .22, [.23, .81, .27], [.29, .52, .48]);
  segment(root, coat, .15, .15, [.29, .53, .48], [.31, .52, .11]);
  part(root, .19, .15, .19, hoof, .31, .52, .095);

  for (const side of [-1, 1]) {
    const foreX = side * .273;
    const shift = side > 0 ? .065 : 0;
    segment(root, coat, .15, .17, [foreX, 1.55, .43], [foreX, 1.30, .57]);
    segment(root, cheek, .125, .14, [foreX, 1.31, .57], [foreX, 1.03 + shift, .56]);
    part(root, .147, .108, .16, hoof, foreX, .99 + shift, .574);
  }

  const tail = new THREE.Group();
  tail.position.set(-.2, .86, .109);
  root.add(tail);
  segment(tail, mane, .126, .15, [0, 0, 0], [-.12, -.31, .027]);
  segment(tail, mane, .15, .15, [-.12, -.27, .025], [-.17, -.51, .10]);

  const head = new THREE.Group();
  head.position.set(0, 1.92, .51);
  root.add(head);
  part(head, .384, .38, .35, coat, 0, .083, .108);
  part(head, .31, .25, .34, cheek, 0, .019, .252);
  part(head, .333, .211, .206, muzzle, 0, -.047, .392);
  part(head, .278, .024, .022, coat, 0, -.117, .498);
  part(head, .25, .102, .22, mane, 0, .239, .076);
  part(head, .2, .085, .135, mane, -.053, .207, .233).rotation.z = -.19;
  const eyes = new THREE.Group();
  eyes.position.y = .121;
  head.add(eyes);
  const eyeGeometry = new THREE.SphereGeometry(1, 8, 5);
  const oval = (parent, material, px, py, pz, sx, sy, sz) => {
    const piece = new THREE.Mesh(eyeGeometry, material);
    piece.position.set(px, py, pz);
    piece.scale.set(sx, sy, sz);
    parent.add(piece);
  };
  for (const side of [-1, 1]) {
    part(head, .095, .201, .106, coat, side * .121, .319, .064).rotation.z = -side * .18;
    part(head, .049, .124, .023, innerEar, side * .132, .337, .127).rotation.z = -side * .18;
    oval(head, pupil, side * .087, -.032, .493, .027, .019, .011);
    oval(eyes, eyeWhite, side * .181, 0, .232, .035, .034, .038);
    oval(eyes, pupil, side * .195, .001, .252, .023, .025, .026);
  }

  for (const group of [root, head, tail, eyes]) packCharacterPart(group);
  scene.add(root);
  addObstacleToGrid(new THREE.Box3(
    new THREE.Vector3(x - .32, root.position.y, wall),
    new THREE.Vector3(x + .34, root.position.y + 1.73, wall + .62)
  ));
  const tag = document.createElement('div');
  tag.className = 'npc-name-tag';
  tag.textContent = gateHorseName;
  tag.hidden = true;
  $('#npcLabels').append(tag);
  gateHorse = { root, head, tail, eyes, tag, anchor: new THREE.Vector3() };
  activities.registerGateHorse(root);
}

function projectNpcTag(tag, anchor, distanceCheck, distanceSquared, suppressed = false) {
  if (distanceCheck) tag.classList.toggle('is-distant', distanceSquared > 15 ** 2);
  const onScreen = Math.abs(anchor.x) < 1 && Math.abs(anchor.y) < 1 && Math.abs(anchor.z) < 1;
  const hidden = !started || !onScreen || suppressed;
  if (tag.hidden !== hidden) tag.hidden = hidden;
  if (hidden) return;
  tag.style.left = ((anchor.x * .5 + .5) * innerWidth) + 'px';
  tag.style.top = ((.5 - anchor.y * .5) * innerHeight) + 'px';
}

function updateGateHorse(dt, time, distanceCheck) {
  if (!gateHorse) return;
  const { root, head, tail, eyes, tag, anchor } = gateHorse;
  const conversation = activities.horseDialogue;
  const dx = walker.x - root.position.x;
  const dz = walker.z - root.position.z;
  const age = performance.now() - conversation.gestureAt;
  const talking = conversation.talking;
  const near = dx * dx + dz * dz < 22 ** 2;
  if (near) {
    const turn = talking ? THREE.MathUtils.clamp(Math.atan2(dx, dz), -.86, .86) : -.27;
    head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, turn, 1 - Math.exp(-dt * 6));
    const bold = conversation.mood === 'bold';
    head.rotation.x = .09 + (talking ? Math.sin(age / (bold ? 135 : 180)) * Math.exp(-age / 930) * (bold ? .27 : .17) : 0);
    head.rotation.z = bold ? Math.sin(age / 110) * Math.exp(-age / 650) * .11 : 0;
    tail.rotation.z = Math.sin(time * 1.7) * .13;
    eyes.scale.y = conversation.mood === 'smile' ? .15 : time % 5.6 > 5.46 ? .08 : 1;
  }
  anchor.set(0, 2.62, .62).add(root.position).project(camera);
  projectNpcTag(tag, anchor, distanceCheck, distanceCheck ? root.position.distanceToSquared(walker) : 0, talking);
  conversation.project(anchor);
}

function createCampusNpcs() {
  if (campusNpcs.length) return;
  const guard = makeNpc('Bác bảo vệ','guard',6.3,-7.2);
  guard.patrol = { min:2.5,max:10.2 };
  guard.dialogue = 'Chào con! Ghé tượng đài rồi dạo ra hồ cá nhé.';
  activities.registerNpc(guard, 'guard');
  activities.registerSecretGuard(guard);
  const teacher = makeNpc('Thầy giáo','principal',22.6,-53.3);
  teacher.dialogue = 'Em có muốn nghe chuyện về cụ Nguyễn Khuyến không?';
  activities.registerNpc(teacher, 'teacher');
  const flowerTeachers = [
    ['Cô Hường', -11, -71.4, { dress: 0xf78342, hair: 'low-bun', glasses: true, floor: 1.1, book: 0x629391 }],
    ['Cô Quyên', 6, -65.2, { dress: 0xf3bc4c, hair: 'loose', book: 0x815845 }],
    ['Cô Nhung', 38.5, -22.5, { dress: 0xe987a8, hair: 'half-up', floor: 1.0, book: 0x665582 }]
  ];
  for (const [name, x, z, style] of flowerTeachers) {
    const npc = makeNpc(name, 'flowerTeacher', x, z, style);
    npc.dialogue = 'Chào em! Chúc em có một buổi dạo trường thật vui.';
    activities.registerFlowerTeacher(npc);
  }

  const canteen = makeNpc('Cô căng-tin','xoi',19,-19.5);
  const stall = new THREE.Mesh(new THREE.BoxGeometry(1.9, .82, .55), makeMat(0x7b5035));
  stall.position.copy(canteen.root.position).add(new THREE.Vector3(0,.41,-.66));
  scene.add(stall);
  canteen.dialogue = 'Ghé cô chọn món cầm tay rồi ra hồ ngồi nghỉ con nhé.';
  activities.registerNpc(canteen, 'canteen');
  const monitor = makeNpc('Bạn lớp trưởng','studentGirl',19.7,-25.9);
  monitor.dialogue = 'Mời bạn ghi vài dòng lên bảng vàng kỷ niệm!';
  activities.registerNpc(monitor, 'monitor');
  const xoiSeller=makeNpc('Cô bán xôi','xoi',-23.5,17);
  xoiSeller.root.rotation.y=Math.PI;
  xoiSeller.arms[1].rotation.x=-0.35;
  activities.registerSecretVendor(xoiSeller, 'xoi');
  const breadSeller=makeNpc('Cô bán bánh mì','banhmi',26.5,17);
  breadSeller.root.rotation.y=Math.PI;
  breadSeller.arms[1].rotation.x=-0.45;
  activities.registerSecretVendor(breadSeller, 'bread');

  const principal=makeNpc('Thầy hiệu trưởng (anh Long)','principal',0,-42);
  principal.patrol={type:'principal',centerX:0,centerZ:-42,radiusX:9,radiusZ:7,phase:0,floorY:principal.root.position.y};
  const schoolStudents=[
    ['Minh Anh · Học sinh nữ','studentGirl',-10,-30],
    ['Quang Huy · Học sinh nam','studentBoy',10,-30],
    ['Thu Hà · Học sinh nữ','studentGirl',-10,-54],
    ['Đức Anh · Học sinh nam','studentBoy',10,-54]
  ];
  for(let i=0;i<schoolStudents.length;i++){
    const [name,kind,x,z]=schoolStudents[i];
    const student=makeNpc(name,kind,x,z);
    student.patrol={type:'student',centerX:x,centerZ:z,radiusX:0.75,radiusZ:0.55,phase:i*1.7,floorY:student.root.position.y};
  }

  // Six students stay inside the GLB football-pitch outline and pass a ball.
  const fieldLineup=[[-15,-139],[-9,-127],[-2,-144],[6,-129],[14,-142],[22,-133]];
  for(let i=0;i<fieldLineup.length;i++){
    const [x,z]=fieldLineup[i];
    const player=makeNpc(`Học sinh đá bóng ${i+1}`,'football',x,z);
    player.football={index:i,baseX:x,baseZ:z,phase:i*1.17,floorY:player.root.position.y};
    footballPlayers.push(player);
  }
  createFootballBall();
}

function createFootballBall(){
  if(footballBall) return;
  footballBall=new THREE.Group();
  const shell=new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.17,2),
    new THREE.MeshStandardMaterial({color:0xf8f7ef,roughness:0.74})
  );
  footballBall.add(shell);
  const patchMaterial=new THREE.MeshStandardMaterial({color:0x252729,roughness:0.8});
  const patchGeometry=new THREE.CircleGeometry(0.042,5);
  const normals=[
    [0,0,1],[0.78,0,0.63],[-0.78,0,0.63],[0,0.78,0.63],[0,-0.78,0.63],
    [0.52,0.68,-0.52],[-0.52,-0.68,-0.52]
  ];
  for(const values of normals){
    const normal=new THREE.Vector3(...values).normalize();
    const patch=new THREE.Mesh(patchGeometry,patchMaterial);
    patch.position.copy(normal).multiplyScalar(0.165);
    patch.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);
    footballBall.add(patch);
  }
  scene.add(footballBall);
  const first=footballPlayers[0];
  if(first){
    const floor=first.football.floorY;
    footballBall.position.set(first.homeX,floor+0.17,first.homeZ);
  }
}

function updateFootballGame(time){
  if(!footballPlayers.length||!footballBall) return;
  const passDuration=2.45;
  const passNumber=Math.floor(time/passDuration);
  const passProgress=(time%passDuration)/passDuration;
  const passer=footballPlayers[passNumber%footballPlayers.length];
  const receiver=footballPlayers[(passNumber+1)%footballPlayers.length];
  const shoutLines=['Chuyền đi!','Sút đi!','Đá sang đây!','Tạt sang cánh!','Sút đi, vào rồi!'];

  for(const player of footballPlayers){
    const {index,baseX,baseZ,phase}=player.football;
    const runPhase=time*2.5+phase;
    player.root.position.x=baseX+Math.sin(runPhase*0.48)*1.05;
    player.root.position.z=baseZ+Math.cos(runPhase*0.42)*0.72;
    player.root.position.y=player.football.floorY+Math.abs(Math.sin(runPhase*2.4))*0.045;
    const next=footballPlayers[(index+1)%footballPlayers.length];
    player.root.rotation.y=Math.atan2(next.root.position.x-player.root.position.x,next.root.position.z-player.root.position.z);
    const stride=Math.sin(runPhase*2.4)*0.48;
    player.legs[0].rotation.x=stride;
    player.legs[1].rotation.x=-stride;
    player.arms[0].rotation.x=-stride*0.68;
    player.arms[1].rotation.x=stride*0.68;
    player.dialogue=shoutLines[(Math.floor(time/1.55)+index)%shoutLines.length];
  }

  // The current passer swings a leg as the ball leaves; it arcs to the receiver.
  const kick=Math.max(0,Math.sin(Math.PI*Math.min(1,passProgress/0.20)));
  passer.legs[1].rotation.x=-0.35-kick*0.95;
  passer.arms[0].rotation.x=0.25+kick*0.45;
  const start=passer.root.position, end=receiver.root.position;
  const ballX=THREE.MathUtils.lerp(start.x,end.x,passProgress);
  const ballZ=THREE.MathUtils.lerp(start.z,end.z,passProgress);
  const floor=THREE.MathUtils.lerp(passer.football.floorY,receiver.football.floorY,passProgress);
  footballBall.position.set(
    ballX,
    floor+0.17+Math.sin(Math.PI*passProgress)*0.62,
    ballZ
  );
  footballBall.rotation.x+=0.12;
  footballBall.rotation.z+=0.08;
}

function updateCampusNpcs(time, dt, distanceCheck) {
  if (!campusNpcs.length) return;
  updateFootballGame(time);
  let nearest = null, nearestDistance = Infinity;
  let greetingStudent=null, greetingStudentDistance=Infinity;
  const principal=campusNpcs.find(npc=>npc.patrol?.type==='principal');
  for (const npc of campusNpcs) {
    if (npc.football) {
      // The team runs and calls out while staying on the pitch.
    } else if (npc.kind==='principal' && npc.patrol) {
      const p=npc.patrol, angle=time*0.19+p.phase;
      npc.root.position.x=p.centerX+Math.cos(angle)*p.radiusX;
      npc.root.position.z=p.centerZ+Math.sin(angle)*p.radiusZ;
      npc.root.position.y=p.floorY;
      const dx=-Math.sin(angle)*p.radiusX, dz=Math.cos(angle)*p.radiusZ;
      npc.root.rotation.y=Math.atan2(dx,dz);
      const stride=Math.sin(time*2.5)*0.25;
      npc.legs[0].rotation.x=stride; npc.legs[1].rotation.x=-stride;
      npc.arms[0].rotation.x=-stride*0.55; npc.arms[1].rotation.x=stride*0.55;
    } else if (npc.kind==='guard') {
      const mid=(npc.patrol.min+npc.patrol.max)/2, half=(npc.patrol.max-npc.patrol.min)/2;
      npc.root.position.x=mid+Math.sin(time*0.65)*half;
      npc.root.rotation.y=Math.cos(time*0.65)>=0 ? Math.PI/2 : -Math.PI/2;
      npc.arms[0].rotation.x=Math.sin(time*4)*0.18;
      npc.arms[1].rotation.x=-0.25-Math.abs(Math.sin(time*2))*0.18;
    } else if (npc.isStudent && npc.patrol) {
      const p=npc.patrol, angle=time*0.3+p.phase;
      npc.root.position.x=p.centerX+Math.cos(angle)*p.radiusX;
      npc.root.position.z=p.centerZ+Math.sin(angle)*p.radiusZ;
      npc.root.position.y=p.floorY;
      const dx=-Math.sin(angle)*p.radiusX, dz=Math.cos(angle)*p.radiusZ;
      npc.root.rotation.y=Math.atan2(dx,dz);
      const stride=Math.sin(time*2.2+p.phase)*0.2;
      npc.legs[0].rotation.x=stride; npc.legs[1].rotation.x=-stride;
      npc.arms[0].rotation.x=-stride*0.45; npc.arms[1].rotation.x=stride*0.45;
    }else if (npc.kind !== 'flowerTeacher') {
      const offer=npc.kind==='xoi'?0.35:0.45;
      npc.arms[1].rotation.x=-offer-Math.sin(time*1.8)*0.08;
    }

    const distanceSquared = npc.root.position.distanceToSquared(walker);
    const canAnimate = started && distanceSquared <= 15 ** 2;
    if (npc.mixer && canAnimate) {
      if (distanceSquared < 3.6 ** 2 && time - npc.lastWave > 7) {
        npc.lastWave = time;
        npc.wave.reset().play();
      }
      npc.mixer.update(dt);
    } else if (npc.wave?.isRunning()) npc.wave.stop();
    if(principal && npc.isStudent){
      const distanceToPrincipal=Math.hypot(npc.root.position.x-principal.root.position.x,npc.root.position.z-principal.root.position.z);
      if(distanceToPrincipal<5.5 && !npc.wasNearPrincipal){
        npc.wasNearPrincipal=true;
        npc.greetingStart=time;
      }else if(distanceToPrincipal>7.5){
        npc.wasNearPrincipal=false;
      }
      if(npc.greetingStart!==null){
        const progress=(time-npc.greetingStart)/1.8;
        if(progress>=1){npc.greetingStart=null;npc.bodyPivot.rotation.x=0;}
        else{
          npc.bodyPivot.rotation.x=Math.sin(Math.PI*Math.max(0,progress))*(Math.PI/4);
          npc.legs[0].rotation.x=0; npc.legs[1].rotation.x=0;
          npc.arms[0].rotation.x=0; npc.arms[1].rotation.x=0;
          npc.root.rotation.y=Math.atan2(principal.root.position.x-npc.root.position.x,principal.root.position.z-npc.root.position.z);
          if(distanceToPrincipal<greetingStudentDistance){greetingStudent=npc;greetingStudentDistance=distanceToPrincipal;}
        }
      }
    }
    const distance = Math.sqrt(distanceSquared);
    if (mobile) npc.root.visible = distance < 23;
    const speechRange=npc.football?23:9;
    if (distance<speechRange && distance<nearestDistance) { nearest=npc; nearestDistance=distance; }

    const projected=projectedLabel.copy(npc.root.position).setY(npc.root.position.y + 2.22).project(camera);
    projectNpcTag(npc.nameTag, projected, distanceCheck, distanceSquared);
  }

  let playerGreetingActive=false;
  if(principal&&started&&avatar){
    const distanceToPrincipal=Math.hypot(walker.x-principal.root.position.x,walker.z-principal.root.position.z);
    if(distanceToPrincipal<5.5&&!playerWasNearPrincipal){
      playerWasNearPrincipal=true;
      playerGreetingStart=time;
    }else if(distanceToPrincipal>7.5){
      playerWasNearPrincipal=false;
    }
    if(playerGreetingStart!==null){
      const progress=(time-playerGreetingStart)/1.8;
      if(progress>=1){playerGreetingStart=null;avatar.userData.bodyPivot.rotation.x=0;}
      else{
        playerGreetingActive=true;
        avatar.userData.bodyPivot.rotation.x=Math.sin(Math.PI*Math.max(0,progress))*(Math.PI/4);
        avatar.rotation.y=Math.atan2(principal.root.position.x-walker.x,principal.root.position.z-walker.z);
      }
    }
  }

  const bubble=$('#npcSpeech');
  const dialogSpeaker = activities.dialogSpeaker;
  const roadWarning = started && !dialogSpeaker && !activities.blocksMovement ? traffic.speech(camera) : null;
  if (roadWarning && Math.abs(roadWarning.z) < 1) {
    bubble.setAttribute('data-traffic', '');
    bubble.hidden = false;
    const warning = 'Đi đứng cẩn thận cháu ơi, đường quốc lộ đông xe lắm!';
    if (bubble.textContent !== warning) bubble.textContent = warning;
    bubble.style.left = THREE.MathUtils.clamp((roadWarning.x * .5 + .5) * innerWidth,
      Math.min(145, innerWidth * .5), Math.max(innerWidth - 145, innerWidth * .5)) + 'px';
    bubble.style.top = THREE.MathUtils.clamp((.5 - roadWarning.y * .5) * innerHeight - 11, 96, innerHeight - 18) + 'px';
    updateTalkingFace(null, time);
    return;
  }
  if (bubble.hasAttribute('data-traffic')) bubble.removeAttribute('data-traffic');
  if (activities.horseDialogue.talking) {
    bubble.hidden = true;
    updateTalkingFace(null, time);
    return;
  }
  if (!started || !nearest) {
    bubble.hidden = true;
    updateTalkingFace(dialogSpeaker, time);
    return;
  }
  let speechPosition=nearest.root.position.clone().add(new THREE.Vector3(0,2.15,0));
  let speechText=nearest.dialogue;
  let speechOwner=nearest.root;
  if(playerGreetingActive&&avatar){
    speechOwner=avatar;
    speechPosition=avatar.position.clone().add(new THREE.Vector3(0,2.15,0));
    speechText='Em chào thầy ạ!';
  }else if(greetingStudent){
    speechOwner=greetingStudent.root;
    speechPosition=greetingStudent.root.position.clone().add(new THREE.Vector3(0,2.15,0));
    speechText='Em chào thầy ạ!';
  }
  const anchor = speechPosition.project(camera);
  const inView = Math.abs(anchor.x) < 1 && anchor.y > -1 && anchor.y < .95 && Math.abs(anchor.z) < 1;
  const showBubble = inView && !dialogSpeaker && !mobile && !activities.chilling;
  bubble.hidden = !showBubble;
  updateTalkingFace(dialogSpeaker || (showBubble ? speechOwner : null), time);
  if (showBubble) {
    if (bubble.textContent !== speechText) bubble.textContent = speechText;
    bubble.style.left = ((anchor.x * .5 + .5) * innerWidth) + 'px';
    bubble.style.top = ((.5 - anchor.y * .5) * innerHeight - 11) + 'px';
  }
}

function showToast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function setRoomStatus(message) {
  const status=$('#roomStatus');
  if(status) status.textContent=message;
}

function updateRoomCount() {
  const count=$('#onlineCount');
  if(count) count.textContent=String((roomJoined?1:0)+remotePlayers.size);
}

function roomPost(path,payload,signal) {
  return fetch(`${ROOM_API_ORIGIN}${path}`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal
  }).then(async response=>{
    const result=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(result.error||`Lỗi máy chủ (${response.status})`);
    return result;
  });
}

function appendRoomMessage(message, scrollToLatest = true) {
  const list=$('#chatMessages');
  if(!list) return;
  const item=document.createElement('article');
  const system=message.type==='system';
  item.className=`chat-message${system?' is-system':''}${message.id&&message.id===roomId?' is-own':''}`;
  if(system){
    item.textContent=message.text||'';
  }else{
    const meta=document.createElement('div');
    meta.className='chat-meta';
    const name=document.createElement('strong');
    name.textContent=message.name||'Học sinh';
    const className=document.createElement('span');
    className.textContent=message.className||'';
    const time=document.createElement('time');
    time.textContent=message.time||'';
    meta.append(name,className,time);
    const text=document.createElement('p');
    text.className='chat-text';
    text.textContent=message.text||'';
    item.append(meta,text);
  }
  list.append(item);
  while(list.children.length>70) list.firstElementChild.remove();
  if(scrollToLatest) list.scrollTop=list.scrollHeight;
}

function appendRoomMessages(messages) {
  if(!Array.isArray(messages)||!messages.length) return;
  for(const message of messages) appendRoomMessage(message,false);
  const list=$('#chatMessages');
  if(list) list.scrollTop=list.scrollHeight;
}

function setRemoteProp(root, kind) {
  if (root.userData.campusProp?.name === kind) return;
  root.userData.campusProp?.removeFromParent();
  root.userData.campusProp = null;
  if (!['tea', 'soda', 'snack', 'bouquet'].includes(kind)) return;
  const prop = kind === 'bouquet' ? createFlowerBouquet() : createCampusProp(kind);
  root.userData.arms[1].add(prop);
  root.userData.campusProp = prop;
}

function addRemotePlayer(data) {
  if(!data?.id||data.id===roomId) return null;
  const existing=remotePlayers.get(data.id);
  const incomingPosition=data.position||{};
  if(existing){
    existing.profile=data.profile||existing.profile;
    existing.target.set(Number(incomingPosition.x)||0,Number(incomingPosition.y)||0,Number(incomingPosition.z)||0);
    existing.targetYaw=Number(incomingPosition.yaw)||0;
    setRemoteProp(existing.root, incomingPosition.prop);
    existing.lastSeen=performance.now();
    existing.nameTag.textContent=avatarTag(existing.profile);
    return existing;
  }
  const remoteProfile=data.profile||{};
  const target=new THREE.Vector3(Number(incomingPosition.x)||0,Number(incomingPosition.y)||0,Number(incomingPosition.z)||0);
  const root=makeAvatar(remoteProfile.gender==='girl'?'girl':'boy',remoteProfile.outfit||{});
  root.position.copy(target);
  root.rotation.y=(Number(incomingPosition.yaw)||0)+Math.PI;
  root.userData.roomWalkPhase=Math.random()*Math.PI*2;
  setRemoteProp(root, incomingPosition.prop);
  scene.add(root);
  const nameTag=document.createElement('div');
  nameTag.className='npc-name-tag remote-player-tag';
  nameTag.textContent=avatarTag(remoteProfile);
  $('#npcLabels').append(nameTag);
  const remote={id:data.id,profile:remoteProfile,root,nameTag,target,targetYaw:Number(incomingPosition.yaw)||0,lastSeen:performance.now(),renderY:target.y,jumpStartedAt:0,jumpBaseY:target.y};
  remotePlayers.set(data.id,remote);
  updateRoomCount();
  return remote;
}

function removeRemotePlayer(id) {
  const remote=remotePlayers.get(id);
  if(!remote) return;
  scene.remove(remote.root);
  remote.nameTag.remove();
  remotePlayers.delete(id);
  updateRoomCount();
}

function handleRoomEvent(type,data) {
  if(type==='classroom-board'){
    activities.drawBoard(data.text || '');
  }else if(type==='player-joined'){
    if(addRemotePlayer(data)){
      appendRoomMessage({type:'system',text:`${data.profile?.name||'Một học sinh'} đã vào sân trường.`});
      setRoomStatus(`Đang tham quan · ${remotePlayers.size+1} người`);
    }
  }else if(type==='player-move'){
    const remote=remotePlayers.get(data.id);
    if(remote){
      remote.target.set(Number(data.position.x)||0,Number(data.position.y)||0,Number(data.position.z)||0);
      remote.targetYaw=Number(data.position.yaw)||0;
      setRemoteProp(remote.root, data.position.prop);
      remote.lastSeen=performance.now();
    }
  }else if(type==='player-action'){
    const remote=remotePlayers.get(data.id);
    if(remote&&data.action==='jump'){
      const position=data.position||{};
      remote.target.set(Number(position.x)||0,Number(position.y)||0,Number(position.z)||0);
      remote.targetYaw=Number(position.yaw)||0;
      remote.jumpBaseY=remote.target.y;
      const elapsedMs=Number.isFinite(data.serverTime)
        ? Math.max(0,Date.now()+roomServerClockOffsetMs-data.serverTime)
        : 0;
      remote.jumpStartedAt=performance.now()-elapsedMs;
      remote.lastSeen=performance.now();
    }
  }else if(type==='player-left'){
    const remote=remotePlayers.get(data.id);
    if(remote) appendRoomMessage({type:'system',text:`${remote.profile.name||'Một học sinh'} đã rời sân trường.`});
    removeRemotePlayer(data.id);
    setRoomStatus(roomJoined?`Đang tham quan · ${remotePlayers.size+1} người`:'Đang nối máy chủ…');
  }else if(type==='chat'){
    appendRoomMessage(data);
  }else if(type==='chat-batch'){
    appendRoomMessages(data);
  }
}

async function pollRoomEvents(generation) {
  while(generation===roomConnectionGeneration&&roomJoined&&roomId){
    const controller=new AbortController();
    roomPollController=controller;
    try{
      const result=await roomPost('/api/poll',{id:roomId},controller.signal);
      if(generation!==roomConnectionGeneration) return;
      for(const item of result.events||[]) handleRoomEvent(item.event,item.data);
    }catch(error){
      if(controller.signal.aborted||generation!==roomConnectionGeneration) return;
      setRoomStatus('Mạng chập chờn · đang kết nối lại…');
      await new Promise(resolve=>setTimeout(resolve,400));
    }finally{
      if(roomPollController===controller) roomPollController=null;
    }
  }
}

async function connectRoom() {
  roomConnectionGeneration++;
  const generation=roomConnectionGeneration;
  roomPollController?.abort();
  roomPollController=null;
  roomJoined=false;
  roomId='';
  setRoomStatus('Đang nối máy chủ…');
  try{
    const response=await fetch(`${ROOM_API_ORIGIN}/api/connect?room=nguyen-khuyen`,{cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error||`Lỗi máy chủ (${response.status})`);
    if(generation!==roomConnectionGeneration){roomPost('/api/leave',{id:data.id}).catch(()=>{});return;}
    roomId=data.id;
    activities.drawBoard(data.classroomBoard || '');
    if(Number.isFinite(data.serverTime)) roomServerClockOffsetMs=data.serverTime-Date.now();
    for(const remote of remotePlayers.values()){
      scene.remove(remote.root);
      remote.nameTag.remove();
    }
    remotePlayers.clear();
    for(const player of data.players||[]) addRemotePlayer(player);
    appendRoomMessages(data.messages||[]);
    await roomPost('/api/join',{
      id:roomId,
      profile:{name:profile.name,className:profile.className,year:profile.year,role:profile.role,gender:profile.gender,outfit:profile.outfit},
      position:{x:walker.x,y:walker.y,z:walker.z,yaw:walker.yaw,prop:avatar?.userData.flowerBouquet?.name || avatar?.userData.campusProp?.name || ''}
    });
    if(generation!==roomConnectionGeneration){roomPost('/api/leave',{id:roomId}).catch(()=>{});return;}
    roomJoined=true;
    roomSendClock=0;
    roomHeartbeatClock=0;
    lastRoomPosition={x:walker.x,y:walker.y,z:walker.z,yaw:walker.yaw};
    updateRoomCount();
    setRoomStatus(`Đang tham quan · ${remotePlayers.size+1} người`);
    appendRoomMessage({type:'system',text:'Bạn đã vào phòng tham quan trường Nguyễn Khuyến.'});
    pollRoomEvents(generation);
  }catch(error){
    if(generation!==roomConnectionGeneration) return;
    setRoomStatus('Chưa nối được máy chủ · chạy node server.js');
    console.warn('Không vào được phòng nhiều người:',error);
  }
}

function updateRoomNetwork(dt) {
  if(!started||!roomJoined||!roomId) return;
  roomSendClock+=dt;
  roomHeartbeatClock+=dt;
  const current={x:walker.x,y:walker.y,z:walker.z,yaw:walker.yaw,prop:avatar?.userData.flowerBouquet?.name || avatar?.userData.campusProp?.name || ''};
  const changed=!lastRoomPosition
    ||Math.hypot(current.x-lastRoomPosition.x,current.y-lastRoomPosition.y,current.z-lastRoomPosition.z)>0.06
    ||Math.abs(current.yaw-lastRoomPosition.yaw)>0.035
    ||current.prop!==lastRoomPosition.prop;
  if(changed&&roomSendClock>0.12){
    roomSendClock=0;
    roomHeartbeatClock=0;
    lastRoomPosition=current;
    roomPost('/api/move',{id:roomId,position:current}).catch(()=>{});
  }else if(roomHeartbeatClock>8){
    roomHeartbeatClock=0;
    roomPost('/api/heartbeat',{id:roomId}).catch(()=>{});
  }
}

function updateRemotePlayers(dt,time) {
  const alpha=1-Math.exp(-dt*16);
  for(const remote of remotePlayers.values()){
    remote.root.position.x=THREE.MathUtils.lerp(remote.root.position.x, remote.target.x, alpha);
    remote.root.position.z=THREE.MathUtils.lerp(remote.root.position.z, remote.target.z, alpha);
    remote.renderY+=(remote.target.y-remote.renderY)*alpha;
    let jumpOffset=0;
    if(remote.jumpStartedAt){
      const elapsed=(performance.now()-remote.jumpStartedAt)/1000;
      if(elapsed<0.72){
        const predictedHeight=Math.max(0,6.1*elapsed-8.75*elapsed*elapsed);
        const receivedHeight=Math.max(0,remote.target.y-remote.jumpBaseY);
        jumpOffset=Math.max(0,predictedHeight-receivedHeight);
      }else remote.jumpStartedAt=0;
    }
    remote.root.position.y=remote.renderY+jumpOffset;
    const targetAngle=remote.targetYaw+Math.PI;
    const angleDelta=Math.atan2(Math.sin(targetAngle-remote.root.rotation.y),Math.cos(targetAngle-remote.root.rotation.y));
    remote.root.rotation.y+=angleDelta*alpha;
    const moving=remote.root.position.distanceToSquared(remote.target)>0.015;
    remote.root.userData.roomWalkPhase+=dt*(moving?8:0);
    const swing=moving?Math.sin(remote.root.userData.roomWalkPhase)*0.42:0;
    remote.root.userData.legs[0].rotation.x=swing;
    remote.root.userData.legs[1].rotation.x=-swing;
    if(remote.root.userData.arms){
      remote.root.userData.arms[0].rotation.x=-swing*0.6;
      remote.root.userData.arms[1].rotation.x=swing*0.6;
    }
    const anchor=projectedLabel.copy(remote.root.position).setY(remote.root.position.y + 2.12).project(camera);
    const onScreen=anchor.z>-1&&anchor.z<1&&anchor.x>-1.15&&anchor.x<1.15&&anchor.y>-1.1&&anchor.y<1.1;
    remote.nameTag.hidden=!started||!onScreen;
    if(onScreen){
      remote.nameTag.style.left=`${(anchor.x*0.5+0.5)*innerWidth}px`;
      remote.nameTag.style.top=`${(-anchor.y*0.5+0.5)*innerHeight}px`;
    }
  }
}

function disconnectRoom() {
  const leavingId=roomId;
  roomConnectionGeneration++;
  roomPollController?.abort();
  roomPollController=null;
  roomId='';
  roomJoined=false;
  lastRoomPosition=null;
  for(const id of [...remotePlayers.keys()]) removeRemotePlayer(id);
  updateRoomCount();
  setRoomStatus('Đã rời phòng');
  if(leavingId) roomPost('/api/leave',{id:leavingId}).catch(()=>{});
}

$('#chatToggle').addEventListener('click',()=>{
  const panel=$('#chatPanel');
  panel.hidden=!panel.hidden;
  $('#chatToggle').setAttribute('aria-expanded',String(!panel.hidden));
  if(!panel.hidden) $('#chatInput').focus();
});
$('#chatClose').addEventListener('click',()=>{
  $('#chatPanel').hidden=true;
  $('#chatToggle').setAttribute('aria-expanded','false');
});
$('#chatForm').addEventListener('submit',event=>{
  event.preventDefault();
  const input=$('#chatInput');
  const text=input.value.trim();
  if(!text) return;
  if(!roomJoined||!roomId){
    appendRoomMessage({type:'system',text:'Chưa kết nối phòng. Hãy chạy node server.js trong thư mục dự án.'});
    return;
  }
  input.value='';
  roomPost('/api/chat',{id:roomId,text}).catch(()=>appendRoomMessage({type:'system',text:'Gửi tin nhắn chưa thành công, thử lại nhé.'}));
});

function readUniformChoice() {
  return {
    shirt: $('#shirt').value,
    tucked: $('#tucked').value,
    pants: $('#pants').value,
    bag: $('#bag').value,
    footwear: $('#footwear').value
  };
}

function uniformViolations(outfit) {
  const violations = [];
  if (outfit.shirt !== 'white') violations.push('áo sơ mi phải màu trắng');
  if (outfit.tucked !== 'yes') violations.push('áo phải được sơ vin');
  if (outfit.pants !== 'black' && !($('#gender').value === 'girl' && ['skirt', 'aodai'].includes(outfit.pants))) violations.push('chọn quần đen hoặc đồng phục nữ được duyệt');
  if (outfit.bag !== 'crossbody') violations.push('phải đeo cặp chéo');
  if (outfit.footwear !== 'strap') violations.push('phải đi dép quai hậu');
  return violations;
}

function updateUniformPreview() {
  const outfit = readUniformChoice();
  const violations = uniformViolations(outfit);
  const preview = $('#uniformPreview');
  preview.classList.toggle('is-invalid', violations.length > 0);
  $('#uniformPreviewTitle').textContent = violations.length ? 'Chưa đúng đồng phục' : 'Đồng phục tiêu chuẩn';
  $('#uniformPreviewCaption').textContent = violations.length
    ? `Cần sửa: ${violations.join(' · ')}`
    : 'Sơ mi trắng · sơ vin · quần đen · cặp chéo · dép quai hậu';
  $('#previewShirt').style.fill = outfit.shirt === 'white' ? '#fffdf6' : '#70b9df';
  $('#previewArms').style.stroke = outfit.shirt === 'white' ? '#fffdf6' : '#70b9df';
  $('#previewPants').style.fill = outfit.pants === 'blue' ? '#49688d' : '#171717';
  for (const option of document.querySelectorAll('#pants [data-girl]')) option.hidden = $('#gender').value !== 'girl';
  $('#previewShirt').setAttribute('d', outfit.tucked === 'no'
    ? 'M77 61h34l13 10-8 19-7-4v38H76V86l-7 4-8-19Z'
    : 'M77 61h34l13 10-8 19-7-4v25H76V86l-7 4-8-19Z');
  $('#previewUntuckedHem').setAttribute('d', outfit.tucked === 'no' ? 'M76 122h33' : 'M76 109h33');
  $('#previewBagCrossbody').setAttribute('display', outfit.bag === 'crossbody' ? 'inline' : 'none');
  $('#previewBagBackpack').setAttribute('display', outfit.bag === 'backpack' ? 'inline' : 'none');
  $('#previewShoesStrap').setAttribute('display', outfit.footwear === 'strap' ? 'inline' : 'none');
  $('#previewShoesSlides').setAttribute('display', outfit.footwear === 'slides' ? 'inline' : 'none');
  $('#previewGirlHair').setAttribute('display', $('#gender').value === 'girl' ? 'inline' : 'none');
}

function setProfile(p) {
  profile = p;
  localStorage.setItem('nguyen-khuyen-student', JSON.stringify(p));
  $('#studentName').textContent = p.name;
  $('#studentClass').textContent = `${p.role === 'alumni' ? 'Cựu học sinh' : 'Học sinh'} · Lớp ${p.className} · Niên khóa ${p.year}–${+p.year+3}`;
  if (avatar) {
    scene.remove(avatar);
    avatar = makeAvatar(p.gender, p.outfit);
    scene.add(avatar);
  }
}

function loadSavedProfile() {
  try {
    const p = JSON.parse(localStorage.getItem('nguyen-khuyen-student'));
    if (!p) return;
    $('#name').value = p.name || '';
    $('#className').value = p.className || '';
    $('#year').value = p.year || '';
    $('#gender').value = p.gender || 'boy';
    $('#visitorRole').value = p.role === 'alumni' ? 'alumni' : 'student';
    const outfit = p.outfit || {};
    $('#shirt').value = outfit.shirt || 'white';
    $('#tucked').value = outfit.tucked || 'yes';
    $('#pants').value = outfit.pants || 'black';
    $('#bag').value = outfit.bag || 'crossbody';
    $('#footwear').value = outfit.footwear || 'strap';
  } catch { /* ignore invalid local profile */ }
}

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
dracoLoader.setWorkerLimit(mobile ? 1 : 2);
const campusLoader = new GLTFLoader().setDRACOLoader(dracoLoader);
campusLoader.load(
  CAMPUS_MODEL_URL,
  gltf => {
    const campus = gltf.scene;
    campus.name = 'KhuonVien_THPT_Nguyen_Khuyen';
    // The export includes reusable Blender prototypes at the world origin.
    // Keep the placed instances and remove only the prototype objects.
    for (const child of [...campus.children]) {
      if (child.name.startsWith('SRC_')) child.removeFromParent();
    }
    campus.traverse(obj => {
      if (!obj.isMesh) return;
      obj.frustumCulled = true;
      obj.castShadow = false;
      obj.receiveShadow = !obj.material?.transparent;
      if (obj.name.startsWith('COLLISION_')) obj.userData.collision = true;
    });
    scene.add(campus);
    buildCampusColliders(campus);
    createCampusLampLights(campus);
    collectTreeShadowAnchors(campus);
    morningBeams = createMorningSunbeams(scenesOfDay[0].direction, mobile);
    morningStructureShadows = createMorningStructureShadows(campus);
    scene.add(morningBeams);
    if (morningStructureShadows) scene.add(morningStructureShadows);
    applyDayLighting();
    activities.init(campus);
    addTeachersDayBanner(campus, scene, mobile);
    traffic.init(campus);
    createGateHorse(campus);
    instanceCampusProps(campus);
    batchCampusMeshes(campus);
    dracoLoader.dispose();
    createCampusNpcs();
    createFountainEffect(campus);
    const startSurface = findWalkSurface(walker.x, walker.z, walker.y);
    if (startSurface !== null) walker.y = startSurface;
    campusLoaded = true;
    $('#loading').hidden = true;
    $('#startBtn').disabled = uniformViolations(readUniformChoice()).length > 0;
  },
  event => {
    if (event.total) $('#loadPct').textContent = ` ${Math.round(event.loaded/event.total*100)}%`;
  },
  error => {
    console.error(error);
    $('#loading').textContent = 'Không tải được GLB. Hãy giữ thư mục assets cạnh index.html.';
    $('#formError').textContent = `Kiểm tra file ${CAMPUS_MODEL_URL.slice(2)}.`;
    $('#formError').hidden = false;
  }
);

loadSavedProfile();
updateUniformPreview();
$('#startBtn').disabled = true;

$('#secretMode').addEventListener('change', () => {
  $('#secretHint').hidden = $('#secretMode').value !== 'yes';
});
$('#profileForm').addEventListener('pointerdown', () => sound.unlock(), { once: true });
$('#profileForm').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#name').value.trim().replace(/\s+/g,' ').toLocaleLowerCase('vi').replace(/(^|[ -])(\p{L})/gu, (_, gap, letter) => gap + letter.toLocaleUpperCase('vi'));
  const className = $('#className').value.trim().toUpperCase();
  const year = $('#year').value.trim();
  const error = $('#formError');
  error.hidden = true;
  if (name.length < 2) {
    error.textContent = 'Nhập họ và tên của bạn.';
    error.hidden = false;
    return;
  }
  if (!/^\d{1,2}[A-D]\d{1,2}$/.test(className)) {
    error.textContent = 'Tên lớp cần theo dạng như 12A1.';
    error.hidden = false;
    return;
  }
  if (!/^\d{4}$/.test(year) || +year < 1961 || +year > 2100) {
    error.textContent = 'Nhập năm bắt đầu niên khóa gồm 4 chữ số.';
    error.hidden = false;
    return;
  }
  const outfit = readUniformChoice();
  const violations = uniformViolations(outfit);
  if (violations.length) {
    error.textContent = `Vi phạm 1 trong 10 quy tắc ứng xử của học sinh Nguyễn Khuyến: ${violations.join(', ')}. Chỉnh về đúng đồng phục tiêu chuẩn để được vào trường.`;
    error.hidden = false;
    warnUniform();
    return;
  }
  if (!campusLoaded) {
    error.textContent = 'Mô hình trường đang tải, đợi một chút rồi thử lại.';
    error.hidden = false;
    return;
  }
  if(!roomSpawnOffsetApplied){
    const angle=Math.random()*Math.PI*2;
    const radius=0.35+Math.random()*0.9;
    walker.x+=Math.cos(angle)*radius;
    walker.z+=Math.sin(angle)*radius;
    const spawnSurface=findWalkSurface(walker.x,walker.z,walker.y);
    if(spawnSurface!==null) walker.y=spawnSurface;
    roomSpawnOffsetApplied=true;
  }
  setProfile({ role:$('#visitorRole').value, name, className, year, gender:$('#gender').value, outfit, secret: $('#secretMode').value === 'yes' });
  playerWasNearPrincipal=false;
  playerGreetingStart=null;
  if (!avatar) {
    avatar = makeAvatar(profile.gender, profile.outfit);
    scene.add(avatar);
  }
  started = true;
  activities.flowersProfileChanged(profile);
  activities.secretProfileChanged(profile);
  sound.start();
  $('#intro').hidden = true;
  $('#hud').hidden = false;
  $('#help').hidden = false;
  $('#mobileMoveZone').hidden = !mobile;
  $('#campusJump').hidden = !mobile;
  $('#mobileMenu').hidden = !mobile;
  document.body.classList.add('campus-started');
  avatar.position.set(walker.x, walker.y, walker.z);
  campusMap.start();
  $('#chatToggle').hidden=false;
  showToast(`Chào mừng ${name} đến với trường Nguyễn Khuyến!`);
  connectRoom();
  renderer.domElement.focus();
});

for (const id of ['shirt','tucked','pants','bag','footwear','gender']) {
  $(`#${id}`).addEventListener('change', () => {
    if (id === 'gender' && $('#gender').value === 'boy' && ['skirt', 'aodai'].includes($('#pants').value)) $('#pants').value = 'black';
    updateUniformPreview();
    const violations = uniformViolations(readUniformChoice());
    const error = $('#formError');
    error.hidden = !violations.length;
    error.textContent = violations.length ? 'Chỉnh đồng phục trước khi vào trường: ' + violations.join(', ') + '.' : '';
    $('#startBtn').disabled = !campusLoaded || violations.length > 0;
    if (violations.length) warnUniform();
  });
}

$('#mapBtn').addEventListener('click', () => campusMap.toggle());
$('#editBtn').addEventListener('click', () => {
  keys.clear();
  started = false;
  campusMap.stop();
  activities.horseDialogue.reset();
  activities.leaveSeat();
  playerWasNearPrincipal=false;
  playerGreetingStart=null;
  disconnectRoom();
  sound.stop();
  $('#intro').hidden = false;
  $('#help').hidden = true;
  $('#mobileMoveZone').hidden = true;
  $('#campusJump').hidden = true;
  $('#mobileMenu').hidden = true;
  document.body.classList.remove('campus-started');
  moveStick.set(0, 0);
  $('#hud').hidden = true;
});

window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.code === 'KeyM' && started && !event.repeat) {
    event.preventDefault();
    campusMap.toggle();
    return;
  }
  if (campusMap.blocking || (started && activities.handleKey(event))) return;
  if (event.code === 'Space') {
    if (!started) return;
    event.preventDefault();
    if (!event.repeat) jumpPlayer();
    return;
  }
  if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','ShiftLeft','ShiftRight'].includes(event.code)) {
    keys.add(event.code);
    event.preventDefault();
  }
});
const jumpButton = $('#campusJump');
jumpButton.addEventListener('touchstart', event => {
  event.preventDefault();
  jumpPlayer();
}, { passive: false });
jumpButton.addEventListener('click', jumpPlayer);
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => { keys.clear(); moveStick.set(0, 0); });

renderer.domElement.addEventListener('pointerdown', event => {
  if (!started || campusMap.blocking || activities.blocksMovement || event.button !== 0 || drag) return;
  drag = true;
  pointerMoved = false;
  lookingPointer = event.pointerId;
  pointerOrigin = lastPointer = { x:event.clientX, y:event.clientY };
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener('pointermove', event => {
  if (!drag || !lastPointer || event.pointerId !== lookingPointer) return;
  if (!pointerMoved && Math.hypot(event.clientX - pointerOrigin.x, event.clientY - pointerOrigin.y) < 6) return;
  pointerMoved = true;
  const dx = event.clientX - lastPointer.x;
  const dy = event.clientY - lastPointer.y;
  walker.yaw -= dx * 0.005;
  cameraLift = THREE.MathUtils.clamp(cameraLift + dy * 0.015, 1.6, 6.2);
  lastPointer = { x:event.clientX, y:event.clientY };
});
const releasePointer = event => {
  if (event.pointerId !== lookingPointer) return;
  drag = false; lastPointer = null; lookingPointer = null;
};

function resetPlayerInput() {
  keys.clear();
  moveStick.set(0, 0);
  if (lookingPointer !== null && renderer.domElement.hasPointerCapture(lookingPointer)) {
    renderer.domElement.releasePointerCapture(lookingPointer);
  }
  drag = false;
  lastPointer = null;
  lookingPointer = null;
}
renderer.domElement.addEventListener('pointerup', event => {
  if (drag && !pointerMoved && event.pointerId === lookingPointer) activities.click(event.clientX, event.clientY);
  releasePointer(event);
});
renderer.domElement.addEventListener('pointercancel', releasePointer);
renderer.domElement.addEventListener('wheel', event => {
  if (activities.horseDialogue.modalOpen) return;
  cameraDistance = THREE.MathUtils.clamp(cameraDistance + Math.sign(event.deltaY)*0.7, 4.5, 13);
}, { passive:true });

if (mobile && window.nipplejs) {
  const joystick = window.nipplejs.create({
    zone: $('#mobileMoveZone'), mode: 'dynamic', color: '#fff1cd', size: 88, threshold: 0.08
  });
  joystick.on('move', (_event, input) => {
    if (!activities.horseDialogue.modalOpen) moveStick.set(input.vector.x, input.vector.y);
  });
  joystick.on('end', () => moveStick.set(0, 0));
}
const menuToggle = $('#mobileMenuToggle');
const menuItems = $('#mobileMenuItems');
$('#musicMenu').addEventListener('click', () => activities.openAudio());
function closeMobileMenu() {
  menuItems.hidden = true;
  menuToggle.setAttribute('aria-expanded', 'false');
}
menuToggle.addEventListener('click', () => {
  const opening = menuItems.hidden;
  menuItems.hidden = !opening;
  menuToggle.setAttribute('aria-expanded', String(opening));
});
menuItems.addEventListener('click', event => {
  const button = event.target.closest('button[data-menu]');
  if (!button) return;
  closeMobileMenu();
  keys.clear();
  moveStick.set(0, 0);
  if (button.dataset.menu === 'travel') activities.openTravel();
  if (button.dataset.menu === 'progress') activities.openProgress();
  if (button.dataset.menu === 'chat') $('#chatToggle').click();
  if (button.dataset.menu === 'music') {
    activities.openAudio();
  }
});

function movePlayer(dt, time) {
  if (!started || !avatar || campusMap.blocking || activities.blocksMovement) return;
  if (!walker.onGround) {
    walker.y += walker.velocityY * dt;
    walker.velocityY -= 17.5 * dt;
  }
  let forwardInput = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  let sideInput = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  forwardInput += moveStick.y;
  sideInput += moveStick.x;
  const greeting = playerGreetingStart!==null && time-playerGreetingStart<1.8;
  const moving = !greeting && Math.hypot(forwardInput,sideInput) > 0;
  const running = keys.has('ShiftLeft') || keys.has('ShiftRight');
  if (moving) {
    const mag = Math.max(1, Math.hypot(forwardInput,sideInput));
    forwardInput /= mag;
    sideInput /= mag;
    const speed = running ? 8.2 : walker.speed;
    const fx = -Math.sin(walker.yaw), fz = -Math.cos(walker.yaw);
    const rx = Math.cos(walker.yaw), rz = -Math.sin(walker.yaw);
    const dx = (fx*forwardInput + rx*sideInput)*speed*dt;
    const dz = (fz*forwardInput + rz*sideInput)*speed*dt;
    const wasOutsideGate = walker.z >= -3.2;
    const fromX = walker.x;
    const fromZ = walker.z;
    moveWithCollision(dx, dz);
    if (walker.onGround) {
      stepDistance += Math.hypot(walker.x - fromX, walker.z - fromZ);
      if (stepDistance >= (running ? 1.35 : .86)) {
        stepDistance = 0;
        sound.effect('step');
      }
    }
    if (!introducedByGuard && wasOutsideGate && walker.z < -3.2 && walker.x > 3 && walker.x < 12 && walker.y < 2) {
      introducedByGuard = true;
      activities.talk('guard');
    }
  }

  const walkSurface = activities.insideClassroom ? activities.floorY() : findWalkSurface(walker.x, walker.z, walker.y);
  if (walkSurface !== null) {
    if (walker.onGround) {
      walker.y = walkSurface;
    } else if (walker.velocityY <= 0 && walker.y <= walkSurface + 0.06) {
      walker.y = walkSurface;
      walker.velocityY = 0;
      walker.onGround = true;
    }
  } else if (walker.onGround) {
    walker.velocityY = 0;
    walker.onGround = false;
  }

  avatar.position.set(walker.x,walker.y,walker.z);
  avatar.rotation.y = walker.yaw + Math.PI;
  const swing = moving ? Math.sin(time* (running ? 11 : 8)) * 0.48 : 0;
  const legSwing = walker.onGround ? swing : 0.35;
  avatar.userData.legs[0].rotation.x = legSwing;
  avatar.userData.legs[1].rotation.x = -legSwing;
  avatar.userData.knees.forEach(knee => { knee.rotation.x = 0; });
  if (avatar.userData.arms) {
    const armSwing = walker.onGround ? swing * 0.62 : 0.12;
    avatar.userData.arms[0].rotation.x = -armSwing;
    avatar.userData.arms[1].rotation.x = armSwing;
  }
  if (activities.insideClassroom) {
    activities.positionClassroomCamera(cameraForward.set(-Math.sin(walker.yaw), 0, -Math.cos(walker.yaw)));
    return;
  }
  positionOutdoorView();
}

function positionOutdoorView() {
  const f = cameraForward.set(-Math.sin(walker.yaw), 0, -Math.cos(walker.yaw));
  camera.position.set(walker.x - f.x * cameraDistance, cameraLift + walker.y, walker.z - f.z * cameraDistance);
  camera.lookAt(walker.x, 1.12 + walker.y, walker.z);
}

const clock = new THREE.Clock();
function animateClouds(time) {
  for (const cloud of cloudClusters) {
    const base = cloud.group.userData.basePosition;
    const phase = cloud.group.userData.phase;
    cloud.group.position.x = base.x + Math.sin(time * 0.012 + phase) * 2.5;
    cloud.group.position.z = base.z + Math.cos(time * 0.009 + phase) * 1.8;
  }
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(),0.05);
  movePlayer(dt,clock.elapsedTime);
  if (started && clock.elapsedTime >= nextAmbience) {
    nextAmbience = clock.elapsedTime + .20;
    sound.applyAmbience();
  }
  animateClouds(clock.elapsedTime);
  activities.update(dt, clock.elapsedTime, started);
  animateDayLighting();
  traffic.update(dt, currentDay.night, started);
  if (!dayBlend && currentDay.night > .002) updateNightLights();
  animateFountain(clock.elapsedTime);
  const checkNameTags = clock.elapsedTime >= nextNameTagCheck;
  if (checkNameTags) nextNameTagCheck = clock.elapsedTime + .2;
  updateGateHorse(dt, clock.elapsedTime, checkNameTags);
  updateCampusNpcs(clock.elapsedTime, dt, checkNameTags);
  updateRoomNetwork(dt);
  updateRemotePlayers(dt,clock.elapsedTime);
  updateCampusShadows(clock.elapsedTime);
  renderer.render(scene,camera);
});

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, maxPixelRatio));
  renderer.setSize(innerWidth,innerHeight);
});
