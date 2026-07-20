const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./auth');
const dataRoutes = require('./routes/data');
const reportRoutes = require('./routes/report');

// 환경변수 로드
dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

// 미들웨어 설정
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 라우트 설정
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/report', reportRoutes);

// 기본 헬스체크 라우트
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Bellamona Backend is running' });
});

const { initDB } = require('./init-db');

async function startServer() {
    try {
        await initDB();
        app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
        });
    } catch (err) {
        console.error("Failed to start server due to DB initialization error:", err);
    }
}

startServer();
