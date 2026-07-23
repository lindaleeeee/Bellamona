import { createContext, useContext, useState, ReactNode } from 'react';

// S 객체를 대체할 기본 상태 데이터 구조
interface GlobalState {
    loggedIn: boolean;
    name: string;
    goalCal: number;
    initWeight: number;
    goalWeight: number;
    goalMonths: number;
    weights: any[];
    savedTotal: number;
    routines: Record<string, any[]>;
    checks: Record<string, boolean>;
    obStep: number;
    currentScreen: string;
}

const initialState: GlobalState = {
    loggedIn: false,
    name: '혜림',
    goalCal: 1200,
    initWeight: 55,
    goalWeight: 48,
    goalMonths: 3,
    weights: [],
    savedTotal: 0,
    routines: { insulin: [], growth: [], cortisol: [], oxytocin: [] },
    checks: {},
    obStep: 1,
    currentScreen: 'login',
};

interface AppContextType {
    state: GlobalState;
    setState: React.Dispatch<React.SetStateAction<GlobalState>>;
    updateState: (updates: Partial<GlobalState>) => void;
    api: {
        loadProfile: () => Promise<boolean>;
        saveProfile: () => Promise<void>;
    };
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<GlobalState>(initialState);

    const updateState = (updates: Partial<GlobalState>) => {
        setState((prev) => ({ ...prev, ...updates }));
    };

    const loadProfile = async (): Promise<boolean> => {
        try {
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
            const res = await fetch(`${apiUrl}/api/user/profile`, {
                credentials: 'include'
            });
            if (res.ok) {
                const data = await res.json();
                updateState({
                    name: data.name || state.name,
                    initWeight: data.weight_kg ? Number(data.weight_kg) : state.initWeight,
                    goalWeight: data.goal_weight_kg ? Number(data.goal_weight_kg) : state.goalWeight,
                    goalMonths: data.goal_months || state.goalMonths,
                    goalCal: data.daily_kcal_target || state.goalCal
                });
                return true;
            }
        } catch (err) {
            console.error('Failed to load profile', err);
        }
        return false;
    };

    const saveProfile = async () => {
        try {
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
            await fetch(`${apiUrl}/api/user/onboard`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    weight_kg: state.initWeight,
                    goal_weight_kg: state.goalWeight,
                    goal_months: state.goalMonths,
                    daily_kcal_target: state.goalCal,
                })
            });
        } catch (err) {
            console.error('Failed to save profile', err);
        }
    };

    return (
        <AppContext.Provider value={{ state, setState, updateState, api: { loadProfile, saveProfile } }}>
            {children}
        </AppContext.Provider>
    );
}

export function useAppContext() {
    const context = useContext(AppContext);
    if (!context) throw new Error('useAppContext must be used within AppProvider');
    return context;
}

