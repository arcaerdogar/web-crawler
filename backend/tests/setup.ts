import path from 'node:path';
import os from 'node:os';

process.env['DATABASE_PATH'] = path.join(os.tmpdir(), `crawler-test-${process.pid}.db`);
