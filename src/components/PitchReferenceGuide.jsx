import React from 'react';
import { X, ExternalLink } from 'lucide-react';

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SARGAM_MAPPING = ["Sa", "re", "Re", "ga", "Ga", "Ma", "MA", "Pa", "dha", "Dha", "ni", "Ni"];

const PitchReferenceGuide = ({ onClose, showSargam, rootKey }) => {

    const rootIndex = NOTES.indexOf(rootKey);

    // Replicate the color logic from App.jsx/AudioPlayer.jsx
    const getColorClass = (interval, octaveStr) => {
        const isAchal = interval === 0 || interval === 7;
        const isVikrut = [1, 3, 6, 8, 10].includes(interval);

        if (octaveStr === "Lower") {
            if (isAchal) return 'bg-blue-900/80 border-blue-500 shadow-blue-500/20';
            else if (isVikrut) return 'bg-orange-950/90 border-orange-700 shadow-orange-700/20';
            else return 'bg-emerald-950/90 border-emerald-700 shadow-emerald-700/20';
        } else if (octaveStr === "Higher") {
            if (isAchal) return 'bg-blue-500/90 border-blue-300 shadow-blue-400/50';
            else if (isVikrut) return 'bg-orange-500/90 border-orange-300 shadow-orange-400/50';
            else return 'bg-emerald-500/90 border-emerald-300 shadow-emerald-400/50';
        } else { // Middle
            if (isAchal) return 'bg-blue-600/90 border-blue-400 shadow-blue-500/40';
            else if (isVikrut) return 'bg-orange-600/90 border-orange-400 shadow-orange-500/40';
            else return 'bg-emerald-600/90 border-emerald-400 shadow-emerald-500/40';
        }
    };

    const getNoteDisplay = (interval, octaveStr) => {
        if (!showSargam) {
            // For Western, we need to calculate the actual note from the interval + root
            const noteIndex = (rootIndex + interval) % 12;
            let noteName = NOTES[noteIndex];
            let octaveNum = 4;
            if (octaveStr === "Lower") octaveNum = 3;
            if (octaveStr === "Higher") octaveNum = 5;
            return { main: noteName + octaveNum, sub: "" };
        }

        let sargamNote = SARGAM_MAPPING[interval];
        if (octaveStr === "Lower") sargamNote += "\u0323"; // Dot Below
        else if (octaveStr === "Higher") sargamNote += "\u0307"; // Dot Above

        // Provide the Western equivalent as sub
        const noteIndex = (rootIndex + interval) % 12;
        let noteName = NOTES[noteIndex];

        return { main: sargamNote, sub: noteName };
    };

    const octaves = [
        { name: "Higher", saptak: "Taar Saptak" },
        { name: "Middle", saptak: "Madhya Saptak" },
        { name: "Lower", saptak: "Mandra Saptak" },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()} // Prevent clicks inside from closing
            >
                <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-800/50">
                    <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <ExternalLink size={18} className="text-indigo-400" />
                            Pitch Color Guide
                        </h2>
                        <p className="text-xs text-gray-400 mt-1">
                            Reference chart for {showSargam ? 'Sargam' : 'Western'} notation colors based on Root Key <strong className="text-white">{rootKey}</strong>.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-xl transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 md:p-6 overflow-y-auto max-h-[80vh]">
                    <div className="flex flex-col gap-6">
                        {octaves.map((octave) => (
                            <div key={octave.name} className="flex flex-col gap-2">
                                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest flex items-center gap-2">
                                    {octave.name} Octave <span className="text-gray-500 font-normal text-xs normal-case">({octave.saptak})</span>
                                </h3>

                                <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
                                    {/* 12 intervals from Root */}
                                    {Array.from({ length: 12 }).map((_, i) => {
                                        const colorClass = getColorClass(i, octave.name);
                                        const display = getNoteDisplay(i, octave.name);

                                        return (
                                            <div key={i} className={`flex flex-col items-center justify-center p-3 rounded-lg border shadow-lg ${colorClass}`}>
                                                <div className="text-xl font-black text-white drop-shadow-md">
                                                    {display.main}
                                                </div>
                                                <div className="text-[10px] font-mono text-white/60 mt-0.5">
                                                    {display.sub}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-gray-800 pt-6">
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full bg-blue-600 border border-blue-400 shadow-lg shadow-blue-500/50"></div>
                            <div className="text-sm text-gray-300"><strong className="text-white">Achal Swar</strong> (Sa, Pa)</div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full bg-emerald-600 border border-emerald-400 shadow-lg shadow-emerald-500/50"></div>
                            <div className="text-sm text-gray-300"><strong className="text-white">Shuddha Swar</strong> (Re, Ga, Ma, Dha, Ni)</div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded-full bg-orange-600 border border-orange-400 shadow-lg shadow-orange-500/50"></div>
                            <div className="text-sm text-gray-300"><strong className="text-white">Vikrut/Komal Swar</strong> (re, ga, MA, dha, ni)</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PitchReferenceGuide;
