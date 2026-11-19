const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'assets', 'Nguyenkhuyen1989.glb');
const splitDirectory = path.join(root, 'release-assets');
const expectedBytes = 29_451_904;
const expectedHash = 'd3f9fd0907beb0a9ac0dc072b5fd61072bdde27bd847ce6af95c949982441bb0';
const hashFile = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// Rebuild the exact GLB during npm ci, before Render starts the server.
if (fs.existsSync(output) && fs.statSync(output).size === expectedBytes && hashFile(output) === expectedHash) {
  console.log('Campus GLB verified.');
} else {
  const temporary = `${output}.${process.pid}.tmp`;
  const hash = createHash('sha256');
  let total = 0;
  try {
    const handle = fs.openSync(temporary, 'wx');
    try {
      for (let index = 0; index < 14; index++) {
        const suffix = String(index).padStart(2, '0');
        const chunk = fs.readFileSync(path.join(splitDirectory, `Nguyenkhuyen1989.part-${suffix}`));
        fs.writeFileSync(handle, chunk);
        hash.update(chunk);
        total += chunk.length;
      }
    } finally {
      fs.closeSync(handle);
    }
    if (total !== expectedBytes || hash.digest('hex') !== expectedHash) {
      throw new Error('The assembled campus GLB does not match the tested release.');
    }
    fs.renameSync(temporary, output);
    console.log(`Campus GLB restored and verified (${total} bytes).`);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
