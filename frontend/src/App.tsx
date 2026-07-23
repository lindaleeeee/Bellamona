import { useEffect } from 'react';
import { AppProvider, useAppContext } from './store';
import Login from './components/Login';
import Home from './components/Home';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import Insulin from './components/Insulin';
import Growth from './components/Growth';
import Cortisol from './components/Cortisol';
import Oxytocin from './components/Oxytocin';
import Diet from './components/Diet';

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
            {state.currentScreen === 'insulin' && <Insulin />}
            {state.currentScreen === 'growth' && <Growth />}
            {state.currentScreen === 'cortisol' && <Cortisol />}
            {state.currentScreen === 'oxytocin' && <Oxytocin />}
            {state.currentScreen === 'diet' && <Diet />}
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
