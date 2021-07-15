import dotenv from 'dotenv';
import pino from 'pino';
import { MongoClient, Db } from 'mongodb';
import NodeCache from 'node-cache';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });
dotenv.config();

let client: MongoClient;

async function setupDb(db: Db): Promise<void> {
  db.collection('products').createIndex({ vendorName: 1, sku: 1 });
  db.collection('products').createIndex({ productHash: 1 }, { unique: true });
  db.collection('products').createIndex({
    vendorName: 1,
    service: 1,
    productFamily: 1,
    region: 1,
  });
  db.collection('products').createIndex({
    vendorName: 1,
    service: 1,
    productFamily: 1,
    region: 1,
    'attributes.instanceType': 1,
    'attributes.tenancy': 1,
    'attributes.operatingSystem': 1,
    'attributes.capacitystatus': 1,
    'attributes.preInstalledSw': 1,
  });
  db.collection('products').createIndex({
    vendorName: 1,
    service: 1,
    productFamily: 1,
    region: 1,
    'attributes.instanceType': 1,
    'attributes.deploymentOption': 1,
    'attributes.databaseEngine': 1,
    'attributes.databaseEdition': 1,
  });
}

async function db(): Promise<Db> {
  if (!client) {
    client = await MongoClient.connect(config.mongoDbUri, {
      useUnifiedTopology: true,
      useNewUrlParser: true,
      poolSize: 10,
    });
    await setupDb(client.db());
  }
  return client.db();
}

let pgPool: Pool;
async function pg(): Promise<Pool> {
  if (!pgPool) {
    pgPool = new Pool({
      connectionString:
        process.env.POSTGRES_URI ||
        'postgresql://postgres:my_password@localhost:5432/cloudPricing',
    });
  }
  return pgPool;
}

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  prettyPrint: process.env.NODE_ENV !== 'production',
});

const cache = new NodeCache();

const config = {
  logger,
  db,
  pg,
  productTableName: 'Product',
  cache,
  port: Number(process.env.PORT) || 4000,
  gcpApiKey: process.env.GCP_API_KEY,
  gcpKeyFile: process.env.GCP_KEY_FILE,
  gcpProject: process.env.GCP_PROJECT,
  mongoDbUri:
    process.env.MONGODB_URI || 'mongodb://localhost:27017/cloudPricing',
};

export default config;
