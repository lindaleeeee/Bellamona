import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// 주소 구조:  /            → landing.html (소개 페이지, 로그인 불필요)
//            앱 주소들     → index.html   (SPA. 화면 전환/로그인 가드는 index.html 안에서 처리)
// 배포(Vercel)에서는 vercel.json의 rewrites가 같은 일을 한다. 이 플러그인은 개발/preview 서버용.
const APP_ROUTES = ['/login', '/onboarding', '/home', '/dashboard', '/recipes', '/mypage', '/meal', '/exercise', '/mind', '/nutrition'];

function bellamonaRoutes(): Plugin {
    const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
        const [path, query = ''] = (req.url || '/').split('?');
        const clean = path.replace(/\/+$/, '') || '/';
        const qs = query ? `?${query}` : '';
        if (clean === '/') req.url = `/landing.html${qs}`;
        else if (APP_ROUTES.includes(clean.toLowerCase())) req.url = `/index.html${qs}`;
        next();
    };
    return {
        name: 'bellamona-routes',
        configureServer(server) { server.middlewares.use(rewrite); },
        configurePreviewServer(server) { server.middlewares.use(rewrite); },
    };
}

export default defineConfig({
    plugins: [react(), tailwindcss(), bellamonaRoutes()],
    build: {
        rollupOptions: {
            input: {
                main: 'index.html',
                landing: 'landing.html',
            },
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/api': 'http://localhost:8080'
        }
    }
});
