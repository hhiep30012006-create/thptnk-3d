'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

const dataHome = process.env.LOCALAPPDATA || process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
const file = process.env.GUESTBOOK_FILE || path.join(dataHome, 'thptnk-3d', 'guestbook.json');
const uri = process.env.MONGODB_URI;
let database;
let queue = Promise.resolve();

function mongo() {
  if (!database) {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    database = client.connect().then(() => client.db(process.env.MONGODB_DATABASE || 'thptnk'));
    database.catch(() => { database = undefined; void client.close(); });
  }
  return database;
}

function local(operation, write = false) {
  if (process.env.RENDER && !process.env.GUESTBOOK_FILE) throw new Error('Cần cấu hình lưu trữ lâu dài cho bảng lưu bút.');
  const task = queue.then(async () => {
    let notes;
    try {
      notes = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      notes = [];
    }
    const result = operation(notes);
    if (write) {
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temp = file + '.' + randomUUID() + '.tmp';
      try {
        await fs.writeFile(temp, JSON.stringify(notes), { flag: 'wx' });
        await fs.rename(temp, file);
      } finally {
        await fs.rm(temp, { force: true });
      }
    }
    return result;
  });
  queue = task.catch(() => {});
  return task;
}

function publicNote(note, voter) {
  const { _id, name, classYear, message, createdAt, voters } = note;
  return { id: _id, name, classYear, message, createdAt, hearts: voters.length, liked: voters.includes(voter) };
}

async function list(voter) {
  const collection = uri && (await mongo()).collection('guestbook');
  const notes = collection
    ? await collection.find().sort({ createdAt: -1, _id: -1 }).limit(60).toArray()
    : await local(entries => entries.slice(-60).reverse());
  return notes.map(note => publicNote(note, voter));
}

async function add(note) {
  const entry = { ...note, _id: randomUUID(), createdAt: new Date().toISOString(), voters: [] };
  if (uri) await (await mongo()).collection('guestbook').insertOne(entry);
  else await local(notes => notes.push(entry), true);
  return publicNote(entry);
}

async function heart(id, voter) {
  if (uri) {
    const entry = await (await mongo()).collection('guestbook').findOneAndUpdate(
      { _id: id }, { $addToSet: { voters: voter } }, { returnDocument: 'after' }
    );
    return entry && publicNote(entry, voter);
  }
  return local(notes => {
    const entry = notes.find(note => note._id === id);
    if (!entry) return null;
    if (!entry.voters.includes(voter)) entry.voters.push(voter);
    return publicNote(entry, voter);
  }, true);
}

module.exports = { list, add, heart };
