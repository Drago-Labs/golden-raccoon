import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';

const { Client } = pg;

async function runMigrations() {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS migration_history (
                id SERIAL PRIMARY KEY,
                migration_name VARCHAR(255) UNIQUE NOT NULL,
                checksum VARCHAR(64) NOT NULL,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const migrationsDir = path.resolve('db/migrations');
        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.sql') && !f.endsWith('.down.sql'))
            .sort();

        for (const file of files) {
            const filePath = path.join(migrationsDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const checksum = crypto.createHash('sha256').update(content).digest('hex');

            const { rows } = await client.query(
                'SELECT checksum FROM migration_history WHERE migration_name = $1',
                [file]
            );

            if (rows.length > 0) {
                if (rows[0].checksum !== checksum) {
                    throw new Error(`Checksum mismatch for applied migration: ${file}. It has been modified!`);
                }
                console.log(`Skipping already applied migration: ${file}`);
                continue;
            }

            console.log(`Applying migration: ${file}`);
            await client.query('BEGIN');
            try {
                await client.query(content);
                await client.query(
                    'INSERT INTO migration_history (migration_name, checksum) VALUES ($1, $2)',
                    [file, checksum]
                );
                await client.query('COMMIT');
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            }
        }
        console.log('All migrations applied successfully.');
    } finally {
        await client.end();
    }
}

runMigrations().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
