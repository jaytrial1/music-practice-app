import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Music2, ChevronDown, Play, Square } from 'lucide-react';
import { YIN } from 'pitchfinder';

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SARGAM_ALL = ["Sa", "re", "Re", "ga", "Ga", "Ma", "MA", "Pa", "dha", "Dha", "ni", "Ni"];

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

const HOLD_DURATION = 3; // seconds per swara

const SargamPractice = ({ onClose }) => {
    const [rootKey, setRootKey] = useState("A");
    const [selectedScale, setSelectedScale] = useState("Asavari (Minor)");
    const [isRunning, setIsRunning] = useState(false);
    const [currentPitch, setCurrentPitch] = useState(null); // { frequency, interval }

    const canvasRef = useRef(null);
    const audioCtxRef = useRef(null);
    const scriptNodeRef = useRef(null);
    const streamRef = useRef(null);
    const isActiveRef = useRef(false);
    const startTimeRef = useRef(0);
    const animFrameRef = useRef(null);
    const pitchHistoryRef = useRef([]); // [{time, interval}]

    const scaleIntervals = useMemo(() => SCALES[selectedScale] || SCALES["Bilawal (Major)"], [selectedScale]);

    // Build the swaras for the Y-axis (only scale notes, ascending + upper Sa)
    const scaleSwars = useMemo(() => {
        const swars = scaleIntervals.map(i => ({ interval: i, name: SARGAM_ALL[i] }));
        // Add upper Sa (interval 12) for the full aaroh
        swars.push({ interval: 12, name: 'Sa\u0307' });
        return swars;
    }, [scaleIntervals]);

    // Generate exercise pattern: ascending then descending
    const exercisePattern = useMemo(() => {
        const ascending = scaleSwars.map(s => s.interval);
        const descending = [...ascending].reverse().slice(1); // skip duplicate top Sa
        return [...ascending, ...descending];
    }, [scaleSwars]);

    // Total exercise duration
    const totalDuration = exercisePattern.length * HOLD_DURATION;

    const rootMidi = useMemo(() => {
        const idx = NOTES.indexOf(rootKey);
        return 60 + idx;
    }, [rootKey]);

    // Convert frequency to fractional interval from Sa
    const freqToInterval = useCallback((frequency) => {
        if (!frequency || frequency < 50 || frequency > 1200) return null;
        const exactMidi = 69 + 12 * Math.log2(frequency / 440);
        const raw = ((exactMidi - rootMidi) % 12 + 12) % 12;
        // Handle upper octave: if close to 0 and we're in upper register, show as 12
        const semitonesFromRoot = exactMidi - rootMidi;
        if (semitonesFromRoot >= 10) return raw === 0 ? 12 : raw;
        return raw;
    }, [rootMidi]);

    // ---- MIC SETUP ----
    useEffect(() => {
        if (!isRunning) {
            isActiveRef.current = false;
            if (scriptNodeRef.current) { scriptNodeRef.current.disconnect(); scriptNodeRef.current.onaudioprocess = null; scriptNodeRef.current = null; }
            if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') { audioCtxRef.current.close(); audioCtxRef.current = null; }
            if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
            setCurrentPitch(null);
            return;
        }

        isActiveRef.current = true;
        startTimeRef.current = performance.now();
        pitchHistoryRef.current = [];

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

                    const elapsed = (performance.now() - startTimeRef.current) / 1000;

                    if (rms > 0.01) {
                        const frequency = detectPitch(inputBuffer);
                        if (frequency && frequency > 50 && frequency < 1200) {
                            recentFreqs.push(frequency);
                            if (recentFreqs.length > 3) recentFreqs.shift();
                            const sorted = [...recentFreqs].sort((a, b) => a - b);
                            const median = sorted[Math.floor(sorted.length / 2)];
                            const interval = freqToInterval(median);
                            if (interval !== null) {
                                setCurrentPitch({ frequency: median, interval });
                                pitchHistoryRef.current.push({ time: elapsed, interval });
                                // Keep last 60 seconds of data
                                while (pitchHistoryRef.current.length > 0 && pitchHistoryRef.current[0].time < elapsed - 60) {
                                    pitchHistoryRef.current.shift();
                                }
                            }
                        } else { recentFreqs = []; setCurrentPitch(null); }
                    } else { recentFreqs = []; setCurrentPitch(null); }
                };
            } catch (err) {
                console.error("Mic error:", err);
                setIsRunning(false);
            }
        };

        startMic();
        return () => { isActiveRef.current = false; };
    }, [isRunning, freqToInterval]);

    // ---- CANVAS RENDERING ----
    useEffect(() => {
        if (!isRunning || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let running = true;

        const render = () => {
            if (!running) return;

            // Responsive canvas size
            const rect = canvas.parentElement.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            canvas.style.width = rect.width + 'px';
            canvas.style.height = rect.height + 'px';
            ctx.scale(dpr, dpr);

            const W = rect.width;
            const H = rect.height;
            const LABEL_W = 50;
            const GRAPH_W = W - LABEL_W;
            const TOP_PAD = 10;
            const BOT_PAD = 20;
            const GRAPH_H = H - TOP_PAD - BOT_PAD;

            const elapsed = (performance.now() - startTimeRef.current) / 1000;
            const loopedTime = elapsed % totalDuration;

            // Y-axis: map interval to pixel Y
            const minInterval = 0;
            const maxInterval = 12;
            const intervalToY = (interval) => {
                const fraction = (interval - minInterval) / (maxInterval - minInterval);
                return TOP_PAD + GRAPH_H - fraction * GRAPH_H;
            };

            // X-axis: STATIC — all bars fill the full width
            // Time 0 = left edge (LABEL_W), totalDuration = right edge (W)
            const timeToX = (t) => LABEL_W + (t / totalDuration) * GRAPH_W;

            // Clear
            ctx.fillStyle = '#0a0a0f';
            ctx.fillRect(0, 0, W, H);

            // Draw Y-axis grid lines + labels
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            for (const swar of scaleSwars) {
                const y = intervalToY(swar.interval);
                ctx.strokeStyle = 'rgba(99, 102, 241, 0.12)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(LABEL_W, y);
                ctx.lineTo(W, y);
                ctx.stroke();
                ctx.fillStyle = '#a5b4fc';
                ctx.font = 'bold 11px Inter, system-ui, sans-serif';
                ctx.fillText(swar.name, LABEL_W - 6, y);
            }

            // Draw ALL target boxes (static, always visible)
            const boxHeight = GRAPH_H / (scaleSwars.length);

            for (let i = 0; i < exercisePattern.length; i++) {
                const targetInterval = exercisePattern[i];
                const boxStartTime = i * HOLD_DURATION;
                const boxEndTime = (i + 1) * HOLD_DURATION;

                const x1 = timeToX(boxStartTime);
                const x2 = timeToX(boxEndTime);
                const centerY = intervalToY(targetInterval);
                const halfBox = boxHeight * 0.45;

                const isCurrent = loopedTime >= boxStartTime && loopedTime < boxEndTime;
                const isPast = loopedTime >= boxEndTime;

                // Check if user is in zone
                let isInZone = false;
                if (isCurrent && currentPitch) {
                    isInZone = Math.abs(currentPitch.interval - targetInterval) < 0.8;
                }

                // Box colors
                if (isCurrent) {
                    ctx.fillStyle = isInZone ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.25)';
                    ctx.strokeStyle = isInZone ? 'rgba(16, 185, 129, 0.8)' : 'rgba(245, 158, 11, 0.6)';
                    ctx.lineWidth = 2.5;
                } else if (isPast) {
                    ctx.fillStyle = 'rgba(79, 70, 229, 0.06)';
                    ctx.strokeStyle = 'rgba(79, 70, 229, 0.15)';
                    ctx.lineWidth = 1;
                } else {
                    ctx.fillStyle = 'rgba(79, 70, 229, 0.12)';
                    ctx.strokeStyle = 'rgba(79, 70, 229, 0.3)';
                    ctx.lineWidth = 1;
                }

                ctx.fillRect(x1, centerY - halfBox, x2 - x1, halfBox * 2);
                ctx.strokeRect(x1, centerY - halfBox, x2 - x1, halfBox * 2);

                // Swara label inside box
                const boxW = x2 - x1;
                if (boxW > 15) {
                    ctx.fillStyle = isCurrent ? (isInZone ? '#34d399' : '#fbbf24') : (isPast ? '#4338ca40' : '#6366f1');
                    ctx.font = `bold ${isCurrent ? 13 : 10}px Inter, system-ui, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.fillText(SARGAM_ALL[targetInterval % 12] || 'Sa', x1 + boxW / 2, centerY + 1);
                }
            }

            // Draw pitch history (blue line) — on top of boxes
            const history = pitchHistoryRef.current;
            if (history.length > 1) {
                ctx.strokeStyle = '#60a5fa';
                ctx.lineWidth = 2.5;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';
                ctx.beginPath();
                let started = false;

                for (let i = 0; i < history.length; i++) {
                    const pt = history[i];
                    const drawTime = pt.time % totalDuration;
                    const x = timeToX(drawTime);
                    const y = intervalToY(pt.interval);

                    if (x < LABEL_W || x > W) continue;
                    if (!started) { ctx.moveTo(x, y); started = true; }
                    else { ctx.lineTo(x, y); }
                }
                ctx.stroke();

                // Glow
                ctx.strokeStyle = 'rgba(96, 165, 250, 0.25)';
                ctx.lineWidth = 6;
                ctx.stroke();
            }

            // Draw playhead (vertical line at current time)
            const playheadX = timeToX(loopedTime);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(playheadX, TOP_PAD);
            ctx.lineTo(playheadX, H - BOT_PAD);
            ctx.stroke();

            // Current pitch dot on playhead
            if (currentPitch) {
                const dotY = intervalToY(currentPitch.interval);
                ctx.beginPath();
                ctx.arc(playheadX, dotY, 7, 0, Math.PI * 2);
                ctx.fillStyle = '#60a5fa';
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            // Progress bar at very bottom
            const progress = loopedTime / totalDuration;
            ctx.fillStyle = 'rgba(79, 70, 229, 0.2)';
            ctx.fillRect(LABEL_W, H - 4, GRAPH_W, 4);
            ctx.fillStyle = '#6366f1';
            ctx.fillRect(LABEL_W, H - 4, GRAPH_W * progress, 4);

            // Current swara text (top right)
            const currentExIdx = Math.floor(loopedTime / HOLD_DURATION) % exercisePattern.length;
            const currentTarget = exercisePattern[currentExIdx];
            const targetName = SARGAM_ALL[currentTarget % 12] || 'Sa';
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 16px Inter, system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`Sing: ${targetName}`, W - 12, TOP_PAD + 18);

            animFrameRef.current = requestAnimationFrame(render);
        };

        animFrameRef.current = requestAnimationFrame(render);

        return () => {
            running = false;
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [isRunning, scaleSwars, exercisePattern, totalDuration, currentPitch]);

    return (
        <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col overflow-hidden">
            {/* Top Bar */}
            <div className="flex items-center justify-between px-3 py-2 bg-gray-900/80 border-b border-gray-800/50 backdrop-blur-xl shrink-0">
                <div className="flex items-center gap-2">
                    <Music2 size={18} className="text-indigo-400" />
                    <span className="text-sm font-bold text-white">Sargam Practice</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <select value={rootKey} onChange={(e) => setRootKey(e.target.value)}
                            className="appearance-none bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 text-xs font-bold text-white cursor-pointer focus:outline-none focus:border-indigo-500 pr-6">
                            {NOTES.map(n => <option key={n} value={n}>Sa={n}</option>)}
                        </select>
                        <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                    </div>
                    <div className="relative">
                        <select value={selectedScale} onChange={(e) => setSelectedScale(e.target.value)}
                            className="appearance-none bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 text-xs font-bold text-white cursor-pointer focus:outline-none focus:border-indigo-500 pr-6">
                            {Object.keys(SCALES).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                    </div>

                    {/* Start / Stop */}
                    <button onClick={() => setIsRunning(prev => !prev)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isRunning ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
                        {isRunning ? <><Square size={12} /> Stop</> : <><Play size={12} /> Start</>}
                    </button>

                    <button onClick={onClose} className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition">
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 relative">
                {!isRunning ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-gray-500">
                        <Music2 size={64} className="opacity-20" />
                        <p className="text-lg font-bold text-gray-600">Press Start to begin</p>
                        <p className="text-xs text-gray-600 max-w-sm text-center">
                            Sing each swara for {HOLD_DURATION}s. Keep your blue pitch line inside the target boxes!
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs">
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-indigo-600/30 border border-indigo-500/50"></span> Target</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-600/30 border border-emerald-500/50"></span> In Zone</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-400"></span> Your Voice</span>
                        </div>
                    </div>
                ) : (
                    <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
                )}
            </div>
        </div>
    );
};

export default SargamPractice;
