import React, { useState } from 'react';
import { useAppContext } from '../store';

const Oxytocin = () => {
    const { updateState } = useAppContext();
    const [mood, setMood] = useState('good');
    const [note, setNote] = useState('');

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
                    <span>💗</span> 옥시토신 관리
                </div>
                <div className="w-[36px]"></div>
            </div>

            <div className="flex-1 overflow-y-auto p-[14px]">
                {/* Description */}
                <div className="mb-6 px-2">
                    <p className="text-[13px] text-[#8e8d89] leading-relaxed">
                        정서적 안정, 명상, 사랑하는 사람과의 교감은<br />
                        호르몬 안정과 폭식 방지에 큰 도움이 됩니다.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="bg-white border border-[#eae8e3] rounded-[20px] p-5 shadow-sm space-y-5">
                    {/* Mood Level */}
                    <div>
                        <label className="block text-[12px] font-bold text-[#1d1b1c] mb-2 uppercase tracking-wide">
                            오늘의 감정 상태
                        </label>
                        <div className="flex gap-2 justify-between mt-3 px-1">
                            {[
                                { id: 'great', emoji: '🥰' },
                                { id: 'good', emoji: '😊' },
                                { id: 'okay', emoji: '😐' },
                                { id: 'bad', emoji: '😔' },
                                { id: 'terrible', emoji: '😭' }
                            ].map(m => (
                                <button
                                    type="button"
                                    key={m.id}
                                    onClick={() => setMood(m.id)}
                                    className={`w-12 h-12 rounded-2xl text-[24px] flex items-center justify-center transition-all ${mood === m.id ? 'bg-[#ba68c8] text-white shadow-md transform scale-110' : 'bg-[#eae8e3] opacity-60 grayscale'}`}
                                >
                                    {m.emoji}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Note Input */}
                    <div>
                        <label className="block text-[12px] font-bold text-[#1d1b1c] mb-2 uppercase tracking-wide">
                            오늘의 감사 일기
                        </label>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="오늘 하루 있었던 좋은 일을 기록해보세요"
                            rows={4}
                            className="w-full px-4 py-3 bg-[#fcfbf9] border border-[#eae8e3] rounded-[14px] text-[14px] focus:outline-none focus:border-[#ba68c8] focus:ring-1 focus:ring-[#ba68c8] transition-all resize-none"
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

export default Oxytocin;
