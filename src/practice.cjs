const fs = require('node:fs');
const path = require('node:path');
const { UserError } = require('./router.cjs');
const core = require('./shared/practice-core.js'); // the same logic runs in the phone app
core.configure({ ErrorClass: UserError });
// Desktop storage: userData/practice.json, written atomically.
class Practice extends core.Practice {
  constructor(directory) {
    const file = path.join(directory, 'practice.json');
    super({ read: () => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null, write: text => { fs.mkdirSync(directory, { recursive: true }); const temp = file + '.tmp'; fs.writeFileSync(temp, text, { mode: 0o600 }); fs.renameSync(temp, file); } });
    this.directory = directory; this.file = file;
  }
}
module.exports = { ...core, Practice };
