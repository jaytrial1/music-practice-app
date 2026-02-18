import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState, useMemo } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import SpectrogramPlugin from 'wavesurfer.js/dist/plugins/spectrogram.esm.js';
import { YIN } from 'pitchfinder';

// Note Helpers
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SARGAM_MAPPING = ["Sa", "re", "Re", "ga", "Ga", "Ma", "MA", "Pa", "dha", "Dha", "ni", "Ni"];

const AudioPlayer = forwardRef(({
    audioFile,
    isPlaying,
    playbackRate,
    volume,
    zoom,
    showSpectrogram,
    showSargam,
    rootKey,
    notationMode, // 'axis' or 'floating'
    onReady,
    onFinish,
    onRegionCreated,
    onPitchUpdate
}, ref) => {
    const containerRef = useRef(null);
    const spectrogramRef = useRef(null);
    const wavesurferRef = useRef(null);
    const regionsPluginRef = useRef(null);

    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState(null);
    const [pitchData, setPitchData] = useState([]);
    const [decodingDuration, setDecodingDuration] = useState(0);

    useImperativeHandle(ref, () => ({
        playPause: () => {
            if (isReady && wavesurferRef.current) wavesurferRef.current.playPause();
        },
        stop: () => {
            if (isReady && wavesurferRef.current) wavesurferRef.current.stop();
        },
        seekTo: (progress) => {
            if (isReady && wavesurferRef.current) wavesurferRef.current.seekTo(progress);
        },
        skipAuthorization: (seconds) => {
            if (isReady && wavesurferRef.current) wavesurferRef.current.skip(seconds);
        },
        addRegion: () => {
            if (isReady && wavesurferRef.current && regionsPluginRef.current) {
                const currentTime = wavesurferRef.current.getCurrentTime();
                regionsPluginRef.current.clearRegions();
                const region = regionsPluginRef.current.addRegion({
                    start: currentTime,
                    end: currentTime + 5,
                    content: 'Loop',
                    color: 'rgba(99, 102, 241, 0.3)',
                    drag: true,
                    resize: true,
                });
                onRegionCreated && onRegionCreated(region);
            }
        },
        clearRegions: () => {
            if (regionsPluginRef.current) regionsPluginRef.current.clearRegions();
        }
    }));

    // Helper: Convert frequency to Note
    const getNote = (frequency) => {
        if (!frequency) return null;
        const pitch = Math.round(69 + 12 * Math.log2(frequency / 440));
        const octave = Math.floor(pitch / 12) - 1;
        const noteIndex = pitch % 12;
        return NOTES[noteIndex] + octave;
    };

    // State for Visualization
    const [pitchSegments, setPitchSegments] = useState([]);

    // Helper: Convert frequency to MIDI
    const getMidi = (freq) => {
        if (!freq) return null;
        return Math.round(69 + 12 * Math.log2(freq / 440));
    };

    // Analyze Pitch & Generate Segments
    const analyzePitch = async (buffer) => {
        try {
            const detectPitch = YIN({ sampleRate: buffer.sampleRate });
            const channelData = buffer.getChannelData(0);
            const bufferSize = 2048;
            const pitches = [];

            const duration = buffer.duration;
            const timePerFrame = bufferSize / buffer.sampleRate;

            for (let i = 0; i < channelData.length; i += bufferSize) {
                const chunk = channelData.slice(i, i + bufferSize);
                const frequency = detectPitch(chunk);
                pitches.push(frequency);
            }

            setPitchData(pitches); // Keep for current note display
            setDecodingDuration(duration);

            // --- CONTINUOUS RIBBON LOGIC ---
            // Instead of grouping, we map every valid frame to a segment
            // This ensures no data is lost and the line is continuous
            const segments = [];

            for (let i = 0; i < pitches.length; i++) {
                const freq = pitches[i];

                // Basic noise gate
                if (!freq || freq < 60 || freq > 1100) {
                    continue;
                }

                segments.push({
                    startTime: i * timePerFrame,
                    endTime: (i + 1) * timePerFrame,
                    freq: freq
                });
            }

            setPitchSegments(segments);
            console.log("Pitch analysis complete. Frames:", segments.length);

        } catch (e) {
            console.error("Pitch analysis failed:", e);
        }
    };

    // Initialize WaveSurfer
    useEffect(() => {
        if (!containerRef.current || !audioFile) return;

        setIsReady(false);
        setError(null);
        setPitchData([]);

        let ws = null;
        let wsRegions = null;

        try {
            ws = WaveSurfer.create({
                container: containerRef.current,
                waveColor: '#4F46E5',
                progressColor: '#818CF8',
                cursorColor: '#C7D2FE',
                barWidth: 4,
                barGap: 3,
                barRadius: 4,
                height: 256, // Increased height for better graph visibility
                normalize: true,
                minPxPerSec: zoom || 50,
                fillParent: true,
                mediaControls: false,
                autoplay: false,
                interact: true,
                dragToSeek: true,
                hideScrollbar: false,
            });

            wsRegions = ws.registerPlugin(RegionsPlugin.create());
            regionsPluginRef.current = wsRegions;

            if (showSpectrogram && spectrogramRef.current) {
                ws.registerPlugin(SpectrogramPlugin.create({
                    container: spectrogramRef.current,
                    labels: true,
                    height: 100,
                    splitChannels: false,
                    frequencyMax: 8000
                }));
            }

            wavesurferRef.current = ws;

            ws.on('ready', () => {
                console.log("WaveSurfer Ready");
                setIsReady(true);
                onReady && onReady(ws.getDuration());

                const buffer = ws.getDecodedData();
                if (buffer) {
                    analyzePitch(buffer);
                }
            });

            ws.on('finish', () => onFinish && onFinish());

            ws.on('timeupdate', (currentTime) => {
                if (pitchData.length > 0 && decodingDuration > 0) {
                    const index = Math.floor((currentTime / decodingDuration) * pitchData.length);
                    const frequency = pitchData[index];
                    if (frequency) {
                        const note = getNote(frequency);
                        onPitchUpdate && onPitchUpdate({ frequency, note });
                    } else {
                        onPitchUpdate && onPitchUpdate(null);
                    }
                }
            });

            ws.on('error', (err) => {
                console.error("WaveSurfer Error:", err);
                let errMsg = "Failed to load audio";
                if (typeof err === 'string') errMsg = err;
                else if (err && err.name === 'AbortError') errMsg = "aborted";
                else if (err && err.message) errMsg = err.message;

                if (errMsg.toLowerCase().includes("aborted")) {
                    console.warn("Ignored abort error:", errMsg);
                    return;
                }
                setError(errMsg);
                setIsReady(false);
            });

            wsRegions.on('region-out', (region) => region.play());
            wsRegions.on('region-clicked', (region, e) => {
                e.stopPropagation();
                region.play();
            });

            if (typeof audioFile === 'string') {
                ws.load(audioFile);
            } else if (audioFile instanceof File) {
                const url = URL.createObjectURL(audioFile);
                ws.load(url);
            }

        } catch (e) {
            console.error("Initialization Error:", e);
            setError(`Failed to initialize player: ${e.message}`);
        }

        return () => {
            if (ws) {
                try { url && URL.revokeObjectURL(url); } catch (e) { }
                try { ws.destroy(); } catch (e) { console.warn("Error destroying wavesurfer:", e); }
            }
            wavesurferRef.current = null;
        };
    }, [audioFile, showSpectrogram]);

    // --- UNIFIED LOGIC: Pre-calculate Stable Notes ---
    const stableNotes = useMemo(() => {
        if (!pitchSegments.length) return [];

        const events = [];
        let currentRun = [];

        const processRun = (run) => {
            if (run.length === 0) return;

            const startTime = run[0].startTime;
            const endTime = run[run.length - 1].endTime;
            const duration = endTime - startTime;

            // "Secret Sauce": Duration Check > 150ms (0.15s)
            if (duration > 0.15) {
                const avgFreq = run.reduce((sum, s) => sum + s.freq, 0) / run.length;
                const midi = getMidi(avgFreq);
                const noteName = NOTES[midi % 12];
                const octave = Math.floor(midi / 12) - 1;
                const fullNote = `${noteName}${octave}`;

                let label = fullNote;
                // Pre-calculate Sargam Label
                if (showSargam && rootKey) {
                    const noteIndex = midi % 12; // midi % 12
                    const noteOnly = NOTES[midi % 12];
                    const rootIndex = NOTES.indexOf(rootKey);

                    if (rootIndex !== -1) {
                        let interval = (NOTES.indexOf(noteOnly) - rootIndex + 12) % 12;
                        label = SARGAM_MAPPING[interval]; // e.g. Sa
                    }
                }

                events.push({
                    startTime,
                    endTime,
                    avgFreq,
                    midi,
                    label, // e.g. "Sa" or "C4"
                    fullNote, // "C4" (for matching)
                    displayLabel: label // For Badge
                });
            }
        };

        for (let i = 0; i < pitchSegments.length; i++) {
            const seg = pitchSegments[i];

            // Check continuity with previous
            if (currentRun.length > 0) {
                const prev = currentRun[currentRun.length - 1];
                const prevMidi = getMidi(prev.freq);
                const currMidi = getMidi(seg.freq);

                // If same note and close in time (< 0.1s gap)
                if (prevMidi === currMidi && (seg.startTime - prev.endTime) < 0.1) {
                    currentRun.push(seg);
                } else {
                    processRun(currentRun);
                    currentRun = [seg];
                }
            } else {
                currentRun = [seg];
            }
        }
        processRun(currentRun);

        return events;
    }, [pitchSegments, showSargam, rootKey]);


    // Helper to calculate Y position (reused for Overlay)
    const getFreqY = (freq, height) => {
        const minFreq = 65.41;
        const maxFreq = 1046.50;
        const logMin = Math.log2(minFreq);
        const logMax = Math.log2(maxFreq);
        const scaleY = height / (logMax - logMin);
        const logFreq = Math.log2(freq);
        return height - ((logFreq - logMin) * scaleY);
    };

    const [activeNote, setActiveNote] = useState(null);

    // Live Pitch Tracking using Stable Notes
    useEffect(() => {
        if (!wavesurferRef.current || !isReady) return;
        const ws = wavesurferRef.current;

        const checkPitch = () => {
            const time = ws.getCurrentTime();
            // Find if we are inside a Stable Note Event
            const event = stableNotes.find(e => time >= e.startTime && time <= e.endTime);

            if (event) {
                setActiveNote(event.fullNote); // Highlight the Axis
                // Also update the main "Current Note" display
                if (onPitchUpdate) {
                    onPitchUpdate({ note: event.fullNote, frequency: event.avgFreq });
                }
            } else {
                setActiveNote(null);
                if (onPitchUpdate) onPitchUpdate(null);
            }
        };

        const interval = setInterval(checkPitch, 50); // check UI sync
        ws.on('audioprocess', checkPitch);
        ws.on('seeking', checkPitch);

        return () => {
            clearInterval(interval);
            ws.un('audioprocess', checkPitch);
            ws.un('seeking', checkPitch);
        };
    }, [isReady, stableNotes, onPitchUpdate]);


    // Pitch Graph Rendering
    useEffect(() => {
        if (!wavesurferRef.current || !isReady || pitchSegments.length === 0) return;

        const ws = wavesurferRef.current;
        const wrapper = ws.getWrapper();
        if (!wrapper) return;

        let canvas = wrapper.querySelector('.pitch-graph-canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.className = 'pitch-graph-canvas';
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.zIndex = '4';
            canvas.style.pointerEvents = 'none';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            wrapper.appendChild(canvas);
        }

        const ctx = canvas.getContext('2d');
        const width = wrapper.scrollWidth;
        const height = wrapper.clientHeight;

        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        } else {
            ctx.clearRect(0, 0, width, height);
        }

        // --- 1. DRAW FREQUENCY BANDS (Static Background) ---
        // Only draw bands. No text. No active highlighting (backgrounds are static).
        for (let midi = 36; midi <= 84; midi++) {
            const freqCenter = 440 * Math.pow(2, (midi - 69) / 12);
            const freqTop = freqCenter * Math.pow(2, 1 / 24);
            const freqBottom = freqCenter * Math.pow(2, -1 / 24);

            const yTop = getFreqY(freqTop, height);
            const yBottom = getFreqY(freqBottom, height);
            const bandHeight = Math.abs(yBottom - yTop);

            // Alternating faint bands
            ctx.fillStyle = midi % 2 === 0 ? "rgba(255, 255, 255, 0.03)" : "rgba(255, 255, 255, 0.01)";
            ctx.fillRect(0, yTop, width, bandHeight);

            // We removed the active logic from here to safe performance
        }

        // --- 2. DRAW PITCH LINE ---
        const duration = ws.getDuration();
        if (!duration) return;
        const pxPerSec = width / duration;

        // Glowing Green Curve
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#34D399';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#34D399';

        const drawSmoothCurve = (ctx, points, tension = 0.5) => {
            if (points.length < 2) return;
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            if (points.length === 2) {
                ctx.lineTo(points[1].x, points[1].y);
                ctx.stroke();
                return;
            }
            for (let i = 0; i < points.length - 1; i++) {
                const p0 = i > 0 ? points[i - 1] : points[0];
                const p1 = points[i];
                const p2 = points[i + 1];
                const p3 = i !== points.length - 2 ? points[i + 2] : p2;

                const cp1x = p1.x + (p2.x - p0.x) / 6 * tension;
                const cp1y = p1.y + (p2.y - p0.y) / 6 * tension;
                const cp2x = p2.x - (p3.x - p1.x) / 6 * tension;
                const cp2y = p2.y - (p3.y - p1.y) / 6 * tension;
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
            }
            ctx.stroke();
        };

        let currentPath = [];
        let allPaths = [];
        let lastEndTime = -1;

        for (let i = 0; i < pitchSegments.length; i++) {
            const seg = pitchSegments[i];
            const x = seg.startTime * pxPerSec;
            const y = getFreqY(seg.freq, height);

            if (currentPath.length > 0 && (seg.startTime - lastEndTime) < 3.0) {
                currentPath.push({ x, y });
            } else {
                if (currentPath.length > 0) allPaths.push(currentPath);
                currentPath = [{ x, y }];
            }
            lastEndTime = seg.endTime;
        }
        if (currentPath.length > 0) allPaths.push(currentPath);

        allPaths.forEach(path => {
            drawSmoothCurve(ctx, path, 1.0);
        });

        ctx.shadowBlur = 0;

        // Note: Floating Badges logic removed from here too? 
        // Wait, Floating Badges stick to the curve, so they scroll.
        // Canvas is best for scrolling items. 
        // If we move Badges to HTML, we need to position them absolutely with `left: px`
        // which might be fine, but having 1000 DOM nodes for badges is heavy.
        // So Badges should stay on Canvas.
        // BUT Badges don't depend on `activeNote`. They are static based on `stableNotes`.
        // So we can Keep Badges here!

        if (notationMode === 'floating' && stableNotes) {
            ctx.font = "bold 11px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            stableNotes.forEach(noteEvent => {
                const x = (noteEvent.startTime + (noteEvent.endTime - noteEvent.startTime) / 2) * pxPerSec;
                const y = getFreqY(noteEvent.avgFreq, height);

                const label = noteEvent.displayLabel.replace(/[0-9]/g, '');

                const padding = 6;
                const textWidth = ctx.measureText(label).width;
                const w = textWidth + padding * 2;
                const h = 18;

                ctx.fillStyle = "rgba(16, 185, 129, 0.9)";
                ctx.beginPath();
                ctx.roundRect(x - w / 2, y - h - 10, w, h, 4);
                ctx.fill();

                ctx.fillStyle = "white";
                ctx.fillText(label, x, y - 10 - h / 2);
            });
        }

    }, [pitchSegments, isReady, zoom, showSpectrogram, showSargam, rootKey, notationMode, stableNotes]); // Removed activeNote!

    // Watchers guarded by isReady
    useEffect(() => {
        if (!wavesurferRef.current || !isReady) return;
        try { wavesurferRef.current.zoom(zoom); } catch (e) { }
    }, [zoom, isReady]);

    useEffect(() => {
        if (!wavesurferRef.current || !isReady) return;
        try {
            const isPlayingInternal = wavesurferRef.current.isPlaying();
            if (isPlaying && !isPlayingInternal) wavesurferRef.current.play();
            if (!isPlaying && isPlayingInternal) wavesurferRef.current.pause();
        } catch (e) { }
    }, [isPlaying, isReady]);

    useEffect(() => {
        if (!wavesurferRef.current || !isReady) return;
        try { wavesurferRef.current.setPlaybackRate(playbackRate, true); } catch (e) { }
    }, [playbackRate, isReady]);

    useEffect(() => {
        if (!wavesurferRef.current || !isReady) return;
        try { wavesurferRef.current.setVolume(volume); } catch (e) { }
    }, [volume, isReady]);

    return (
        <div className="w-full bg-black/20 rounded-xl p-4 backdrop-blur-sm border border-white/10 relative min-h-[180px] flex flex-col justify-center gap-4">

            {/* Axis Overlay - Fixed Left */}
            {isReady && notationMode === 'axis' && (
                <div className="absolute top-4 bottom-[20px] left-4 w-12 z-20 pointer-events-none flex flex-col overflow-hidden" style={{ height: '256px' }}>
                    {/* We need to manually map the notes to divs given fixed height 256 */}
                    {/* Actually, wrapper height might vary? Default is 256. code says height: 256 */}
                    {/* Let's render the bands as absolute divs */}
                    {Array.from({ length: 49 }).map((_, i) => { // 49 semitones from 36 to 84 (inclusive?) 84-36 = 48
                        const midi = 36 + i;
                        const freqCenter = 440 * Math.pow(2, (midi - 69) / 12);
                        const freqTop = freqCenter * Math.pow(2, 1 / 24);
                        const freqBottom = freqCenter * Math.pow(2, -1 / 24);

                        const yTop = getFreqY(freqTop, 256); // Assuming fixed height 256
                        const yBottom = getFreqY(freqBottom, 256);
                        // yTop is smaller value (higher on screen) than yBottom (lower on screen)
                        // top position = yTop
                        // height = yBottom - yTop

                        const noteName = NOTES[midi % 12];
                        const octave = Math.floor(midi / 12) - 1;
                        const fullNote = `${noteName}${octave}`;

                        const isActive = activeNote === fullNote;

                        let label = fullNote;
                        let isSa = false;
                        if (showSargam && rootKey) {
                            const rootIndex = NOTES.indexOf(rootKey);
                            if (rootIndex !== -1) {
                                let interval = (midi % 12 - rootIndex + 12) % 12;
                                let swara = SARGAM_MAPPING[interval];
                                label = `${swara}${octave}`;
                                if (swara === "Sa") isSa = true;
                            }
                        }

                        // Only show Label if it's Sa or Active or every few notes?
                        // User wants all labels? "Label the stripes"
                        // If we show ALL labels, it's crowded. 
                        // Render logic:
                        if (!isActive && !isSa && midi % 2 !== 0) return null; // Show fewer labels when idle? 
                        // Or just show all.

                        return (
                            <div key={midi}
                                style={{
                                    position: 'absolute',
                                    top: `${yTop}px`,
                                    height: `${Math.abs(yBottom - yTop)}px`,
                                    left: 0,
                                    right: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    color: isActive ? '#34D399' : (isSa ? 'rgba(45, 212, 191, 0.8)' : 'rgba(255,255,255,0.2)'),
                                    fontWeight: isActive ? 'bold' : 'normal',
                                    fontSize: isActive ? '12px' : '10px',
                                    transition: 'all 0.1s ease'
                                }}>
                                {isActive && <span className="mr-1">►</span>}
                                {label}
                            </div>
                        )
                    })}
                </div>
            )}

            {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/90 z-20 rounded-xl p-6 text-center">
                    <p className="text-white font-bold text-lg mb-2">Unavailable</p>
                    <p className="text-red-200 text-sm">{error}</p>
                </div>
            )}

            {!isReady && !error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 z-10 rounded-xl">
                    <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                    <span className="text-indigo-300 text-sm font-medium">Processing Audio...</span>
                </div>
            )}

            {/* Waveform */}
            <div ref={containerRef} className="w-full" />

            {/* Spectrogram Container */}
            {showSpectrogram && (
                <div ref={spectrogramRef} className="w-full rounded-lg overflow-hidden border border-white/10 h-[100px]" />
            )}
        </div>
    );
});

export default AudioPlayer;
