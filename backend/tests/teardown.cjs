const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

module.exports = async function () {
  const dir = os.tmpdir();
  const files = fs.readdirSync(dir).filter(f => f.startsWith('crawler-test-') && f.endsWith('.db'));
  for (const file of files) {
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(path.join(dir, file + suffix)); } catch {}
    }
  }
};
