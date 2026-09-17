import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Pool } from 'pg';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://kaon:kaonpw@localhost:5432/kaoncdo',
});

app.get('/health', async () => {
  const db = await pool.query('SELECT count(*)::int AS stores FROM stores').catch((e) => ({ rows: [{ stores: -1, error: String(e) }] }));
  return { ok: true, service: 'kaoncdo-api', stores: (db as { rows: Array<{ stores: number }> }).rows[0].stores };
});

app.get('/api/stores', async () => {
  const { rows } = await pool.query(
    `SELECT id, name, cuisine, image, rating, delivery_fee, is_open,
            ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
     FROM stores ORDER BY name`
  );
  return { stores: rows };
});

const port = Number(process.env.API_PORT ?? 3001);
await app.listen({ port, host: '0.0.0.0' });
