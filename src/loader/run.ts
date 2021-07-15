import glob from 'glob';
import fs from 'fs';
import zlib from 'zlib';
import { promisify } from 'util';
import { pipeline } from 'stream';

import { from as copyFrom } from 'pg-copy-streams';
import { PoolClient } from 'pg';
import format from 'pg-format';
import yargs from 'yargs';
import config from '../config';

async function run(): Promise<void> {
  const pool = await config.pg();

  const { argv } = yargs
    .usage(
      'Usage: $0 --path=[ location of *_product.csv files, default: ./data/products ]'
    )
    .options({
      path: { type: 'string', default: './data/products' },
    });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE "ProductLoad"
      (
        "productHash" text,
        sku text NOT NULL,
        "vendorName" text NOT NULL,
        region text,
        service text NOT NULL,
        "productFamily" text DEFAULT ''::text NOT NULL,
        attributes jsonb NOT NULL,
        prices jsonb NOT NULL, 
        CONSTRAINT "ProductLoad_pkey"  PRIMARY KEY("productHash")
      )   
    `);

    await loadFiles(argv.path, client);

    await replaceProductTable(client);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function replaceProductTable(client: PoolClient) {
  await client.query(
    `CREATE INDEX "ProductLoad_service_region_index" ON public."ProductLoad" USING btree (service, region)`
  );

  await client.query(
    format(`DROP TABLE IF EXISTS %I`, config.productTableName)
  );
  await client.query(
    format(`ALTER TABLE "ProductLoad" RENAME TO %I`, config.productTableName)
  );
  await client.query(
    format(
      `ALTER INDEX "ProductLoad_pkey" RENAME TO %I`,
      `${config.productTableName}_pkey`
    )
  );
  await client.query(
    format(
      `ALTER INDEX "ProductLoad_service_region_index" RENAME TO %I`,
      `${config.productTableName}_service_region_index`
    )
  );
}

async function loadFiles(path: string, client: PoolClient): Promise<void> {
  const filenames = glob.sync(`${path}/*.csv.gz`);
  if (filenames.length === 0) {
    throw new Error(`No data files at '${path}/*.csv.gz'`);
  }

  for (const filename of filenames) {
    config.logger.info(`Loading file: ${filename}`);
    await loadFile(client, filename);
  }
}

async function loadFile(client: PoolClient, filename: string): Promise<void> {
  const promisifiedPipeline = promisify(pipeline);

  const gunzip = zlib.createGunzip().on('error', (e) => {
    config.logger.info(e);
    process.exit(1);
  });

  const pgCopy = client.query(
    copyFrom(`
    COPY "ProductLoad" FROM STDIN WITH (
      FORMAT csv, 
      HEADER true, 
      DELIMITER ',', 
      FORCE_NOT_NULL ("productFamily")
    )`)
  );

  return promisifiedPipeline(fs.createReadStream(filename), gunzip, pgCopy);
}

export default {
  run,
};
