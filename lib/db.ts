import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/drizzle/schema";

// Production (VPS): DATABASE_CLIENT_CERT/DATABASE_CLIENT_KEY are set and the
// connection authenticates via mTLS client certificate (see DEPLOYMENT.md).
// Local dev: both are empty and the pool falls back to a plain connection
// string against the docker-compose Postgres service.
const clientCert = process.env.DATABASE_CLIENT_CERT;
const clientKey = process.env.DATABASE_CLIENT_KEY;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    clientCert && clientKey
      ? { cert: clientCert, key: clientKey, rejectUnauthorized: true }
      : undefined,
});

export const db = drizzle(pool, { schema });
