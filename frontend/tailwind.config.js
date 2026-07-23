/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                bg: '#fcfbf9',
                surf: '#ffffff',
                text: '#1d1b1c',
                muted: '#8e8d89',
                bdr: '#eae8e3',
                ok: '#63d179',
                danger: '#ff715a',
                ins: '#ffdf70',
                gro: '#81c784',
                cor: '#ff8a65',
                oxy: '#ba68c8',
                sky1: '#e0f2fe',
                sky2: '#5bb8f5',
                lav1: '#f3e8ff',
                lav2: '#d8b4fe',
            }
        },
    },
    plugins: [],
}
