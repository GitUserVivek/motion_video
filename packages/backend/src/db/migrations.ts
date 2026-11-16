import fs from 'fs';
import path from 'path';
import { getDb } from './db.js';

export function runMigrations(): void {
  const db = getDb();
  const schemaPath = path.join(__dirname, 'schema.sql');
  
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at ${schemaPath}`);
  }

  const schema = fs.readFileSync(schemaPath, 'utf-8');
  
  // Execute each statement separately
  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    db.exec(statement + ';');
  }

  console.log('[DB] Migrations applied successfully');
}
