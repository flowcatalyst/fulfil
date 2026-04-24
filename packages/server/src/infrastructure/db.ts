import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ScopeAwareDrizzleLogger } from '@fulfil/framework';

const connectionString = process.env['DATABASE_URL'] ?? 'postgresql://localhost:5432/fulfil';

const sql = postgres(connectionString);

export const db = drizzle({ client: sql, logger: new ScopeAwareDrizzleLogger() });
