import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Mic, MicOff, Music2, ChevronDown } from 'lucide-react';
import { YIN } from 'pitchfinder';

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SARGAM_ALL = ["Sa", "re", "Re", "ga", "Ga", "Ma", "MA", "Pa", "dha", "Dha", "ni", "Ni"];

// Thaat/Scale definitions: each maps to 7 intervals from Sa
const SCALES = {
    "Bilawal (Major)": [0, 2, 4, 5, 7, 9, 11],
    "Asavari (Minor)": [0, 2, 3, 5, 7, 8, 10],
    "Bhairavi": [0, 1, 3, 5, 7, 8, 10],
    "Kalyan (Lydian)": [0, 2, 4, 6, 7, 9, 11],
    "Khamaj": [0, 2, 4, 5, 7, 9, 10],
    "Bhairav": [0, 1, 4, 5, 7, 8, 11],
    "Marwa": [0, 1, 4, 6, 7, 9, 11],
    "Poorvi": [0, 1, 4, 6, 7, 8, 11],
    "Todi": [0, 1, 3, 6, 7, 8, 11],
    "Chromatic (All 12)": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

// 3 Saptaks for practice (Indian classical vocal range)
const SAPTAKS = [
    { name: 'Taar', key: 'taar', color: 'text-purple-400', bg: 'bg-purple-500/10', dotFn: (s) => s + '\u0307' },
    { name: 'Madhya', key: 'madhya', color: 'text-indigo-400', bg: 'bg-indigo-500/10', dotFn: (s) => s },
    { name: 'Mandra', key: 'mandra', color: 'text-blue-400', bg: 'bg-blue-500/10', dotFn: (s) => s + '\u0323' },
];

const SargamPractice = ({ onClose }) => {
    const [rootKey, setRootKey] = useState("A");
    const [selectedScale, setSelectedScale] = useState("Asavari (Minor)");
    const [isListening, setIsListening] = useState(false);
    const [pitchInfo, setPitchInfo] = useState(null);

    const audioCtxRef = useRef(null);
    const scriptNodeRef = useRef(null);
    const streamRef = useRef(null);
    const isActiveRef = useRef(false);

    const scaleIntervals = useMemo(() => SCALES[selectedScale] || SCALES["Bilawal (Major)"], [selectedScale]);

    const rootMidi = useMemo(() => {
        const idx = NOTES.indexOf(rootKey);
        return 60 + idx;
    }, [rootKey]);

    const analyzePitch = useCallback((frequency) => {
        if (!frequency || frequency < 50 || frequency > 1200) return null;

        const exactMidi = 69 + 12 * Math.log2(frequency / 440);
        const interval = ((exactMidi - rootMidi) % 12 + 12) % 12;

        // --- SAPTAK (Octave) DETECTION ---
        const semitonesFromRoot = exactMidi - rootMidi;
        let saptak, saptakLabel, saptakShort;
        if (semitonesFromRoot < -6) {
            saptak = 'mandra'; saptakLabel = 'Mandra Saptak'; saptakShort = 'M';
        } else if (semitonesFromRoot < 6) {
            saptak = 'madhya'; saptakLabel = 'Madhya Saptak'; saptakShort = 'm';
        } else if (semitonesFromRoot < 18) {
            saptak = 'taar'; saptakLabel = 'Taar Saptak'; saptakShort = 'T';
        } else {
            saptak = 'ati-taar'; saptakLabel = 'Ati-Taar Saptak'; saptakShort = 'AT';
        }

        let lowerSwara = null, upperSwara = null;
        let lowerInterval = -1, upperInterval = 13;

        for (const si of scaleIntervals) {
            if (si <= interval && si > lowerInterval) { lowerInterval = si; lowerSwara = SARGAM_ALL[si]; }
            if (si >= interval && si < upperInterval) { upperInterval = si; upperSwara = SARGAM_ALL[si]; }
        }

        if (lowerSwara === null) { lowerInterval = scaleIntervals[scaleIntervals.length - 1]; lowerSwara = SARGAM_ALL[lowerInterval]; }
        if (upperSwara === null) { upperInterval = scaleIntervals[0] + 12; upperSwara = SARGAM_ALL[scaleIntervals[0]]; }

        const distFromLower = interval - lowerInterval;
        const distToUpper = upperInterval - interval;
        const spanWidth = upperInterval - lowerInterval;
        const centsFromLower = distFromLower * 100;
        const centsToUpper = distToUpper * 100;
        const position = spanWidth > 0 ? distFromLower / spanWidth : 0;

        let status, closestSwara, centsOff;
        const ON_NOTE_THRESHOLD = 50;

        if (centsFromLower <= ON_NOTE_THRESHOLD) {
            status = 'on-note'; closestSwara = lowerSwara; centsOff = Math.round(centsFromLower);
        } else if (centsToUpper <= ON_NOTE_THRESHOLD) {
            status = 'on-note'; closestSwara = upperSwara; centsOff = -Math.round(centsToUpper);
        } else {
            const nearestSemitone = Math.round(interval);
            const isInScale = scaleIntervals.includes(nearestSemitone % 12);
            if (!isInScale && Math.abs(interval - nearestSemitone) < 0.3) {
                status = 'off-scale';
            } else {
                status = 'between';
            }
            closestSwara = centsFromLower < centsToUpper ? lowerSwara : upperSwara;
            centsOff = centsFromLower < centsToUpper ? Math.round(centsFromLower) : -Math.round(centsToUpper);
        }

        const addSaptakDot = (swar, saptakName) => {
            if (saptakName === 'mandra') return swar + '\u0323';
            if (saptakName === 'taar') return swar + '\u0307';
            if (saptakName === 'ati-taar') return swar + '\u0308';
            return swar;
        };

        return {
            frequency, exactMidi, interval,
            saptak, saptakLabel, saptakShort,
            lowerSwara, upperSwara, lowerInterval, upperInterval,
            position,
            centsFromLower: Math.round(centsFromLower),
            centsToUpper: Math.round(centsToUpper),
            status, closestSwara,
            closestSwaraDisplay: addSaptakDot(closestSwara, saptak),
            centsOff,
        };
    }, [rootMidi, scaleIntervals]);

    // Start/stop mic
    useEffect(() => {
        if (!isListening) {
            isActiveRef.current = false;
            if (scriptNodeRef.current) { scriptNodeRef.current.disconnect(); scriptNodeRef.current.onaudioprocess = null; scriptNodeRef.current = null; }
            if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') { audioCtxRef.current.close(); audioCtxRef.current = null; }
            if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
            setPitchInfo(null);
            return;
        }

        isActiveRef.current = true;

        const startMic = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
                });
                if (!isActiveRef.current) { stream.getTracks().forEach(t => t.stop()); return; }

                streamRef.current = stream;
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                audioCtxRef.current = audioCtx;
                const source = audioCtx.createMediaStreamSource(stream);

                const gainNode = audioCtx.createGain();
                gainNode.gain.value = 5;
                source.connect(gainNode);

                const scriptNode = audioCtx.createScriptProcessor(2048, 1, 1);
                scriptNodeRef.current = scriptNode;
                const detectPitch = YIN({ sampleRate: audioCtx.sampleRate, threshold: 0.15, probabilityThreshold: 0.05 });

                gainNode.connect(scriptNode);
                scriptNode.connect(audioCtx.destination);

                let recentFreqs = [];

                scriptNode.onaudioprocess = (e) => {
                    if (!isActiveRef.current) return;
                    const inputBuffer = e.inputBuffer.getChannelData(0);
                    let rms = 0;
                    for (let i = 0; i < inputBuffer.length; i++) rms += inputBuffer[i] * inputBuffer[i];
                    rms = Math.sqrt(rms / inputBuffer.length);

                    if (rms > 0.01) {
                        const frequency = detectPitch(inputBuffer);
                        if (frequency && frequency > 50 && frequency < 1200) {
                            recentFreqs.push(frequency);
                            if (recentFreqs.length > 3) recentFreqs.shift();
                            const sorted = [...recentFreqs].sort((a, b) => a - b);
                            const median = sorted[Math.floor(sorted.length / 2)];
                            setPitchInfo(analyzePitch(median));
                        } else { recentFreqs = []; setPitchInfo(null); }
                    } else { recentFreqs = []; setPitchInfo(null); }
                };
            } catch (err) {
                console.error("Failed to start mic for Sargam Practice:", err);
                setIsListening(false);
            }
        };

        startMic();
        return () => { isActiveRef.current = false; };
    }, [isListening, analyzePitch]);

    const getStatusColor = (status) => {
        switch (status) {
            case 'on-note': return { bg: 'from-emerald-500/30 to-emerald-600/10', border: 'border-emerald-500/60', text: 'text-emerald-400', glow: 'shadow-emerald-500/30' };
            case 'between': return { bg: 'from-amber-500/30 to-amber-600/10', border: 'border-amber-500/60', text: 'text-amber-400', glow: 'shadow-amber-500/30' };
            case 'off-scale': return { bg: 'from-red-500/30 to-red-600/10', border: 'border-red-500/60', text: 'text-red-400', glow: 'shadow-red-500/30' };
            default: return { bg: 'from-gray-500/30 to-gray-600/10', border: 'border-gray-700/50', text: 'text-gray-400', glow: '' };
        }
    };

    const statusColors = pitchInfo ? getStatusColor(pitchInfo.status) : getStatusColor(null);

    return (
        <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col overflow-hidden">
            {/* Top Bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-900/80 border-b border-gray-800/50 backdrop-blur-xl shrink-0">
                <div className="flex items-center gap-3">
                    <Music2 size={20} className="text-indigo-400" />
                    <span className="text-sm font-bold text-white tracking-wide">Sargam Practice</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <select value={rootKey} onChange={(e) => setRootKey(e.target.value)}
                            className="appearance-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs font-bold text-white cursor-pointer focus:outline-none focus:border-indigo-500 pr-7">
                            {NOTES.map(n => <option key={n} value={n}>Sa = {n}</option>)}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                    </div>
                    <div className="relative">
                        <select value={selectedScale} onChange={(e) => setSelectedScale(e.target.value)}
                            className="appearance-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs font-bold text-white cursor-pointer focus:outline-none focus:border-indigo-500 pr-7">
                            {Object.keys(SCALES).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition">
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col items-center justify-center gap-5 px-4">
                {/* Central Gauge */}
                <div className={`relative w-60 h-60 sm:w-72 sm:h-72 rounded-full border-4 ${statusColors.border} bg-gradient-to-br ${statusColors.bg} backdrop-blur-md shadow-2xl ${statusColors.glow} flex flex-col items-center justify-center transition-all duration-300`}>
                    {!isListening ? (
                        <div className="flex flex-col items-center gap-3 text-gray-500">
                            <MicOff size={48} />
                            <span className="text-sm font-medium">Tap to start</span>
                        </div>
                    ) : !pitchInfo ? (
                        <div className="flex flex-col items-center gap-3 text-indigo-400">
                            <Mic size={36} className="animate-pulse" />
                            <span className="text-sm font-medium">Listening...</span>
                            <span className="text-xs text-gray-500">Sing a note</span>
                        </div>
                    ) : (
                        <>
                            {/* Status */}
                            <div className={`absolute top-4 text-[10px] font-bold uppercase tracking-widest ${statusColors.text}`}>
                                {pitchInfo.status === 'on-note' && '✓ In Zone'}
                                {pitchInfo.status === 'between' && '↔ Between'}
                                {pitchInfo.status === 'off-scale' && '✗ Off Scale'}
                            </div>

                            {/* Saptak badge */}
                            <div className={`text-[10px] font-bold uppercase tracking-wider mt-1 px-2.5 py-0.5 rounded-full ${pitchInfo.saptak === 'mandra' ? 'bg-blue-500/20 text-blue-400' :
                                    pitchInfo.saptak === 'madhya' ? 'bg-indigo-500/20 text-indigo-400' :
                                        pitchInfo.saptak === 'taar' ? 'bg-purple-500/20 text-purple-400' :
                                            'bg-pink-500/20 text-pink-400'
                                }`}>
                                {pitchInfo.saptakLabel}
                            </div>

                            {/* Swara name with octave dot */}
                            <div className={`text-5xl sm:text-6xl font-black tracking-tight ${statusColors.text} drop-shadow-lg`}>
                                {pitchInfo.closestSwaraDisplay}
                            </div>

                            {/* Zone / Hz */}
                            <div className={`text-sm font-bold mt-0.5 ${pitchInfo.status === 'on-note' ? 'text-emerald-400' : 'text-gray-400'}`}>
                                {pitchInfo.status === 'on-note' ? '● In Zone' : `${Math.round(pitchInfo.frequency)} Hz`}
                            </div>

                            {/* Between bar */}
                            {pitchInfo.status === 'between' && (
                                <div className="flex items-center gap-2 mt-1.5">
                                    <span className="text-xs font-bold text-gray-300">{pitchInfo.lowerSwara}</span>
                                    <div className="w-20 h-1.5 bg-gray-800 rounded-full relative overflow-hidden">
                                        <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-100"
                                            style={{ width: `${Math.min(100, pitchInfo.position * 100)}%` }} />
                                    </div>
                                    <span className="text-xs font-bold text-gray-300">{pitchInfo.upperSwara}</span>
                                </div>
                            )}

                            {/* Frequency */}
                            <div className="absolute bottom-4 text-[10px] text-gray-500 font-mono">
                                {Math.round(pitchInfo.frequency)} Hz
                            </div>
                        </>
                    )}
                </div>

                {/* Mic Toggle */}
                <button onClick={() => setIsListening(prev => !prev)}
                    className={`px-8 py-3 rounded-2xl font-bold text-sm transition-all transform active:scale-95 ${isListening ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/30'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/30'}`}>
                    {isListening ? 'Stop Listening' : 'Start Practice'}
                </button>
            </div>

            {/* Bottom: 3-Saptak Scale Bar */}
            <div className="px-2 pb-3 shrink-0 overflow-x-auto hidden-scrollbar">
                <div className="flex flex-col gap-1 bg-gray-900/80 backdrop-blur-xl rounded-2xl p-2.5 border border-gray-800/50 max-w-2xl mx-auto">
                    {SAPTAKS.map(oct => (
                        <div key={oct.key} className="flex items-center gap-1">
                            <span className={`text-[8px] sm:text-[9px] font-bold ${oct.color} w-12 sm:w-14 text-right pr-1 shrink-0 uppercase tracking-wider`}>
                                {oct.name}
                            </span>
                            <div className="flex items-center gap-0.5 flex-1">
                                {SARGAM_ALL.map((swar, idx) => {
                                    const isInScale = scaleIntervals.includes(idx);
                                    const isThisSaptak = pitchInfo && pitchInfo.saptak === oct.key;
                                    const isActive = isThisSaptak && Math.abs(pitchInfo.interval - idx) < 0.5;
                                    const isClosest = isThisSaptak && pitchInfo.closestSwara === swar;

                                    return (
                                        <div key={idx}
                                            className={`flex items-center justify-center rounded transition-all duration-150 px-0.5 py-1 sm:px-1.5 min-w-[20px] sm:min-w-[28px] ${isActive ? 'bg-indigo-500 text-white scale-110 shadow-md shadow-indigo-500/40'
                                                    : isClosest ? `bg-gradient-to-br ${statusColors.bg} ${statusColors.border} border scale-105`
                                                        : isInScale ? `${oct.bg} text-gray-400 border border-gray-700/20`
                                                            : 'bg-gray-900/30 text-gray-700 opacity-30'}`}>
                                            <span className={`text-[7px] sm:text-[9px] font-bold leading-none ${isActive ? 'text-white' : isInScale ? 'text-gray-300' : 'text-gray-700'}`}>
                                                {oct.dotFn(swar)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SargamPractice;
