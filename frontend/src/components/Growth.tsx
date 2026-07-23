import React, { useState } from 'react';
import { useAppContext } from '../store';

const Growth = () => {
    const { updateState } = useAppContext();
    const [workout, setWorkout] = useState('');
    const [minutes, setMinutes] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        alert('저장되었습니다!');
        updateState({ currentScreen: 'home' });
    };

    return (
        <div className="w-full flex-1 flex flex-col h-full bg-[#fcfbf9]">
            {/* Header section */}
            <div className="px-[14px] pt-[14px] pb-[12px] bg-white border-b border-[#eae8e3] flex items-center justify-between shadow-sm sticky top-0 z-10">
                <button
                    onClick={() => updateState({ currentScreen: 'home' })}
                    className="w-[36px] h-[36px] flex items-center justify-center -ml-2 rounded-full hover:bg-gray-50 transition-colors"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1d1b1c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m15 18-6-6 6-6" />
                    </svg>
                </button>
                <div className="font-bold text-[18px] text-[#1d1b1c] font-['Playfair_Display'] flex gap-2 items-center">
                    <span>💪</span> 성장호르몬 관리
                </div>
                <div className="w-[36px]"></div>
            </div>

            <div className="flex-1 overflow-y-auto p-[14px]">
                {/* Description */}
                <div className="mb-6 px-2">
                    <p className="text-[13px] text-[#8e8d89] leading-relaxed">
                        근력 운동과 유산소를 병행하여 체지방을 연소하고<br />
                        노화를 방지하는 성장호르몬 분비를 촉진하세요.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="bg-white border border-[#eae8e3] rounded-[20px] p-5 shadow-sm space-y-5">
                    {/* Workout Type */}
                    <div>
                        <label className="block text-[12px] font-bold text-[#1d1b1c] mb-2 uppercase tracking-wide">
                            오늘의 주요 운동
                        </label>
                        <select
                            value={workout}
                            onChange={(e) => setWorkout(e.target.value)}
                            className="w-full px-4 py-3 bg-[#fcfbf9] border border-[#eae8e3] rounded-[14px] text-[14px] font-bold focus:outline-none focus:border-[#81c784] focus:ring-1 focus:ring-[#81c784] transition-all"
                        >
                            <option value="">선택하세요</option>
                            <option value="strength">근력 운동 (웨이트)</option>
                            <option value="cardio">유산소 운동 (러닝/사이클)</option>
                            <option value="hiit">고강도 인터벌 (HIIT)</option>
                            <option value="stretch">요가 / 스트레칭</option>
                        </select>
                    </div>

                    {/* Duration Input */}
                    <div>
                        <label className="block text-[12px] font-bold text-[#1d1b1c] mb-2 uppercase tracking-wide">
                            운동 시간 (분)
                        </label>
                        <input
                            type="number"
                            value={minutes}
                            onChange={(e) => setMinutes(e.target.value)}
                            placeholder="예: 45"
                            className="w-full px-4 py-3 bg-[#fcfbf9] border border-[#eae8e3] rounded-[14px] text-[15px] font-bold focus:outline-none focus:border-[#81c784] focus:ring-1 focus:ring-[#81c784] transition-all"
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-[#1d1b1c] text-white py-[14px] rounded-[16px] font-bold text-[15px] hover:bg-[#333] transition-colors mt-2"
                    >
                        기록 완료
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Growth;
