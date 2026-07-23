import { useEffect } from 'react';
import { AppProvider, useAppContext } from './store';
import Login from './components/Login';
import Home from './components/Home';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';

const MainApp = () => {
    const { state, updateState, api } = useAppContext();

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const isSuccess = params.get('success');

        // Try fetching user profile to verify cookie is perfectly working
        api.loadProfile().then((success) => {
            if (success) {
                // If they just logged in from Google, show onboard
                if (isSuccess === '1') {
                    window.history.replaceState({}, document.title, window.location.pathname);
                    updateState({ loggedIn: true, currentScreen: 'onboard' });
                } else {
                    updateState({ loggedIn: true, currentScreen: 'home' });
                }
            } else {
                updateState({ loggedIn: false, currentScreen: 'login' });
            }
        });
    }, []); // Run once on mount

    return (
        <div className="bg-[#fcfbf9] min-h-screen text-[#1d1b1c] font-['Nunito',sans-serif] flex flex-col">
            {state.currentScreen === 'login' && <Login />}
            {state.currentScreen === 'onboard' && <Onboarding />}
            {state.currentScreen === 'home' && <Home />}
            {state.currentScreen === 'dashboard' && <Dashboard />}
            {/* Adding placeholders for hormone detail screens */}
            {['insulin', 'growth', 'cortisol', 'oxytocin', 'diet'].includes(state.currentScreen) && (
                <div className="p-4 flex flex-col flex-1 items-center justify-center">
                    <h2 className="text-xl font-bold">{state.currentScreen.toUpperCase()} Screen</h2>
                    <button
                        onClick={() => updateState({ currentScreen: 'home' })}
                        className="mt-4 px-4 py-2 bg-white rounded-xl shadow border border-gray-200 font-bold"
                    >
                        홈으로 돌아가기
                    </button>
                </div>
            )}
        </div>
    );
};

const App = () => {
    return (
        <AppProvider>
            <MainApp />
        </AppProvider>
    );
};

export default App;
