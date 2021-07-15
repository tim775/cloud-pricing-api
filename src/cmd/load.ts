import fs from 'fs';
import path from 'path';
import config from '../config';
import loader from '../loader/run';

const dir = path.join(__dirname, '../data');

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}

async function run() {
  await loader.run();
}

run()
  .then(() => {
    config.logger.info('load complete');
    process.exit(0);
  })
  .catch((err) => {
    config.logger.error(err);
    process.exit(1);
  });
