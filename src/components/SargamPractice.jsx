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
            const LABEL_W = 50; // Y-axis label width
            const GRAPH_W = W - LABEL_W;
            const TOP_PAD = 10;
            const BOT_PAD = 30;
            const GRAPH_H = H - TOP_PAD - BOT_PAD;

            const elapsed = (performance.now() - startTimeRef.current) / 1000;
            // Loop the exercise
            const loopedTime = elapsed % totalDuration;

            // How many seconds visible on screen
            const VISIBLE_SECS = 15;

            // Y-axis: map interval to pixel Y
            // scaleSwars goes from interval 0 (Sa) to interval 12 (upper Sa)
            const minInterval = 0;
            const maxInterval = 12;
            const intervalToY = (interval) => {
                const fraction = (interval - minInterval) / (maxInterval - minInterval);
                return TOP_PAD + GRAPH_H - fraction * GRAPH_H; // higher interval = higher on screen
            };

            // X-axis: time to pixel X
            // Current time is at right edge, past scrolls left
            const timeToX = (t) => {
                return LABEL_W + GRAPH_W - (loopedTime - t) * (GRAPH_W / VISIBLE_SECS);
            };

            // Clear
            ctx.fillStyle = '#0a0a0f';
            ctx.fillRect(0, 0, W, H);

            // Draw Y-axis grid lines + labels
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            for (const swar of scaleSwars) {
                const y = intervalToY(swar.interval);
                // Grid line
                ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(LABEL_W, y);
                ctx.lineTo(W, y);
                ctx.stroke();
                // Label
                ctx.fillStyle = '#a5b4fc';
                ctx.font = 'bold 11px Inter, system-ui, sans-serif';
                ctx.fillText(swar.name, LABEL_W - 6, y);
            }

            // Draw target boxes
            const boxHeight = GRAPH_H / (scaleSwars.length); // height per swara zone

            for (let i = 0; i < exercisePattern.length; i++) {
                const targetInterval = exercisePattern[i];
                const boxStartTime = i * HOLD_DURATION;
                const boxEndTime = (i + 1) * HOLD_DURATION;

                const x1 = timeToX(boxStartTime);
                const x2 = timeToX(boxEndTime);

                // Only draw if visible
                if (x2 < LABEL_W || x1 > W) continue;

                const centerY = intervalToY(targetInterval);
                const halfBox = boxHeight * 0.45;

                // Is this the current target?
                const isCurrent = loopedTime >= boxStartTime && loopedTime < boxEndTime;

                // Check if user was in zone during this box
                const relevantPitch = currentPitch;
                let isInZone = false;
                if (isCurrent && relevantPitch) {
                    const diff = Math.abs(relevantPitch.interval - targetInterval);
                    isInZone = diff < 0.8; // within ~80 cents
                }

                // Box color
                if (isCurrent) {
                    ctx.fillStyle = isInZone ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.25)';
                    ctx.strokeStyle = isInZone ? 'rgba(16, 185, 129, 0.8)' : 'rgba(245, 158, 11, 0.6)';
                } else {
                    ctx.fillStyle = 'rgba(79, 70, 229, 0.12)';
                    ctx.strokeStyle = 'rgba(79, 70, 229, 0.3)';
                }

                const drawX = Math.max(LABEL_W, x1);
                const drawW = Math.min(W, x2) - drawX;
                ctx.fillRect(drawX, centerY - halfBox, drawW, halfBox * 2);
                ctx.lineWidth = isCurrent ? 2 : 1;
                ctx.strokeRect(drawX, centerY - halfBox, drawW, halfBox * 2);

                // Swara label inside box
                if (drawW > 20) {
                    ctx.fillStyle = isCurrent ? (isInZone ? '#34d399' : '#fbbf24') : '#6366f1';
                    ctx.font = `bold ${isCurrent ? 14 : 11}px Inter, system-ui, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.fillText(SARGAM_ALL[targetInterval % 12] || 'Sa', drawX + drawW / 2, centerY + 1);
                }
            }

            // Draw pitch history (blue line)
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
                    // Adjust for looping
                    let drawTime = pt.time % totalDuration;
                    // Only draw points near current loop
                    const cycleDiff = Math.abs(drawTime - loopedTime);
                    if (cycleDiff > VISIBLE_SECS) continue;

                    const x = timeToX(drawTime);
                    const y = intervalToY(pt.interval);

                    if (x < LABEL_W || x > W) continue;

                    if (!started) { ctx.moveTo(x, y); started = true; }
                    else { ctx.lineTo(x, y); }
                }
                ctx.stroke();

                // Glow effect
                ctx.strokeStyle = 'rgba(96, 165, 250, 0.3)';
                ctx.lineWidth = 6;
                ctx.stroke();
            }

            // Draw current position line (vertical)
            const nowX = timeToX(loopedTime);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(nowX, TOP_PAD);
            ctx.lineTo(nowX, H - BOT_PAD);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw current pitch dot
            if (currentPitch) {
                const dotY = intervalToY(currentPitch.interval);
                ctx.beginPath();
                ctx.arc(nowX, dotY, 6, 0, Math.PI * 2);
                ctx.fillStyle = '#60a5fa';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            // Time labels at bottom
            ctx.fillStyle = '#6b7280';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            for (let t = Math.floor(loopedTime - VISIBLE_SECS); t <= Math.ceil(loopedTime + 1); t++) {
                if (t < 0) continue;
                const x = timeToX(t);
                if (x >= LABEL_W && x <= W) {
                    ctx.fillText(`${t}s`, x, H - 10);
                }
            }

            // Current swara indicator text (top right)
            const currentExIdx = Math.floor(loopedTime / HOLD_DURATION) % exercisePattern.length;
            const currentTarget = exercisePattern[currentExIdx];
            const targetName = SARGAM_ALL[currentTarget % 12] || 'Sa';
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 16px Inter, system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`Sing: ${targetName}`, W - 12, TOP_PAD + 20);

            // Progress bar at very bottom
            const progress = loopedTime / totalDuration;
            ctx.fillStyle = 'rgba(79, 70, 229, 0.3)';
            ctx.fillRect(LABEL_W, H - 4, GRAPH_W, 4);
            ctx.fillStyle = '#6366f1';
            ctx.fillRect(LABEL_W, H - 4, GRAPH_W * progress, 4);

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
