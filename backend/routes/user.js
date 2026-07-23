const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5
});

// GET /api/user/profile 
// Returns basic user info along with profile settings
router.get('/profile', async (req, res) => {
    let client;
    try {
        const { userId } = req.user;
        client = await pool.connect();

        // Fetch user + profile
        const result = await client.query(`
            SELECT u.id, u.email, u.name, u.avatar, 
                   p.height_cm, p.weight_kg, p.goal_weight_kg, 
                   p.goal_months, p.daily_kcal_target, p.cycle_len
            FROM users u
            LEFT JOIN profiles p ON u.id = p.user_id
            WHERE u.id = $1
        `, [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('[GET /api/user/profile error]', error);
        res.status(500).json({ error: 'Failed to fetch user profile' });
    } finally {
        if (client) client.release();
    }
});

// POST /api/user/onboard
// Upserts the user's profile settings
router.post('/onboard', async (req, res) => {
    let client;
    try {
        const { userId } = req.user;
        const { height_cm, weight_kg, goal_weight_kg, goal_months, daily_kcal_target, cycle_len } = req.body;

        client = await pool.connect();

        // Upsert into profiles
        const result = await client.query(`
            INSERT INTO profiles (user_id, height_cm, weight_kg, goal_weight_kg, goal_months, daily_kcal_target, cycle_len)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (user_id) 
            DO UPDATE SET 
                height_cm = EXCLUDED.height_cm,
                weight_kg = EXCLUDED.weight_kg,
                goal_weight_kg = EXCLUDED.goal_weight_kg,
                goal_months = EXCLUDED.goal_months,
                daily_kcal_target = EXCLUDED.daily_kcal_target,
                cycle_len = EXCLUDED.cycle_len,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *;
        `, [userId, height_cm || null, weight_kg || null, goal_weight_kg || null, goal_months || null, daily_kcal_target || null, cycle_len || 28]);

        res.json({ message: 'Onboarding completed', profile: result.rows[0] });
    } catch (error) {
        console.error('[POST /api/user/onboard error]', error);
        res.status(500).json({ error: 'Failed to save onboarding data' });
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
