import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const $ = selector => document.querySelector(selector);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9d9ef');
scene.fog = new THREE.Fog('#a9d9ef', 180, 520);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 900);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.8));
renderer.setSize(innerWidth, innerHeight);
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

const hemisphereLight = new THREE.HemisphereLight(0xfff1d8, 0x98734f, 1.65);
scene.add(hemisphereLight);
const sun = new THREE.DirectionalLight(0xffd99a, 0.0);
sun.position.set(-70, 120, 60);
scene.add(sun);
const moonLight = new THREE.DirectionalLight(0xc5d5ff, 0);
scene.add(moonLight);

// Atmospheric sky dome, a visible sun, and soft procedural cloud clusters.
const skyDome = new Sky();
skyDome.scale.setScalar(850);
skyDome.renderOrder = -10;
skyDome.material.depthWrite = false;
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
  gradient.addColorStop(0, 'rgba(255,255,235,1)');
  gradient.addColorStop(0.12, 'rgba(255,239,190,.95)');
  gradient.addColorStop(0.36, 'rgba(255,195,110,.35)');
  gradient.addColorStop(1, 'rgba(255,170,90,0)');
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
const sunDisk = new THREE.Sprite(new THREE.SpriteMaterial({
  color: 0xfff0c4, map: makeSunGlowTexture(), transparent: true,
  depthWrite: false, fog: false, toneMapped: false
}));
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
const campusLampLights=[];
const glowingLampMaterials=[];
let incenseSmokeParticles=[];
let incenseEmbers=[];
let incenseSteadySmoke=[];

const cloudClusters = [];
const cloudGeometry = new THREE.SphereGeometry(1, 12, 8);
let cloudSeed = 7519;
function cloudRandom() {
  cloudSeed = (cloudSeed * 16807) % 2147483647;
  return (cloudSeed - 1) / 2147483646;
}
for (let i = 0; i < 36; i++) {
  const group = new THREE.Group();
  const materials = [];
  const centerX = -160 + cloudRandom() * 320;
  const centerZ = -150 + cloudRandom() * 235;
  const height = 42 + cloudRandom() * 32;
  group.position.set(centerX, height, centerZ);
  group.userData.basePosition = group.position.clone();
  group.userData.phase = cloudRandom() * Math.PI * 2;
  const puffCount = 5 + Math.floor(cloudRandom() * 4);
  for (let j = 0; j < puffCount; j++) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xf5f7f8, transparent: true, opacity: 0.7,
      depthWrite: false, fog: false, toneMapped: false
    });
    const puff = new THREE.Mesh(cloudGeometry, material);
    const spread = j === 0 ? 0 : (cloudRandom() - 0.5) * 18;
    puff.position.set(spread, (j === 0 ? 0 : cloudRandom() * 3), (cloudRandom() - 0.5) * 8);
    puff.scale.set(8 + cloudRandom() * 7, 2.8 + cloudRandom() * 2.2, 5 + cloudRandom() * 5);
    group.add(puff);
    materials.push(material);
  }
  group.visible = false;
  group.renderOrder = -2;
  scene.add(group);
  cloudClusters.push({ group, materials, index: i });
}

// Lighting follows the real local sun over THPT Nguyen Khuyen, Hai Phong.
// Current weather comes from Open-Meteo; if it is unavailable, local-time
// lighting continues to work without an API key.
const SCHOOL_WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=20.69795&longitude=106.46866&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m&timezone=Asia%2FHo_Chi_Minh';
const SCHOOL_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const environmentStatus = $('#environmentStatus');
const environment = { cloudCover: 0, weatherCode: 0, temperature: null, rain: 0, updatedAt: null, unavailable: false };

const timeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: SCHOOL_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
const datePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SCHOOL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});

function smoothstep(a, b, value) {
  const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function solarPosition(now = new Date()) {
  const parts = Object.fromEntries(datePartsFormatter.formatToParts(now)
    .filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  const localDate = Date.UTC(parts.year, parts.month - 1, parts.day);
  const dayOfYear = Math.floor((localDate - Date.UTC(parts.year, 0, 0)) / 86400000);
  const hour = parts.hour + parts.minute / 60 + parts.second / 3600;
  const gamma = 2 * Math.PI / 365 * (dayOfYear - 1 + (hour - 12) / 24);
  const equationOfTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma)
    - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma)
    - 0.040849 * Math.sin(2 * gamma));
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const latitude = THREE.MathUtils.degToRad(20.69795);
  const longitude = 106.46866;
  const utcOffsetHours = 7;
  const solarMinutes = hour * 60 + equationOfTime + 4 * longitude - 60 * utcOffsetHours;
  const hourAngle = THREE.MathUtils.degToRad(solarMinutes / 4 - 180);
  const sinElevation = Math.sin(latitude) * Math.sin(declination)
    + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  const elevation = Math.asin(THREE.MathUtils.clamp(sinElevation, -1, 1));
  const azimuth = (Math.atan2(Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(declination) * Math.cos(latitude))
    + Math.PI + Math.PI * 2) % (Math.PI * 2);
  return { elevation, azimuth };
}

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

function updateEnvironmentLighting() {
  const { elevation, azimuth } = solarPosition();
  const altitude = THREE.MathUtils.radToDeg(elevation);
  const localParts=Object.fromEntries(datePartsFormatter.formatToParts(new Date())
    .filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));
  const localMinutes=localParts.hour*60+localParts.minute;
  const schoolNight=localMinutes>=17*60+30||localMinutes<6*60;
  const daylight=Math.min(smoothstep(5*60+30,7*60,localMinutes),1-smoothstep(16*60+30,17*60+30,localMinutes));
  const clouds = THREE.MathUtils.clamp(environment.cloudCover / 100, 0, 1);
  const rain = environment.rain > 0 || [51,53,55,61,63,65,80,81,82,95,96,99].includes(environment.weatherCode);
  const cloudDim = 1 - clouds * 0.42 - (rain ? 0.08 : 0);
  const horizontal = Math.cos(elevation);
  sunDirection.set(Math.sin(azimuth) * horizontal, Math.sin(elevation), -Math.cos(azimuth) * horizontal).normalize();
  const visibleSunDirection=sunDirection.clone();
  if(!schoolNight&&visibleSunDirection.y<0.025){visibleSunDirection.y=0.025;visibleSunDirection.normalize();}
  sun.position.copy(visibleSunDirection).multiplyScalar(120);
  skyDome.material.uniforms.sunPosition.value.copy(visibleSunDirection).multiplyScalar(500);
  sunDisk.position.copy(visibleSunDirection).multiplyScalar(500);
  sunCore.position.copy(sunDisk.position);
  const sunVisibility=schoolNight?0:THREE.MathUtils.clamp(0.72+daylight*0.28,0,1);
  sunDisk.visible=!schoolNight;
  sunCore.visible=!schoolNight;
  // Keep the solar disk legible through thin clouds while still softening it in rain.
  sunDisk.material.opacity = sunVisibility * (1 - clouds * 0.38);
  sunCore.material.opacity = sunVisibility * (1 - clouds * 0.32);
  sun.intensity=schoolNight?0:(0.38+daylight*1.25)*Math.max(0.42,cloudDim);
  sun.color.set(altitude<12?0xffffc4:0xffe3b5);

  const moonDirection=sunDirection.clone().negate();
  if(schoolNight&&moonDirection.y<0.06){moonDirection.y=0.06;moonDirection.normalize();}
  moonLight.position.copy(moonDirection).multiplyScalar(120);
  moonDisk.position.copy(moonDirection).multiplyScalar(500);
  moonCore.position.copy(moonDisk.position);
  moonDisk.visible=schoolNight;
  moonCore.visible=schoolNight;
  moonDisk.material.opacity=schoolNight?0.9:0;
  moonCore.material.opacity=schoolNight?0.96:0;
  moonLight.intensity=schoolNight?0.42:0;

  hemisphereLight.intensity=schoolNight?1.08:1.22+daylight*0.28-clouds*0.12;
  hemisphereLight.color.set(schoolNight?0xc8d2f0:0xfff2de);
  hemisphereLight.groundColor.set(schoolNight?0x777c91:(rain?0x94806b:0xad8860));
  renderer.toneMappingExposure=schoolNight?1.08:1.03+daylight*0.18;
  for(const light of campusLampLights) light.intensity=schoolNight?light.userData.nightIntensity:0;
  for(const material of glowingLampMaterials) material.emissiveIntensity=schoolNight?0.85:0;

  const nightSky = new THREE.Color(rain ? '#293340' : '#182541');
  const dawnSky = new THREE.Color('#f4bd98');
  const daySky = new THREE.Color(rain ? '#b9d9e6' : '#83cdf4');
  const sky=schoolNight?nightSky.clone():daySky.clone();
  if(!schoolNight&&localMinutes<7*60) sky.lerp(dawnSky,1-smoothstep(6*60,7*60,localMinutes));
  if(!schoolNight&&localMinutes>=16*60+30) sky.lerp(nightSky,smoothstep(16*60+30,17*60+30,localMinutes));
  if (schoolNight && clouds > 0) sky.lerp(new THREE.Color(rain ? '#222c3d' : '#202b43'), clouds * 0.16);
  else if (clouds > 0) sky.lerp(new THREE.Color(rain ? '#d0dfe1' : '#e6f2f4'), clouds * (0.18 + daylight * 0.2));
  // The procedural daytime dome otherwise stays visible over scene.background at night.
  skyDome.visible=!schoolNight;
  scene.background.copy(sky);
  scene.fog.color.copy(sky);

  const coverage = THREE.MathUtils.clamp((clouds - 0.04) / 0.96, 0, 1);
  const visibleCloudCount = Math.round(coverage * cloudClusters.length);
  const cloudColor = new THREE.Color(schoolNight ? '#748099' : (rain ? '#d4dfdf' : '#fff8eb'));
  for (const cloud of cloudClusters) {
    cloud.group.visible = cloud.index < visibleCloudCount;
    const opacity = (0.24 + coverage * 0.44) * (schoolNight ? 0.34 : 1);
    for (const material of cloud.materials) {
      material.color.copy(cloudColor);
      material.opacity = opacity;
    }
  }

  if (environmentStatus) {
    const time = timeFormatter.format(new Date());
    const weather = environment.temperature === null
      ? (environment.unavailable ? 'chưa có dữ liệu thời tiết' : 'đang tải thời tiết')
      : `${weatherLabel(environment.weatherCode)} · ${Math.round(environment.temperature)}°C`;
    environmentStatus.textContent = `🕒 ${time} · ${weather}`;
    environmentStatus.title = environment.updatedAt
      ? `Thời tiết cập nhật ${timeFormatter.format(environment.updatedAt)} · Hải Phòng`
      : 'Giờ địa phương Hải Phòng · đang lấy thời tiết hiện tại';
  }
}

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
    if (environmentStatus) environmentStatus.title = 'Không kết nối được dịch vụ thời tiết; ánh sáng vẫn chạy theo giờ địa phương.';
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
const campusMusicTracks = [
  new Audio(new URL('./assets/Minh-Cung-Nhau-Dong-Bang-Thuy-Chi.mp3', import.meta.url)),
  new Audio(new URL('./assets/Xe Đạp Cover.mp3', import.meta.url))
];
campusMusicTracks.forEach(track => {
  track.preload = 'metadata';
  track.volume = 0;
});
let campusMusicIndex = 0;
let campusMusicStarted = false;
let campusMusicPlayPending = false;
let campusMusicBlocked = false;
let roomServerClockOffsetMs = 0;
let sharedMusicStartedAt = null;
let nextCampusMusicSyncAt = 0;
let grandstandSoundPoint = null;
const GRANDSTAND_MUSIC_FULL_VOLUME_DISTANCE = 6;
const GRANDSTAND_MUSIC_SILENT_DISTANCE = 82;
const GRANDSTAND_MUSIC_MAX_VOLUME = 0.62;
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
let cameraDistance = 7.5;
let cameraLift = 3.2;
let toastTimer = 0;
let profile = null;
let playerWasNearPrincipal = false;
let playerGreetingStart = null;
const ROOM_API_ORIGIN = location.protocol==='https:'
  ? location.origin
  : `${location.protocol}//${location.hostname || '127.0.0.1'}:3000`;
let roomPollController = null;
let roomConnectionGeneration = 0;
let roomId = '';
let roomJoined = false;
let roomSendClock = 0;
let roomHeartbeatClock = 0;
let lastRoomPosition = null;
let roomSpawnOffsetApplied = false;
const remotePlayers = new Map();

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

function buildCampusColliders(campus) {
  campus.updateMatrixWorld(true);
  campus.traverse(obj => {
    if (!obj.isMesh) return;
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
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
}

function findGrandstandSoundPoint(campus) {
  const seatBounds = new THREE.Box3();
  let seatCount = 0;
  campus.traverse(obj => {
    if (!obj.isMesh || !/^Ghe_(mat_ngoi|lung|tay_vin|dinh_lung|chan)/i.test(obj.name)) return;
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    seatBounds.union(box);
    seatCount++;
  });
  if (!seatCount) return new THREE.Vector3(0, 0, -47);
  const center = seatBounds.getCenter(new THREE.Vector3());
  return new THREE.Vector3(center.x, 0, center.z);
}

function sharedCampusMusicPosition() {
  if (!Number.isFinite(sharedMusicStartedAt)) return null;
  const durations = campusMusicTracks.map(track => track.duration);
  if (durations.some(duration => !Number.isFinite(duration) || duration <= 0)) return null;
  const playlistDuration = durations.reduce((total, duration) => total + duration, 0);
  let position = ((Date.now() + roomServerClockOffsetMs - sharedMusicStartedAt) / 1000) % playlistDuration;
  if (position < 0) position += playlistDuration;
  for (let index = 0; index < durations.length; index++) {
    if (position < durations[index]) return { index, currentTime: position };
    position -= durations[index];
  }
  return { index: 0, currentTime: 0 };
}

function syncCampusMusic(force = false) {
  if (!campusMusicStarted) return;
  const now = performance.now();
  if (!force && now < nextCampusMusicSyncAt) return;
  nextCampusMusicSyncAt = now + 750;
  const position = sharedCampusMusicPosition();
  if (!position) return;
  if (position.index !== campusMusicIndex) {
    campusMusicTracks[campusMusicIndex].pause();
    campusMusicTracks[campusMusicIndex].volume = 0;
    campusMusicIndex = position.index;
  }
  const track = campusMusicTracks[campusMusicIndex];
  if (track.readyState >= 1 && Math.abs(track.currentTime - position.currentTime) > 0.45) {
    try { track.currentTime = position.currentTime; } catch {}
  }
}

function updateCampusMusic() {
  if (!campusMusicStarted || !started || !grandstandSoundPoint) return;
  syncCampusMusic();
  const distance = Math.hypot(walker.x - grandstandSoundPoint.x, walker.z - grandstandSoundPoint.z);
  const fade = THREE.MathUtils.clamp(
    (GRANDSTAND_MUSIC_SILENT_DISTANCE - distance) /
      (GRANDSTAND_MUSIC_SILENT_DISTANCE - GRANDSTAND_MUSIC_FULL_VOLUME_DISTANCE),
    0,
    1
  );
  const track = campusMusicTracks[campusMusicIndex];
  track.volume = GRANDSTAND_MUSIC_MAX_VOLUME * fade;
  if (fade > 0) {
    if (track.paused && !campusMusicPlayPending && !campusMusicBlocked) {
      campusMusicPlayPending = true;
      track.play().then(() => {
        campusMusicPlayPending = false;
      }).catch(error => {
        campusMusicPlayPending = false;
        if (error.name === 'AbortError') return;
        campusMusicBlocked = true;
        console.warn('Không phát được nhạc sân trường:', error);
      });
    }
  } else if (!track.paused) {
    track.pause();
  }
}

function stopCampusMusic() {
  campusMusicStarted = false;
  campusMusicBlocked = false;
  nextCampusMusicSyncAt = 0;
  campusMusicTracks.forEach(track => {
    track.pause();
    track.volume = 0;
  });
}

campusMusicTracks.forEach((track, index) => {
  track.addEventListener('loadedmetadata', () => {
    nextCampusMusicSyncAt = 0;
    syncCampusMusic(true);
    updateCampusMusic();
  });
  track.addEventListener('ended', () => {
    if (index !== campusMusicIndex) return;
    syncCampusMusic(true);
    updateCampusMusic();
  });
});

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

function canMoveTo(x, z) {
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
  if (!started || !avatar || !walker.onGround || (playerGreetingStart!==null&&clock.elapsedTime-playerGreetingStart<1.8)) return;
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

function createCampusLampLights(campus) {
  if(campusLampLights.length) return;
  campus.updateMatrixWorld(true);
  campus.traverse(obj=>{
    if(!obj.isMesh||!/^BongDen(?:Phai|Trai)_\d+$/.test(obj.name)) return;
    const bounds=new THREE.Box3().setFromObject(obj);
    const center=bounds.getCenter(new THREE.Vector3());
    const light=new THREE.PointLight(0xffd59a,0,36,2);
    light.name=`DenSanTruong_${obj.name}`;
    light.position.set(center.x,Math.max(center.y,bounds.max.y)+0.15,center.z);
    light.userData.nightIntensity=62;
    scene.add(light);
    campusLampLights.push(light);

    const materials=Array.isArray(obj.material)?obj.material:[obj.material];
    const glowing=materials.map(material=>{
      const copy=material.clone();
      if(copy.emissive){copy.emissive.set(0xffc56d);copy.emissiveIntensity=0;}
      return copy;
    });
    obj.material=Array.isArray(obj.material)?glowing:glowing[0];
    for(const material of glowing) if(material.emissive) glowingLampMaterials.push(material);
  });
  updateEnvironmentLighting();
}

function createIncenseSmoke(campus) {
  if(incenseSmokeParticles.length) return;
  campus.updateMatrixWorld(true);
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d');
  const gradient=ctx.createRadialGradient(32,32,2,32,32,31);
  gradient.addColorStop(0,'rgba(245,245,240,.72)');
  gradient.addColorStop(0.28,'rgba(220,224,226,.48)');
  gradient.addColorStop(1,'rgba(210,216,222,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
  const smokeTexture=new THREE.CanvasTexture(canvas);
  smokeTexture.colorSpace=THREE.SRGBColorSpace;
  const incense=[];
  const incenseBowls=[];
  const incenseSticks=[];
  campus.traverse(obj=>{
    if(!obj.isMesh) return;
    if(/^LuHuong_Mieng(?:\.\d+)?$/.test(obj.name)) incenseBowls.push(obj);
    if(/^Nhang_[123](?:\.\d+)?$/.test(obj.name)) incenseSticks.push(obj);
  });
  if(incenseBowls.length){
    // Keep a steady, faint plume above both bowls so smoke never vanishes between particle cycles.
    for(let bowlIndex=0;bowlIndex<incenseBowls.length;bowlIndex++){
      const bowl=incenseBowls[bowlIndex];
      const bounds=new THREE.Box3().setFromObject(bowl);
      const center=bounds.getCenter(new THREE.Vector3());
      const plumeBase=new THREE.Vector3(center.x,bounds.max.y+0.07,center.z);
      for(let layer=0;layer<4;layer++){
        const material=new THREE.SpriteMaterial({map:smokeTexture,color:0xe5e8eb,transparent:true,opacity:0.28-layer*0.035,depthTest:false,depthWrite:false,fog:false});
        const sprite=new THREE.Sprite(material);
        sprite.renderOrder=17;
        scene.add(sprite);
        incenseSteadySmoke.push({sprite,material,base:plumeBase.clone(),height:0.10+layer*0.24,size:0.20+layer*0.055,opacity:0.28-layer*0.035,phase:bowlIndex*1.9+layer*0.8});
      }
    }
  }
  if(incenseSticks.length){
    // Put red embers and moving smoke at the real upper tip of all six incense meshes.
    for(const stick of incenseSticks){
      const bounds=new THREE.Box3().setFromObject(stick);
      const ember=bounds.getCenter(new THREE.Vector3());
      ember.y=bounds.max.y+0.025;
      const base=ember.clone();
      base.y+=0.07;
      incense.push({base,ember});
    }
  }else{
    // Fallback to each bowl mouth when a future GLB omits the named incense meshes.
    for(const bowl of incenseBowls){
      const bounds=new THREE.Box3().setFromObject(bowl);
      const center=bounds.getCenter(new THREE.Vector3());
      for(let i=0;i<3;i++){
        const angle=(i/3)*Math.PI*2-Math.PI/2;
        const ember=new THREE.Vector3(center.x+Math.cos(angle)*0.12,bounds.max.y+0.045,center.z+Math.sin(angle)*0.12);
        const base=ember.clone();
        base.y+=0.09;
        incense.push({base,ember});
      }
    }
    if(!incense.length){
      // Last-resort fallback for GLB revisions that renamed both sticks and bowls.
      campus.traverse(obj=>{
        if(!obj.isMesh||!/^Nhang_[123](?:\.\d+)?$/.test(obj.name)) return;
        const bounds=new THREE.Box3().setFromObject(obj);
        const base=bounds.getCenter(new THREE.Vector3());
        const ember=base.clone();
        ember.y=bounds.max.y+0.025;
        base.y=bounds.max.y+0.10;
        incense.push({base,ember});
      });
    }
  }
  const emberGeometry=new THREE.SphereGeometry(0.045,12,10);
  for(let sourceIndex=0;sourceIndex<incense.length;sourceIndex++){
    const {base,ember}=incense[sourceIndex];
    const tip=new THREE.Mesh(emberGeometry,new THREE.MeshBasicMaterial({color:0xff2608,toneMapped:false,depthTest:false}));
    tip.position.copy(ember);
    tip.renderOrder=20;
    scene.add(tip);
    const glow=new THREE.PointLight(0xff3a12,0.45,0.8,2);
    glow.position.copy(ember);
    scene.add(glow);
    const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:smokeTexture,color:0xff471f,transparent:true,opacity:0.88,depthTest:false,depthWrite:false,fog:false,toneMapped:false}));
    halo.position.copy(ember);
    halo.scale.set(0.22,0.22,1);
    halo.renderOrder=19;
    scene.add(halo);
    incenseEmbers.push({tip,glow,halo,phase:sourceIndex*1.73});
    for(let i=0;i<12;i++){
      const material=new THREE.SpriteMaterial({map:smokeTexture,color:0xf0f1f2,transparent:true,opacity:0,depthTest:false,depthWrite:false,fog:false});
      const sprite=new THREE.Sprite(material);
      sprite.renderOrder=18;
      scene.add(sprite);
      incenseSmokeParticles.push({sprite,material,base:base.clone(),phase:i/12+sourceIndex*0.137});
    }
  }
}

function animateIncenseSmoke(time) {
  for(const puff of incenseSteadySmoke){
    const sway=Math.sin(time*0.8+puff.phase)*0.045;
    puff.sprite.position.set(puff.base.x+sway,puff.base.y+puff.height,puff.base.z+Math.cos(time*0.65+puff.phase)*0.035);
    puff.sprite.scale.set(puff.size,puff.size*1.55,1);
    puff.material.opacity=puff.opacity*(0.88+0.12*Math.sin(time*1.2+puff.phase));
  }
  for(const ember of incenseEmbers){
    const flicker=0.82+0.18*Math.sin(time*9+ember.phase);
    ember.tip.scale.setScalar(flicker);
    ember.halo.material.opacity=0.66+0.20*flicker;
    ember.halo.scale.setScalar(0.18+0.035*flicker);
    ember.glow.intensity=0.55+0.35*flicker;
  }
  for(const particle of incenseSmokeParticles){
    const life=(time*0.30+particle.phase)%1;
    const drift=0.02+life*0.15;
    particle.sprite.position.set(
      particle.base.x+Math.sin(time*1.3+particle.phase*7)*drift,
      particle.base.y+life*1.55,
      particle.base.z+Math.cos(time*1.1+particle.phase*6)*drift
    );
    const size=0.13+life*0.36;
    particle.sprite.scale.set(size,size*1.9,1);
    particle.material.opacity=Math.pow(Math.max(0,Math.sin(Math.PI*life)),0.55)*0.72;
  }
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

function makeAvatar(kind, outfit = {}) {
  const root = new THREE.Group();
  const shirt = makeMat(outfit.shirt === 'blue' ? 0x70b9df : 0xf8f7ee);
  const pants = makeMat(outfit.pants === 'blue' ? 0x243b5a : 0x151515);
  const skin = makeMat(0xe8bd98);
  const hair = makeMat(kind === 'girl' ? 0x2a1b15 : 0x171411);
  const shoes = makeMat(0x282522);
  const white = makeMat(0xffffff);
  const addBox = (w,h,d,mat,x,y,z,parent=root) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    mesh.position.set(x,y,z);
    parent.add(mesh);
    return mesh;
  };

  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.105, 0.82, 0);
    root.add(leg);
    addBox(0.18,0.72,0.2,pants,0,-0.35,0,leg);
    addBox(0.2,0.07,0.28,shoes,0,-0.70,0.04,leg);
    if (outfit.footwear === 'slides') {
      addBox(0.2,0.065,0.075,shoes,0,-0.66,0.10,leg);
    } else {
      addBox(0.2,0.055,0.07,shoes,0,-0.66,0.06,leg);
      addBox(0.035,0.085,0.045,shoes,-0.085,-0.66,-0.065,leg);
      addBox(0.035,0.085,0.045,shoes,0.085,-0.66,-0.065,leg);
    }
    legs.push(leg);
  }
  const isTucked = outfit.tucked !== 'no';
  addBox(0.49,isTucked ? 0.62 : 0.78,0.3,shirt,0,isTucked ? 1.13 : 1.04,0);
  if (isTucked) addBox(0.50,0.045,0.31,pants,0,0.84,0);
  // Shorten and connect the neck to the head so it no longer looks stretched.
  addBox(0.13,0.12,0.13,skin,0,1.49,0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19,16,12),skin);
  head.position.set(0,1.71,0);
  root.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(
    0.198,16,12,0,Math.PI*2,0,kind === 'girl' ? Math.PI * 0.72 : Math.PI * 0.56
  ),hair);
  cap.position.set(0,1.75,-0.015);
  root.add(cap);
  if (kind === 'girl') {
    // Cover the nape with hair, then attach one tidy ponytail at the back of the head.
    const napeHair = new THREE.Mesh(new THREE.SphereGeometry(
      0.201,20,16,Math.PI,Math.PI,0,Math.PI
    ),hair);
    napeHair.position.set(0,1.71,0);
    root.add(napeHair);
    const tie = new THREE.Mesh(new THREE.SphereGeometry(0.075,10,8),makeMat(0x9d2b25));
    tie.scale.set(0.8,0.75,0.8);
    tie.position.set(0,1.64,-0.19);
    root.add(tie);
    const ponytail = new THREE.Mesh(new THREE.SphereGeometry(1,12,10),hair);
    ponytail.scale.set(0.075,0.25,0.085);
    ponytail.position.set(0,1.42,-0.23);
    root.add(ponytail);
    const ponytailTip = new THREE.Mesh(new THREE.SphereGeometry(0.065,10,8),hair);
    ponytailTip.scale.set(0.88,1.1,0.92);
    ponytailTip.position.set(0,1.22,-0.23);
    root.add(ponytailTip);
  } else {
    // Short fringe to match the simple cropped hairstyle in the reference image.
    addBox(0.24,0.055,0.10,hair,0,1.78,0.105);
  }
  // Upper arms, forearms and hands; shoulders are separate pivots for walk animation.
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
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
  const bodyPivot = new THREE.Group();
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
  root.userData.arms = arms;
  root.userData.bodyPivot = bodyPivot;
  return root;
}

const campusNpcs = [];
const footballPlayers = [];
let footballBall = null;
function makeNpc(name, kind, x, z) {
  const root = new THREE.Group();
  const mat = (color, roughness=0.42) => new THREE.MeshStandardMaterial({ color, roughness });
  const skin=mat(kind==='principal'?0xe6c6aa:0xf0c29b), dark=mat(0x25211f), pants=mat(kind==='guard'?0x24334a:kind==='principal'?0x323943:0x17191b);
  const shirt=mat(kind==='guard'?0x5ba8d9:kind==='football'?0xfffdf5:kind==='principal'?0xdce8ee:kind==='xoi'?0xf5f0e6:kind==='studentGirl'?0xfffdf5:kind==='studentBoy'?0xf8f7ee:0x9aaa83);
  const apron=mat(kind==='xoi'?0xb29a6a:0x34453d);
  const gold=mat(0xe7c36b), white=mat(0xfffaf0), shoeMat=mat(0x302b28);
  const add = (geometry, material, px, py, pz, parent=root) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(px,py,pz); parent.add(mesh); return mesh;
  };
  const box = (w,h,d,material,px,py,pz,parent=root) => add(new THREE.BoxGeometry(w,h,d),material,px,py,pz,parent);
  const softBox=(w,h,d,radius,material,px,py,pz,parent=root)=>
    add(new RoundedBoxGeometry(w,h,d,4,radius),material,px,py,pz,parent);
  const oval=(sx,sy,sz,material,px,py,pz,parent=root)=>{
    const mesh=add(new THREE.SphereGeometry(1,18,14),material,px,py,pz,parent);
    mesh.scale.set(sx,sy,sz); return mesh;
  };
  const capsule=(radius,length,material,px,py,pz,parent=root)=>add(new THREE.CapsuleGeometry(radius,length,5,12),material,px,py,pz,parent);
  // Balanced block-figure proportions inspired by the Roblox reference.
  softBox(0.54,0.62,0.31,0.055,shirt,0,1.04,0);
  softBox(0.45,0.20,0.29,0.04,pants,0,0.65,0);
  const legs=[];
  for(const side of [-1,1]){
    const leg=new THREE.Group();
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
  softBox(0.40,0.42,0.36,0.075,skin,0,1.68,0);
  // Simple friendly toy face: two small dot eyes and one gentle curved smile.
  const eyeDark=mat(0x211b19), smileMaterial=mat(0x51352d);
  for (const side of [-1,1]) {
    oval(0.025,0.028,0.018,eyeDark,side*0.071,1.72,0.184);
  }
  const smilePoints=[];
  for(let i=0;i<=8;i++){
    const t=i/8;
    smilePoints.push(new THREE.Vector3((t-0.5)*0.09,1.59-0.018*Math.sin(Math.PI*t),0.183));
  }
  const smileCurve=new THREE.CatmullRomCurve3(smilePoints);
  root.add(new THREE.Mesh(new THREE.TubeGeometry(smileCurve,10,0.006,5,false),smileMaterial));
  if (kind === 'guard' || kind === 'banhmi') {
    const capColor=kind==='guard'?dark:mat(0x262827);
    softBox(0.40,0.13,0.36,0.04,capColor,0,1.91,0);
    softBox(0.34,0.045,0.20,0.018,capColor,0,1.84,0.18);
    if(kind==='guard') softBox(0.08,0.07,0.025,0.012,gold,0,1.91,0.19);
  } else if(kind==='xoi') {
    softBox(0.39,0.12,0.36,0.045,white,0,1.91,0);
    softBox(0.34,0.035,0.20,0.015,white,0,1.84,0.16);
  } else if(kind==='principal') {
    const gray=mat(0xd8d5ce), frame=mat(0x7e6b53);
    // Sparse silver hair and understated glasses echo the supplied photo.
    const hairCap=add(new THREE.SphereGeometry(0.208,18,14,0,Math.PI*2,0,Math.PI*0.68),gray,0,1.80,-0.015);
    hairCap.scale.set(1,0.78,1);
    oval(0.085,0.13,0.14,gray,-0.165,1.65,-0.035);
    oval(0.085,0.13,0.14,gray,0.165,1.65,-0.035);
    oval(0.15,0.12,0.12,gray,0,1.56,-0.105);
    for(const side of [-1,1]){
      const lens=add(new THREE.TorusGeometry(0.065,0.008,7,18),frame,side*0.071,1.72,0.19);
      lens.scale.set(1,0.78,1);
      box(0.055,0.009,0.009,frame,side*0.13,1.72,0.185);
    }
    box(0.035,0.012,0.012,frame,0,1.72,0.19);
  } else if(kind==='football') {
    const hair=mat(0x27211e);
    add(new THREE.SphereGeometry(0.207,18,14,0,Math.PI*2,0,Math.PI*0.70),hair,0,1.79,-0.01);
    oval(0.183,0.205,0.135,hair,0,1.66,-0.075);
    softBox(0.25,0.06,0.08,0.022,hair,0,1.78,0.145);
    const jerseyNumber=Number(name.match(/\d+/)?.[0]||1);
    const badgeColor=mat(jerseyNumber%2?0x2d78bd:0xc33b35);
    softBox(0.09,0.10,0.025,0.018,badgeColor,-0.16,1.13,0.17);
    box(0.045,0.04,0.012,white,-0.16,1.13,0.19);
  } else if(kind==='studentBoy'||kind==='studentGirl') {
    const hair=mat(0x27211e);
    add(new THREE.SphereGeometry(0.208,18,14,0,Math.PI*2,0,Math.PI*0.70),hair,0,1.79,-0.01);
    // Dark rear hair fills the old skin-colored gap from crown to nape.
    oval(0.185,0.215,0.14,hair,0,1.65,-0.075);
    softBox(0.25,0.06,0.08,0.022,hair,0,1.78,0.145);
    if(kind==='studentGirl'){
      // One centered tie and a longer, narrow ponytail hanging behind the neck.
      oval(0.047,0.05,0.045,mat(0xa62d3b),0,1.54,-0.205);
      oval(0.055,0.20,0.07,hair,0,1.42,-0.235);
    }
    const badge=mat(kind==='studentGirl'?0xa64f77:0x3c6e8a);
    softBox(0.09,0.10,0.025,0.018,badge,-0.16,1.13,0.17);
    box(0.045,0.04,0.012,white,-0.16,1.13,0.19);
  } else {
    softBox(0.39,0.12,0.36,0.045,white,0,1.91,0);
    softBox(0.34,0.035,0.20,0.015,white,0,1.84,0.16);
  }
  const arms=[];
  for (const side of [-1,1]) {
    const arm=new THREE.Group(); arm.position.set(side*0.34,1.27,0); root.add(arm);
    softBox(0.20,0.36,0.22,0.04,shirt,side*0.025,-0.08,0,arm);
    const forearm=softBox(0.17,0.32,0.19,0.035,skin,side*0.035,-0.39,0.015,arm);
    const palm=softBox(0.19,0.18,0.17,0.035,skin,side*0.045,-0.62,0.025,arm);
    for(let finger=0;finger<3;finger++) softBox(0.04,0.09,0.11,0.018,skin,side*0.045+(finger-1)*0.05,-0.745,0.035,arm);
    arm.userData.forearm=forearm; arm.userData.palm=palm;
    arms.push(arm);
  }
  const bodyPivot=new THREE.Group();
  const legSet=new Set(legs);
  for(const child of [...root.children]){
    if(legSet.has(child)) continue;
    root.remove(child);
    child.position.y-=1.04;
    bodyPivot.add(child);
  }
  bodyPivot.position.y=1.04;
  root.add(bodyPivot);
  root.position.set(x,findWalkSurface(x,z,0) ?? 0,z);
  scene.add(root);
  const npc = {
    name,kind,root,arms,legs,bodyPivot,homeX:x,homeZ:z,
    isStudent:kind==='studentBoy'||kind==='studentGirl',
    greetingStart:null,wasNearPrincipal:false,
    dialogue:kind==='guard'?'Em sơ vin chưa? Đi dép quai hậu chưa?':kind==='xoi'?'Em trai, em gái ăn gì nào?':kind==='banhmi'?'Bánh mì nóng không con ơi?':kind==='principal'?'Chào các em!':kind==='studentBoy'||kind==='studentGirl'?'Chào bạn!':'Chuyền đi!'
  };
  npc.nameTag=document.createElement('div');
  npc.nameTag.className=`npc-name-tag${kind==='principal'?' principal-name-tag':''}`;
  npc.nameTag.textContent=name;
  $('#npcLabels').append(npc.nameTag);
  campusNpcs.push(npc);
  return npc;
}

function createCampusNpcs() {
  if (campusNpcs.length) return;
  const guard = makeNpc('Bác bảo vệ','guard',6.3,-7.2);
  guard.patrol = { min:2.5,max:10.2 };
  const xoiSeller=makeNpc('Cô bán xôi','xoi',-23.5,23.8);
  xoiSeller.root.rotation.y=Math.PI;
  xoiSeller.arms[1].rotation.x=-0.35;
  const breadSeller=makeNpc('Cô bán bánh mì','banhmi',26.5,23.8);
  breadSeller.root.rotation.y=Math.PI;
  breadSeller.arms[1].rotation.x=-0.45;

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

function updateCampusNpcs(time) {
  if (!campusNpcs.length) return;
  updateFootballGame(time);
  let nearest = null, nearestDistance = Infinity;
  let greetingStudent=null, greetingStudentDistance=Infinity;
  const principal=campusNpcs.find(npc=>npc.kind==='principal');
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
    }else{
      const offer=npc.kind==='xoi'?0.35:0.45;
      npc.arms[1].rotation.x=-offer-Math.sin(time*1.8)*0.08;
    }

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
    const distance=Math.hypot(walker.x-npc.root.position.x,walker.z-npc.root.position.z);
    const speechRange=npc.football?23:9;
    if (distance<speechRange && distance<nearestDistance) { nearest=npc; nearestDistance=distance; }

    const projected=npc.root.position.clone().add(new THREE.Vector3(0,2.22,0)).project(camera);
    const onScreen=projected.z>=-1&&projected.z<=1&&Math.abs(projected.x)<=1.08&&Math.abs(projected.y)<=1.08;
    npc.nameTag.hidden=!started||!onScreen;
    if(onScreen){
      npc.nameTag.style.left=`${(projected.x*0.5+0.5)*innerWidth}px`;
      npc.nameTag.style.top=`${(-projected.y*0.5+0.5)*innerHeight}px`;
    }
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
  if (!started || !nearest) { bubble.hidden=true; return; }
  let speechPosition=nearest.root.position.clone().add(new THREE.Vector3(0,2.15,0));
  let speechText=nearest.dialogue;
  if(playerGreetingActive&&avatar){
    speechPosition=avatar.position.clone().add(new THREE.Vector3(0,2.15,0));
    speechText='Em chào thầy ạ!';
  }else if(greetingStudent){
    speechPosition=greetingStudent.root.position.clone().add(new THREE.Vector3(0,2.15,0));
    speechText='Em chào thầy ạ!';
  }
  bubble.textContent=speechText;
  bubble.hidden=false;
  const anchor=speechPosition.project(camera);
  bubble.style.left=`${(anchor.x*0.5+0.5)*innerWidth}px`;
  bubble.style.top=`${(-anchor.y*0.5+0.5)*innerHeight-8}px`;
}

function updateMap() {
  const canvas = $('#minimap');
  if (canvas.hidden) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = 'rgba(20,29,24,.84)';
  ctx.fillRect(0,0,w,h);
  const minX=-158, maxX=138, minZ=-130, maxZ=64;
  const px=x => 10+(x-minX)/(maxX-minX)*(w-20);
  const py=z => 10+(maxZ-z)/(maxZ-minZ)*(h-20);
  ctx.beginPath();
  boundary.forEach(([x,z],i) => i ? ctx.lineTo(px(x),py(z)) : ctx.moveTo(px(x),py(z)));
  ctx.closePath();
  ctx.fillStyle='rgba(129,143,104,.42)';
  ctx.fill();
  ctx.strokeStyle='#ead8b6';
  ctx.lineWidth=1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px(walker.x),py(walker.z),4.5,0,Math.PI*2);
  ctx.fillStyle='#ffcf58';
  ctx.fill();
  ctx.strokeStyle='#fff7dc';
  ctx.lineWidth=1;
  ctx.stroke();
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

function addRemotePlayer(data) {
  if(!data?.id||data.id===roomId) return null;
  const existing=remotePlayers.get(data.id);
  const incomingPosition=data.position||{};
  if(existing){
    existing.profile=data.profile||existing.profile;
    existing.target.set(Number(incomingPosition.x)||0,Number(incomingPosition.y)||0,Number(incomingPosition.z)||0);
    existing.targetYaw=Number(incomingPosition.yaw)||0;
    existing.lastSeen=performance.now();
    existing.nameTag.textContent=existing.profile.name||'Học sinh';
    return existing;
  }
  const remoteProfile=data.profile||{};
  const target=new THREE.Vector3(Number(incomingPosition.x)||0,Number(incomingPosition.y)||0,Number(incomingPosition.z)||0);
  const root=makeAvatar(remoteProfile.gender==='girl'?'girl':'boy',remoteProfile.outfit||{});
  root.position.copy(target);
  root.rotation.y=(Number(incomingPosition.yaw)||0)+Math.PI;
  root.userData.roomWalkPhase=Math.random()*Math.PI*2;
  scene.add(root);
  const nameTag=document.createElement('div');
  nameTag.className='npc-name-tag remote-player-tag';
  nameTag.textContent=remoteProfile.name||'Học sinh';
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
  if(type==='player-joined'){
    if(addRemotePlayer(data)){
      appendRoomMessage({type:'system',text:`${data.profile?.name||'Một học sinh'} đã vào sân trường.`});
      setRoomStatus(`Đang tham quan · ${remotePlayers.size+1} người`);
    }
  }else if(type==='player-move'){
    const remote=remotePlayers.get(data.id);
    if(remote){
      remote.target.set(Number(data.position.x)||0,Number(data.position.y)||0,Number(data.position.z)||0);
      remote.targetYaw=Number(data.position.yaw)||0;
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
    if(Number.isFinite(data.serverTime)) roomServerClockOffsetMs=data.serverTime-Date.now();
    if(Number.isFinite(data.musicStartedAt)) sharedMusicStartedAt=data.musicStartedAt;
    nextCampusMusicSyncAt=0;
    syncCampusMusic(true);
    updateCampusMusic();
    for(const remote of remotePlayers.values()){
      scene.remove(remote.root);
      remote.nameTag.remove();
    }
    remotePlayers.clear();
    for(const player of data.players||[]) addRemotePlayer(player);
    appendRoomMessages(data.messages||[]);
    await roomPost('/api/join',{
      id:roomId,
      profile:{name:profile.name,className:profile.className,gender:profile.gender,outfit:profile.outfit},
      position:{x:walker.x,y:walker.y,z:walker.z,yaw:walker.yaw}
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
  const current={x:walker.x,y:walker.y,z:walker.z,yaw:walker.yaw};
  const changed=!lastRoomPosition
    ||Math.hypot(current.x-lastRoomPosition.x,current.y-lastRoomPosition.y,current.z-lastRoomPosition.z)>0.06
    ||Math.abs(current.yaw-lastRoomPosition.yaw)>0.035;
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
    remote.root.position.x+=(remote.target.x-remote.root.position.x)*alpha;
    remote.root.position.z+=(remote.target.z-remote.root.position.z)*alpha;
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
    const anchor=remote.root.position.clone().add(new THREE.Vector3(0,2.12,0)).project(camera);
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
  if (outfit.pants !== 'black') violations.push('quần phải màu đen');
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
  $('#previewPants').style.fill = outfit.pants === 'black' ? '#171717' : '#49688d';
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
  $('#studentClass').textContent = `Học sinh · Lớp ${p.className} · Niên khóa ${p.year}–${+p.year+3}`;
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
    const outfit = p.outfit || {};
    $('#shirt').value = outfit.shirt || 'white';
    $('#tucked').value = outfit.tucked || 'yes';
    $('#pants').value = outfit.pants || 'black';
    $('#bag').value = outfit.bag || 'crossbody';
    $('#footwear').value = outfit.footwear || 'strap';
  } catch { /* ignore invalid local profile */ }
}

new GLTFLoader().load(
  './assets/NGUYENKHUYEN1_HANG_RAO_AN.glb',
  gltf => {
    const campus = gltf.scene;
    campus.name = 'KhuonVien_THPT_Nguyen_Khuyen';
    campus.traverse(obj => {
      if (!obj.isMesh) return;
      obj.frustumCulled = true;
      obj.castShadow = false;
      obj.receiveShadow = false;
      if (obj.name.startsWith('COLLISION_')) obj.userData.collision = true;
    });
    scene.add(campus);
    buildCampusColliders(campus);
    grandstandSoundPoint = findGrandstandSoundPoint(campus);
    createCampusLampLights(campus);
    createIncenseSmoke(campus);
    createCampusNpcs();
    createFountainEffect(campus);
    const startSurface = findWalkSurface(walker.x, walker.z, walker.y);
    if (startSurface !== null) walker.y = startSurface;
    campusLoaded = true;
    $('#loading').hidden = true;
    $('#startBtn').disabled = false;
  },
  event => {
    if (event.total) $('#loadPct').textContent = ` ${Math.round(event.loaded/event.total*100)}%`;
  },
  error => {
    console.error(error);
    $('#loading').textContent = 'Không tải được GLB. Hãy giữ thư mục assets cạnh index.html.';
    $('#formError').textContent = 'Kiểm tra file assets/NGUYENKHUYEN1_HANG_RAO_AN.glb.';
    $('#formError').hidden = false;
  }
);

loadSavedProfile();
updateUniformPreview();
$('#startBtn').disabled = true;

$('#profileForm').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#name').value.trim().replace(/\s+/g,' ');
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
  setProfile({ role:'student', name, className, year, gender:$('#gender').value, outfit });
  playerWasNearPrincipal=false;
  playerGreetingStart=null;
  if (!avatar) {
    avatar = makeAvatar(profile.gender, profile.outfit);
    scene.add(avatar);
  }
  started = true;
  campusMusicStarted = true;
  campusMusicBlocked = false;
  updateCampusMusic();
  $('#intro').hidden = true;
  $('#hud').hidden = false;
  $('#help').hidden = false;
  $('#touchControls').hidden = false;
  $('#chatToggle').hidden=false;
  showToast(`Chào mừng ${name} đến với trường Nguyễn Khuyến!`);
  connectRoom();
  renderer.domElement.focus();
});

for (const id of ['shirt','tucked','pants','bag','footwear']) {
  $(`#${id}`).addEventListener('change', () => {
    updateUniformPreview();
    const error = $('#formError');
    if (error.hidden || !error.textContent.startsWith('Vi phạm 1 trong 10 quy tắc')) return;
    const violations = uniformViolations(readUniformChoice());
    error.hidden = violations.length === 0;
    if (violations.length) {
      error.textContent = `Vi phạm 1 trong 10 quy tắc ứng xử của học sinh Nguyễn Khuyến: ${violations.join(', ')}. Chỉnh về đúng đồng phục tiêu chuẩn để được vào trường.`;
    }
  });
}
$('#gender').addEventListener('change', updateUniformPreview);

function toggleMap() {
  $('#minimap').hidden = !$('#minimap').hidden;
  updateMap();
}
$('#mapBtn').addEventListener('click', toggleMap);
$('#editBtn').addEventListener('click', () => {
  keys.clear();
  started = false;
  playerWasNearPrincipal=false;
  playerGreetingStart=null;
  disconnectRoom();
  stopCampusMusic();
  $('#intro').hidden = false;
  $('#help').hidden = true;
  $('#touchControls').hidden = true;
  $('#hud').hidden = true;
});

window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
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
  if (event.code === 'KeyM' && started) toggleMap();
  if (event.code === 'KeyE' && started) showToast('Chúc bạn có một buổi tham quan vui vẻ!');
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());

renderer.domElement.addEventListener('pointerdown', event => {
  if (!started) return;
  drag = true;
  lastPointer = { x:event.clientX, y:event.clientY };
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener('pointermove', event => {
  if (!drag || !lastPointer) return;
  const dx = event.clientX - lastPointer.x;
  const dy = event.clientY - lastPointer.y;
  walker.yaw -= dx * 0.005;
  cameraLift = THREE.MathUtils.clamp(cameraLift + dy * 0.015, 1.6, 6.2);
  lastPointer = { x:event.clientX, y:event.clientY };
});
const releasePointer = () => { drag = false; lastPointer = null; };
renderer.domElement.addEventListener('pointerup', releasePointer);
renderer.domElement.addEventListener('pointercancel', releasePointer);
renderer.domElement.addEventListener('wheel', event => {
  cameraDistance = THREE.MathUtils.clamp(cameraDistance + Math.sign(event.deltaY)*0.7, 4.5, 13);
}, { passive:true });

for (const button of document.querySelectorAll('#touchControls [data-key]')) {
  const key = button.dataset.key;
  const down = event => {
    event.preventDefault();
    if (key === 'Space') jumpPlayer();
    else keys.add(key);
    button.setPointerCapture?.(event.pointerId);
  };
  const up = event => { event.preventDefault(); keys.delete(key); };
  button.addEventListener('pointerdown', down);
  button.addEventListener('pointerup', up);
  button.addEventListener('pointercancel', up);
  button.addEventListener('lostpointercapture', up);
}

function movePlayer(dt, time) {
  if (!started || !avatar) return;
  if (!walker.onGround) {
    walker.y += walker.velocityY * dt;
    walker.velocityY -= 17.5 * dt;
  }
  let forwardInput = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  let sideInput = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const greeting = playerGreetingStart!==null && time-playerGreetingStart<1.8;
  const moving = !greeting && Math.hypot(forwardInput,sideInput) > 0;
  const running = keys.has('ShiftLeft') || keys.has('ShiftRight');
  if (moving) {
    const mag = Math.hypot(forwardInput,sideInput);
    forwardInput /= mag;
    sideInput /= mag;
    const speed = running ? 8.2 : walker.speed;
    const fx = -Math.sin(walker.yaw), fz = -Math.cos(walker.yaw);
    const rx = Math.cos(walker.yaw), rz = -Math.sin(walker.yaw);
    const dx = (fx*forwardInput + rx*sideInput)*speed*dt;
    const dz = (fz*forwardInput + rz*sideInput)*speed*dt;
    moveWithCollision(dx, dz);
  }

  const walkSurface = findWalkSurface(walker.x, walker.z, walker.y);
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
  if (avatar.userData.arms) {
    const armSwing = walker.onGround ? swing * 0.62 : 0.12;
    avatar.userData.arms[0].rotation.x = -armSwing;
    avatar.userData.arms[1].rotation.x = armSwing;
  }
  const f = new THREE.Vector3(-Math.sin(walker.yaw),0,-Math.cos(walker.yaw));
  camera.position.set(walker.x - f.x*cameraDistance, cameraLift + walker.y, walker.z - f.z*cameraDistance);
  camera.lookAt(walker.x,1.12 + walker.y,walker.z);
  updateMap();
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
  updateCampusMusic();
  animateClouds(clock.elapsedTime);
  animateIncenseSmoke(clock.elapsedTime);
  animateFountain(clock.elapsedTime);
  updateCampusNpcs(clock.elapsedTime);
  updateRoomNetwork(dt);
  updateRemotePlayers(dt,clock.elapsedTime);
  renderer.render(scene,camera);
});

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1,1.8));
  renderer.setSize(innerWidth,innerHeight);
});
