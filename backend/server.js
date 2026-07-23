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

app.set('trust proxy', 1);   // Cloudtype 프록시 뒤에 있으므로

process.on('unhandledRejection', (r) => console.error('[UNHANDLED REJECTION]', r));
process.on('uncaughtException', (e) => console.error('[UNCAUGHT EXCEPTION]', e));

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

initDB()
    .then(() => {
        app.listen(port, () => console.log(`Server is running on port ${port}`));
    })
    .catch((err) => {
        console.error('DB init failed, server not started:', err);
        process.exit(1);
    });
