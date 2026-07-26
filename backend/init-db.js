const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const initDB = async () => {
  console.log('[DB] Connecting to database...');
  const client = await pool.connect();
  console.log('[DB] Connected. Beginning schema init transaction...');
  try {
    await client.query('BEGIN');

    // UUID extension
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    console.log('[DB] uuid-ossp extension ensured');

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

    // 회원 탈퇴(소프트 삭제) 지원: NULL이면 활성 계정, 값이 있으면 탈퇴 처리된 계정
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;');
    console.log('[DB] users.deleted_at 컬럼 확인 완료');

    // 친구 연동용 초대 코드 (예: BELLA-A1B2)
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS friend_code VARCHAR(16) UNIQUE;');
    console.log('[DB] users.friend_code 컬럼 확인 완료');

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

    // 마이페이지에서 시작/목표 일자를 직접 편집할 수 있도록 지원 (기존엔 goal_months만 있어 정확한 날짜가 없었음)
    await client.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS start_date DATE;');
    await client.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS goal_date DATE;');
    console.log('[DB] profiles.start_date / goal_date 컬럼 확인 완료');

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

    console.log('[DB] All tables ensured (users, profiles, meals, workouts, routine_checks, weights, periods, diaries, reports, training_pairs)');
    await client.query('COMMIT');
    console.log('[DB] Database schema created successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[DB] Error creating database schema:', error);
  } finally {
    client.release();
    pool.end();
    console.log('[DB] Client released, pool ended.');
  }
};

module.exports = { initDB };
