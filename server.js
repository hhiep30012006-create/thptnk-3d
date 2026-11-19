'use strict';

// Dependency-free local room server for the school tour.
// It serves the project files, relays live player movement with SSE, and relays chat.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const guestbook = require('./guestbook-store');
const { randomUUID } = require('node:crypto');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const SERVER_STARTED_AT = Date.now();
const clients = new Map();
const classroomBoards = new Map();
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const textField = (value, limit) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
const clientsByRoom = new Map();
const recentMessagesByRoom = new Map();
const pendingChatByRoom = new Map();
const MAX_MESSAGE_LENGTH = 240;
const MAX_CHAT_HISTORY_PER_ROOM = 120;
const CHAT_BATCH_INTERVAL_MS = 30;
const POLL_WAIT_MS = 850;
const MAX_PENDING_ROOM_EVENTS = 256;
const MAX_SSE_BUFFER_BYTES = 256 * 1024;
const CLIENT_TIMEOUT_MS = 45_000;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.ico': 'image/x-icon'
};

function setCors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(response, status, value) {
  setCors(response);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

function roomClients(room) {
  let roomSet = clientsByRoom.get(room);
  if (!roomSet) {
    roomSet = new Set();
    clientsByRoom.set(room, roomSet);
  }
  return roomSet;
}

function sendSerializedEvent(client, eventName, serializedValue) {
  if (client.response.writableEnded || client.response.destroyed) return false;
  if (client.response.writableLength > MAX_SSE_BUFFER_BYTES) {
    removeClient(client);
    if (!client.response.writableEnded) client.response.end();
    return false;
  }
  return client.response.write(`event: ${eventName}\ndata: ${serializedValue}\n\n`);
}

function sendEvent(client, eventName, value) {
  return sendSerializedEvent(client, eventName, JSON.stringify(value));
}

function flushPollEvents(client) {
  if (!client.pollResponse) return;
  const response = client.pollResponse;
  client.pollResponse = null;
  if (client.pollTimer) clearTimeout(client.pollTimer);
  if (client.pollFlushTimer) clearTimeout(client.pollFlushTimer);
  client.pollTimer = null;
  client.pollFlushTimer = null;
  sendJson(response, 200, { events: client.pendingEvents.splice(0) });
}

function queuePollEvent(client, eventName, value) {
  if (eventName === 'player-move') {
    const existingIndex = client.pendingEvents.findIndex(event =>
      event.event === eventName && event.data.id === value.id
    );
    if (existingIndex >= 0) client.pendingEvents[existingIndex] = { event: eventName, data: value };
    else client.pendingEvents.push({ event: eventName, data: value });
  } else {
    client.pendingEvents.push({ event: eventName, data: value });
  }
  if (client.pendingEvents.length > MAX_PENDING_ROOM_EVENTS) {
    const moveIndex = client.pendingEvents.findIndex(event => event.event === 'player-move');
    client.pendingEvents.splice(moveIndex >= 0 ? moveIndex : 0, 1);
  }
  if (client.pollResponse && !client.pollFlushTimer) {
    client.pollFlushTimer = setTimeout(() => flushPollEvents(client), 15);
  }
}

function deliverRoomEvent(client, eventName, value) {
  if (client.response) return sendEvent(client, eventName, value);
  queuePollEvent(client, eventName, value);
  return true;
}

function playerSnapshot(client) {
  return { id: client.id, profile: client.profile, position: client.position };
}

function broadcast(room, eventName, value, excludeId = '') {
  const roomSet = clientsByRoom.get(room);
  if (!roomSet?.size) return;
  for (const client of roomSet) {
    // A new connection receives its snapshot before /api/join completes. Keep
    // delivering room events during that short window so simultaneous joins
    // cannot miss each other or messages sent after their snapshot.
    if (client.id !== excludeId) deliverRoomEvent(client, eventName, value);
  }
}

function removeClient(client) {
  if (!client || !clients.has(client.id)) return;
  clients.delete(client.id);
  const roomSet = clientsByRoom.get(client.room);
  roomSet?.delete(client);
  if (roomSet?.size === 0) clientsByRoom.delete(client.room);
  if (client.pollTimer) clearTimeout(client.pollTimer);
  if (client.pollFlushTimer) clearTimeout(client.pollFlushTimer);
  if (client.pollResponse) {
    const response = client.pollResponse;
    client.pollResponse = null;
    sendJson(response, 410, { error: 'Phòng đã ngắt.' });
  }
  if (client.joined) broadcast(client.room, 'player-left', { id: client.id });
}

function rememberChatMessage(message) {
  let history = recentMessagesByRoom.get(message.room);
  if (!history) {
    history = [];
    recentMessagesByRoom.set(message.room, history);
  }
  history.push(message);
  if (history.length > MAX_CHAT_HISTORY_PER_ROOM) {
    history.splice(0, history.length - MAX_CHAT_HISTORY_PER_ROOM);
  }
}

function queueChatMessage(message) {
  let batch = pendingChatByRoom.get(message.room);
  if (!batch) {
    batch = [];
    pendingChatByRoom.set(message.room, batch);
  }
  batch.push(message);
}

function flushChatBatches() {
  for (const [room, batch] of pendingChatByRoom) {
    if (!batch.length) continue;
    pendingChatByRoom.delete(room);
    const roomSet = clientsByRoom.get(room);
    if (!roomSet?.size) continue;
    const serializedBatch = JSON.stringify(batch);
    for (const client of roomSet) {
      if (client.response) sendSerializedEvent(client, 'chat-batch', serializedBatch);
      else queuePollEvent(client, 'chat-batch', batch);
    }
  }
}

function asNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function cleanProfile(value) {
  const profile = value && typeof value === 'object' ? value : {};
  const outfit = profile.outfit && typeof profile.outfit === 'object' ? profile.outfit : {};
  return {
    name: String(profile.name || 'Học sinh').replace(/[<>\r\n]/g, '').trim().slice(0, 25) || 'Học sinh',
    className: String(profile.className || '').replace(/[<>\r\n]/g, '').trim().slice(0, 8),
    gender: profile.gender === 'girl' ? 'girl' : 'boy',
    role: profile.role === 'alumni' ? 'alumni' : 'student',
    year: Number.isInteger(Number(profile.year)) && Number(profile.year) >= 1961 && Number(profile.year) <= 2100 ? Number(profile.year) : null,
    outfit: {
      shirt: outfit.shirt === 'blue' ? 'blue' : 'white',
      tucked: outfit.tucked === 'no' ? 'no' : 'yes',
      pants: profile.gender === 'girl' && ['skirt', 'aodai'].includes(outfit.pants) ? outfit.pants : 'black',
      bag: outfit.bag === 'backpack' ? 'backpack' : 'crossbody',
      footwear: outfit.footwear === 'slides' ? 'slides' : 'strap'
    }
  };
}

function cleanPosition(value) {
  const position = value && typeof value === 'object' ? value : {};
  return {
    x: asNumber(position.x, 0, -250, 250),
    y: asNumber(position.y, 0, -10, 80),
    z: asNumber(position.z, 0, -250, 250),
    yaw: asNumber(position.yaw, 0, -Math.PI * 20, Math.PI * 20),
    prop: ['tea', 'soda', 'snack', 'bouquet'].includes(position.prop) ? position.prop : ''
  };
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 32_000) throw new Error('Dữ liệu gửi lên quá lớn.');
  }
  return body ? JSON.parse(body) : {};
}

function getClient(body) {
  const id = typeof body?.id === 'string' ? body.id : '';
  return clients.get(id) || null;
}

async function handleApi(request, response, url) {
  if (request.method === 'OPTIONS') {
    setCors(response);
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/guestbook') {
    const voter = url.searchParams.get('voter') || '';
    try {
      sendJson(response, 200, { notes: await guestbook.list(UUID.test(voter) ? voter : '') });
    } catch {
      sendJson(response, 503, { error: 'Kho lưu bút chưa sẵn sàng. Hãy thử lại sau.' });
    }
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/connect') {
    const room = String(url.searchParams.get('room') || 'nguyen-khuyen').slice(0, 40);
    const id = randomUUID();
    const client = {
      id, room, response: null, joined: false, profile: null,
      position: { x: 0, y: 0, z: 0, yaw: 0 },
      lastSeen: Date.now(), lastChat: 0, lastAction: 0,
      pendingEvents: [], pollResponse: null, pollTimer: null, pollFlushTimer: null
    };
    clients.set(id, client);
    const roomSet = roomClients(room);
    roomSet.add(client);
    const players = [...roomSet]
      .filter(other => other.joined)
      .map(playerSnapshot);
    sendJson(response, 200, {
      id,
      players,
      messages: (recentMessagesByRoom.get(room) || []).slice(-30),
      serverTime: Date.now(),
      classroomBoard: classroomBoards.get(room) || '',
      musicStartedAt: SERVER_STARTED_AT
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/events') {
    const room = String(url.searchParams.get('room') || 'nguyen-khuyen').slice(0, 40);
    const id = randomUUID();
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*'
    });
    response.write('retry: 2500\n\n');
    const client = {
      id, room, response, joined: false, profile: null,
      position: { x: 0, y: 0, z: 0, yaw: 0 },
      lastSeen: Date.now(), lastChat: 0, lastAction: 0,
      pendingEvents: [], pollResponse: null, pollTimer: null, pollFlushTimer: null
    };
    clients.set(id, client);
    const roomSet = roomClients(room);
    roomSet.add(client);
    const players = [...roomSet]
      .filter(other => other.joined)
      .map(playerSnapshot);
    sendEvent(client, 'hello', {
      id,
      players,
      messages: (recentMessagesByRoom.get(room) || []).slice(-30),
      serverTime: Date.now(),
      classroomBoard: classroomBoards.get(room) || '',
      musicStartedAt: SERVER_STARTED_AT
    });
    response.on('close', () => removeClient(client));
    return;
  }

  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Phương thức không được hỗ trợ.' });
    return;
  }

  let body;
  try { body = await readJson(request); }
  catch (error) { sendJson(response, 400, { error: error.message || 'Dữ liệu không hợp lệ.' }); return; }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    sendJson(response, 400, { error: 'Dữ liệu không hợp lệ.' });
    return;
  }

  if (url.pathname === '/api/classroom/board' || url.pathname === '/api/guestbook' || url.pathname === '/api/guestbook/heart') {
    const client = body && getClient(body);
    if (!client?.joined) { sendJson(response, 403, { error: 'Hãy vào trường trước.' }); return; }
    const now = Date.now();
    if (now - (client.lastCampusWrite || 0) < 1200) {
      sendJson(response, 429, { error: 'Hãy đợi một chút rồi thử lại.' });
      return;
    }
    if (url.pathname === '/api/classroom/board') {
      if (Math.abs(client.position.y - 30) > 4 || Math.abs(client.position.x + 11.54) > 6 || Math.abs(client.position.z + 77) > 7) {
        sendJson(response, 403, { error: 'Hãy vào lớp để viết bảng.' });
        return;
      }
      if (typeof body.text !== 'string') { sendJson(response, 400, { error: 'Nội dung bảng không hợp lệ.' }); return; }
      const text = textField(body.text, 120);
      client.lastCampusWrite = now;
      classroomBoards.set(client.room, text);
      broadcast(client.room, 'classroom-board', { text });
      sendJson(response, 200, { text });
      return;
    }
    const note = { name: textField(body.name, 48), classYear: textField(body.classYear, 48), message: textField(body.message, 280) };
    const adding = url.pathname === '/api/guestbook';
    if (adding ? !note.name || !note.classYear || !note.message : !UUID.test(body.noteId || '') || !UUID.test(body.voter || '')) {
      sendJson(response, 400, { error: 'Thông tin lưu bút chưa hợp lệ.' });
      return;
    }
    client.lastCampusWrite = now;
    try {
      const result = adding ? await guestbook.add(note) : await guestbook.heart(body.noteId, body.voter);
      sendJson(response, result ? (adding ? 201 : 200) : 404, result ? { note: result } : { error: 'Không tìm thấy lời nhắn.' });
    } catch {
      sendJson(response, 503, { error: 'Không lưu được. Hãy thử lại sau.' });
    }
    return;
  }

  if (url.pathname === '/api/join') {
    const client = getClient(body);
    if (!client) { sendJson(response, 404, { error: 'Phòng đã ngắt, hãy thử kết nối lại.' }); return; }
    if (!client.joined) {
      client.profile = cleanProfile(body.profile);
      client.position = cleanPosition(body.position);
      client.joined = true;
      client.lastSeen = Date.now();
      broadcast(client.room, 'player-joined', playerSnapshot(client), client.id);
    }
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/poll') {
    const client = getClient(body);
    if (!client?.joined) { sendJson(response, 404, { error: 'Bạn chưa vào phòng.' }); return; }
    if (client.response) { sendJson(response, 409, { error: 'Kết nối sự kiện đang hoạt động.' }); return; }
    if (client.pollResponse) { sendJson(response, 409, { error: 'Đã có yêu cầu nhận sự kiện đang chờ.' }); return; }
    client.lastSeen = Date.now();
    if (client.pendingEvents.length) {
      sendJson(response, 200, { events: client.pendingEvents.splice(0) });
      return;
    }
    client.pollResponse = response;
    client.pollTimer = setTimeout(() => flushPollEvents(client), POLL_WAIT_MS);
    response.on('close', () => {
      if (client.pollResponse !== response) return;
      client.pollResponse = null;
      if (client.pollTimer) clearTimeout(client.pollTimer);
      if (client.pollFlushTimer) clearTimeout(client.pollFlushTimer);
      client.pollTimer = null;
      client.pollFlushTimer = null;
    });
    return;
  }

  if (url.pathname === '/api/move') {
    const client = getClient(body);
    if (!client?.joined) { sendJson(response, 404, { error: 'Bạn chưa vào phòng.' }); return; }
    client.position = cleanPosition(body.position);
    client.lastSeen = Date.now();
    broadcast(client.room, 'player-move', { id: client.id, position: client.position }, client.id);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/action') {
    const client = getClient(body);
    if (!client?.joined) { sendJson(response, 404, { error: 'Bạn chưa vào phòng.' }); return; }
    if (body.action !== 'jump') { sendJson(response, 400, { error: 'Hành động không hợp lệ.' }); return; }
    const now = Date.now();
    if (now - client.lastAction < 250) { sendJson(response, 429, { error: 'Đợi một chút rồi thử lại nhé.' }); return; }
    client.position = cleanPosition(body.position);
    client.lastAction = now;
    client.lastSeen = now;
    broadcast(client.room, 'player-action', {
      id: client.id,
      action: 'jump',
      position: client.position,
      serverTime: now
    }, client.id);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/heartbeat') {
    const client = getClient(body);
    if (client?.joined) client.lastSeen = Date.now();
    sendJson(response, client?.joined ? 200 : 404, { ok: Boolean(client?.joined) });
    return;
  }

  if (url.pathname === '/api/chat') {
    const client = getClient(body);
    if (!client?.joined) { sendJson(response, 404, { error: 'Bạn chưa vào phòng.' }); return; }
    const now = Date.now();
    if (now - client.lastChat < 650) { sendJson(response, 429, { error: 'Đợi một chút rồi gửi tin tiếp theo nhé.' }); return; }
    const text = String(body.text || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!text) { sendJson(response, 400, { error: 'Tin nhắn đang trống.' }); return; }
    client.lastChat = now;
    client.lastSeen = now;
    const message = {
      id: client.id,
      name: client.profile.name,
      className: client.profile.className,
      text,
      time: new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }).format(new Date(now)),
      room: client.room
    };
    rememberChatMessage(message);
    queueChatMessage(message);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/leave') {
    const client = getClient(body);
    removeClient(client);
    if (client?.response && !client.response.writableEnded) client.response.end();
    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 404, { error: 'Không tìm thấy API.' });
}

function serveStatic(request, response, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { response.writeHead(400); response.end('Bad request'); return; }
  if (decoded === '/') decoded = '/index.html';
  if (decoded === '/nipplejs.js') {
    const client = path.join(ROOT, 'node_modules', 'nipplejs', 'dist', 'nipplejs.js');
    const stream = fs.createReadStream(client);
    stream.on('error', () => { response.writeHead(404); response.end('Not found'); });
    stream.once('open', () => {
      response.writeHead(200, { 'Content-Type': MIME_TYPES['.js'] });
      if (request.method === 'HEAD') { stream.destroy(); response.end(); } else stream.pipe(response);
    });
    return;
  }
  if (!/^\/(?:index\.html|app\.js|campus-activities\.js|campus-audio\.js|campus-flowers\.js|campus-secret\.js|campus-banner\.js|campus-traffic\.js|campus-map\.js|campus-parking\.js|campus-horse-dialog\.js|campus-morning-light\.js|style\.css|assets\/[^/\\]+)$/.test(decoded)) {
    response.writeHead(404); response.end('Not found'); return;
  }
  const fullPath = path.resolve(ROOT, `.${decoded}`);
  const relative = path.relative(ROOT, fullPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    response.writeHead(403); response.end('Forbidden'); return;
  }
  fs.stat(fullPath, (error, stats) => {
    if (error || !stats.isFile()) {
      if (request.method === 'HEAD' && decoded.startsWith('/assets/')
        && request.headers['x-campus-optional-asset'] === '1' && (!error || ['ENOENT', 'ENOTDIR'].includes(error.code))) {
        response.writeHead(204, { 'Cache-Control': 'no-store' });
        response.end();
      } else {
        response.writeHead(404);
        response.end('Not found');
      }
      return;
    }
    const type = MIME_TYPES[path.extname(fullPath).toLowerCase()] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', 'Content-Length': stats.size };
    let range;
    if (type === 'audio/mpeg') {
      headers['Accept-Ranges'] = 'bytes';
      const raw = request.headers.range;
      if (raw) {
        const parts = /^bytes=(\d*)-(\d*)$/.exec(raw);
        const start = parts?.[1] ? Number(parts[1]) : Math.max(0, stats.size - Number(parts?.[2]));
        const end = parts?.[1] && parts[2] ? Math.min(stats.size - 1, Number(parts[2])) : stats.size - 1;
        if (!parts || (!parts[1] && !parts[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)
            || start >= stats.size || start > end) {
          response.writeHead(416, { 'Content-Range': 'bytes */' + stats.size });
          response.end();
          return;
        }
        range = { start, end };
        headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + stats.size;
        headers['Content-Length'] = end - start + 1;
      }
    }
    response.writeHead(range ? 206 : 200, headers);
    if (request.method === 'HEAD') { response.end(); return; }
    fs.createReadStream(fullPath, range).pipe(response);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/events' || url.pathname.startsWith('/api/')) {
    await handleApi(request, response, url);
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405); response.end('Method not allowed'); return;
  }
  serveStatic(request, response, url.pathname);
});

const heartbeat = setInterval(() => {
  const now = Date.now();
  for (const client of clients.values()) {
    if (now - client.lastSeen > CLIENT_TIMEOUT_MS) {
      removeClient(client);
      if (client.response && !client.response.writableEnded) client.response.end();
    } else if (client.response && !client.response.writableEnded) {
      client.response.write(': keep-alive\n\n');
    }
  }
}, 15_000);

const chatBatchFlush = setInterval(flushChatBatches, CHAT_BATCH_INTERVAL_MS);

server.on('close', () => {
  clearInterval(heartbeat);
  clearInterval(chatBatchFlush);
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Tham quan trường + chat đang chạy tại http://localhost:${PORT}`);
  console.log('Các thiết bị cùng Wi-Fi có thể mở một trong các địa chỉ LAN sau:');
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) console.log(`  http://${address.address}:${PORT}`);
    }
  }
  console.log('Dừng máy chủ bằng Ctrl+C.');
});
