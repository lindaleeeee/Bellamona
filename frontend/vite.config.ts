import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin, type ResolvedConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// 주소 구조:  /            → index.html (소개 페이지, 로그인 불필요)
//            앱 주소들     → app.html   (SPA. 화면 전환/로그인 가드는 app.html 안에서 처리)
//
// 배포(Vercel)는 rewrites에 의존하지 않는다: `/`에 실제 파일(index.html)이 있으면 rewrite보다 파일이 우선이라
// 설정이 먹지 않았다. 대신 빌드할 때 앱 주소마다 app.html의 복사본(login.html, home.html ...)을 만들어 둔다.
// vercel.json의 cleanUrls가 /login → login.html 로 연결한다.
const APP_ROUTES = ['/login', '/onboarding', '/home', '/dashboard', '/recipes', '/mypage', '/meal', '/exercise', '/mind', '/nutrition'];

function bellamonaRoutes(): Plugin {
    // 개발/preview 서버: 앱 주소를 app.html로 보낸다.
    const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
        const [path, query = ''] = (req.url || '/').split('?');
        const clean = path.replace(/\/+$/, '') || '/';
        if (APP_ROUTES.includes(clean.toLowerCase())) req.url = `/app.html${query ? `?${query}` : ''}`;
        next();
    };
    let config: ResolvedConfig;
    return {
        name: 'bellamona-routes',
        configResolved(c) { config = c; },
        configureServer(server) { server.middlewares.use(rewrite); },
        configurePreviewServer(server) { server.middlewares.use(rewrite); },
        // 빌드가 끝난 뒤, 환경변수 치환까지 끝난 dist/app.html을 주소별 파일로 복사한다.
        closeBundle() {
            if (config.command !== 'build') return;
            const src = resolve(config.root, config.build.outDir, 'app.html');
            if (!existsSync(src)) throw new Error('dist/app.html을 찾지 못했습니다');
            for (const route of APP_ROUTES) copyFileSync(src, resolve(config.root, config.build.outDir, `${route.slice(1)}.html`));
        },
    };
}

export default defineConfig({
    plugins: [react(), tailwindcss(), bellamonaRoutes()],
    build: {
        rollupOptions: {
            input: {
                main: 'index.html',
                app: 'app.html',
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
