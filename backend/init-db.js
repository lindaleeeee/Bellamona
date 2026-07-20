const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const initDB = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // UUID extension
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

    // 1. users
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        google_id VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        avatar TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. profiles
    await client.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        height_cm NUMERIC(5,2),
        weight_kg NUMERIC(5,2),
        goal_weight_kg NUMERIC(5,2),
        goal_months INTEGER,
        daily_kcal_target INTEGER,
        cycle_len INTEGER,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. meals
    await client.query(`
      CREATE TABLE IF NOT EXISTS meals (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        eaten_date DATE NOT NULL,
        label VARCHAR(50),
        time TIME,
        foods JSONB,
        bg_pre INTEGER,
        bg_1h INTEGER,
        bg_2h INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. workouts
    await client.query(`
      CREATE TABLE IF NOT EXISTS workouts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        performed_date DATE NOT NULL,
        strength INTEGER DEFAULT 0,
        hiit INTEGER DEFAULT 0,
        cardio INTEGER DEFAULT 0,
        walk INTEGER DEFAULT 0,
        note TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 5. routine_checks
    await client.query(`
      CREATE TABLE IF NOT EXISTS routine_checks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        check_date DATE NOT NULL,
        checks JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, check_date)
      );
    `);

    // 6. weights
    await client.query(`
      CREATE TABLE IF NOT EXISTS weights (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        logged_date DATE NOT NULL,
        weight_kg NUMERIC(5,2) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 7. periods
    await client.query(`
      CREATE TABLE IF NOT EXISTS periods (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        start_date DATE NOT NULL,
        duration_days INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 8. diaries
    await client.query(`
      CREATE TABLE IF NOT EXISTS diaries (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        written_date DATE NOT NULL,
        content TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 9. reports
    await client.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        content JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 10. training_pairs
    await client.query(`
      CREATE TABLE IF NOT EXISTS training_pairs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        meal_id UUID REFERENCES meals(id) ON DELETE SET NULL,
        features JSONB,
        delta_peak INTEGER,
        data_quality INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query('COMMIT');
    console.log('Database schema created successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating database schema:', error);
  } finally {
    client.release();
    pool.end();
  }
};

module.exports = { initDB };
