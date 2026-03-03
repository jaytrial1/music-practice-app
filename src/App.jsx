import React, { useState, useRef, useEffect, useCallback } from 'react';
import AudioPlayer from './components/AudioPlayer';
import Controls from './components/Controls';
import TestRecorder from './components/TestRecorder';
import PitchReferenceGuide from './components/PitchReferenceGuide';
import { Upload, Music, Mic2, Activity, Waves, Settings, Music2, Bug, Maximize2, Minimize2, Play, Pause, Rewind, FastForward, ZoomIn, ZoomOut, Flag, Trash2, PlayCircle, Pin, PinOff, Mic, MicOff, Info, Download, PlusSquare, PlaySquare, Repeat, Repeat1, XSquare, ArrowLeft, ArrowRight } from 'lucide-react';
import { YIN } from 'pitchfinder';

// Sargam Mapping Helpers
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SARGAM_MAPPING = ["Sa", "re", "Re", "ga", "Ga", "Ma", "MA", "Pa", "dha", "Dha", "ni", "Ni"];

function App() {
  const [showTestRecorder, setShowTestRecorder] = useState(false);
  const [audioFile, setAudioFile] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [zoom, setZoom] = useState(50);
  const [volume, setVolume] = useState(1);
  const [fileName, setFileName] = useState("");

  // Notation State
  const [showSpectrogram, setShowSpectrogram] = useState(false);
  const [showSargam, setShowSargam] = useState(true); // Default to Sargam as requested
  const [notationMode, setNotationMode] = useState('axis'); // 'axis' or 'floating'
  const [rootKey, setRootKey] = useState("C"); // Default Sa = C
  const [currentNote, setCurrentNote] = useState(null);
  const [isLiveMicEnabled, setIsLiveMicEnabled] = useState(false);
  const [showPitchGuide, setShowPitchGuide] = useState(false);

  const playerRef = useRef(null);
  const visualizerContainerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFsControls, setShowFsControls] = useState(true);
  const [autoHideEnabled, setAutoHideEnabled] = useState(true);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const fsTimerRef = useRef(null);

  // Sequence Looping State
  const [sequenceLoops, setSequenceLoops] = useState([]);
  const [isSequencePlaying, setIsSequencePlaying] = useState(false);
  const sequenceIndexRef = useRef(0);

  // Auto-hide fullscreen controls after 3 seconds
  const resetFsTimer = useCallback(() => {
    if (fsTimerRef.current) clearTimeout(fsTimerRef.current);
    setShowFsControls(true);
    if (autoHideEnabled) {
      fsTimerRef.current = setTimeout(() => setShowFsControls(false), 3000);
    }
  }, [autoHideEnabled]);

  // Click/tap handler for fullscreen — toggle controls
  const handleFsClick = useCallback((e) => {
    // Don't toggle if clicking a button or control
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;

    // If controls are pinned (auto-hide disabled), don't hide them when tapping the background
    if (!autoHideEnabled) return;

    if (showFsControls) {
      // Currently visible → hide immediately
      if (fsTimerRef.current) clearTimeout(fsTimerRef.current);
      setShowFsControls(false);
    } else {
      // Currently hidden → show + start auto-hide timer
      resetFsTimer();
    }
  }, [showFsControls, resetFsTimer, autoHideEnabled]);

  // Fullscreen toggle
  const toggleFullscreen = async () => {
    if (!visualizerContainerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await visualizerContainerRef.current.requestFullscreen();
        if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
          try {
            await window.screen.orientation.lock('landscape');
          } catch (e) {
            console.warn('Screen orientation lock failed:', e);
          }
        }
      } else {
        if (window.screen && window.screen.orientation && window.screen.orientation.unlock) {
          try {
            window.screen.orientation.unlock();
          } catch (e) {
            console.warn('Screen orientation unlock failed:', e);
          }
        }
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  };

  // Listen for fullscreen changes (e.g. ESC key)
  useEffect(() => {
    const handler = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);

      if (fs) {
        setShowFsControls(true);
        if (fsTimerRef.current) clearTimeout(fsTimerRef.current);
        if (autoHideEnabled) {
          fsTimerRef.current = setTimeout(() => setShowFsControls(false), 3000);
        }
      } else {
        // Unlocking on exit via ESC
        if (window.screen && window.screen.orientation && window.screen.orientation.unlock) {
          try {
            window.screen.orientation.unlock();
          } catch (e) {
            console.warn('Screen orientation unlock failed:', e);
          }
        }
      }
    };
    document.addEventListener('fullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      if (fsTimerRef.current) clearTimeout(fsTimerRef.current);
    };
  }, [autoHideEnabled]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAudioFile(file);
      setFileName(file.name);
      setIsPlaying(false);
      setCurrentNote(null);
    }
  };

  const togglePlay = () => {
    setIsPlaying(prev => !prev);
  };

  const handleSkipBackward = () => playerRef.current?.skipAuthorization(-5);
  const handleSkipForward = () => playerRef.current?.skipAuthorization(5);
  const handleAddRegion = () => playerRef.current?.addRegion();
  const handleClearRegions = () => {
    if (playerRef.current) playerRef.current.clearRegions();
  };

  const handleClearSequence = () => {
    if (playerRef.current) playerRef.current.clearSequenceRegions();
    setSequenceLoops([]);
    setIsSequencePlaying(false);
  };

  // Sequence Looping Toggle State
  const [isSequenceLoopOnlyOnce, setIsSequenceLoopOnlyOnce] = useState(false);

  const handleAddSequenceLoop = () => {
    if (!playerRef.current) return;
    const bounds = playerRef.current.saveActiveRegionAsSequence(sequenceLoops.length);
    if (bounds) {
      setSequenceLoops(prev => [...prev, bounds]);
    } else {
      alert("Please set a standard loop region first to save it to a sequence.");
    }
  };

  const handleRemoveSequenceItem = (indexToRemove) => {
    setSequenceLoops(prev => {
      const newLoops = prev.filter((_, idx) => idx !== indexToRemove);
      // Let's rely on a heavy-handed sync for now: clear all seq regions and re-add them 
      // so their IDs and labels (Seq 1, Seq 2) match the new array state.
      if (playerRef.current) {
        playerRef.current.clearSequenceRegions();
        // To avoid complex re-injection of regionsPlugin methods, we will just clear it entirely here,
        // but that wipes active-loop too if we aren't careful.
        // Let's implement a 'syncSequenceRegions' in AudioPlayer if we want to be safe,
        // or just rebuild the sequence regions cleanly.
        setTimeout(() => {
          if (playerRef.current) {
            playerRef.current.syncSequenceRegions(newLoops);
          }
        }, 50);
      }
      return newLoops;
    });
  };

  const handleReorderSequence = (oldIndex, newIndex) => {
    setSequenceLoops(prev => {
      const newLoops = [...prev];
      const item = newLoops.splice(oldIndex, 1)[0];
      newLoops.splice(newIndex, 0, item);

      if (playerRef.current) {
        playerRef.current.clearSequenceRegions();
        setTimeout(() => {
          if (playerRef.current) playerRef.current.syncSequenceRegions(newLoops);
        }, 50);
      }
      return newLoops;
    });
  };

  const handlePlaySequence = () => {
    if (sequenceLoops.length === 0 || !playerRef.current) return;
    setIsSequencePlaying(true);
    sequenceIndexRef.current = 0;
    const firstLoop = sequenceLoops[0];
    playerRef.current.playSequenceRegion(firstLoop.start, firstLoop.end);
    if (!isPlaying) {
      setIsPlaying(true);
    }
  };

  const handleSequenceLoopEnd = () => {
    if (!isSequencePlaying || sequenceLoops.length === 0 || !playerRef.current) return;

    const nextIndex = sequenceIndexRef.current + 1;
    if (nextIndex < sequenceLoops.length) {
      // Move to next loop in sequence
      sequenceIndexRef.current = nextIndex;
      const nextLoop = sequenceLoops[nextIndex];
      playerRef.current.playSequenceRegion(nextLoop.start, nextLoop.end);
    } else {
      // Sequence finished
      if (isSequenceLoopOnlyOnce) {
        setIsSequencePlaying(false);
        setIsPlaying(false);
        playerRef.current.stop();
      } else {
        // Loop the entire sequence again
        sequenceIndexRef.current = 0;
        const firstLoop = sequenceLoops[0];
        playerRef.current.playSequenceRegion(firstLoop.start, firstLoop.end);
      }
    }
  };

  // Recording Logic
  const [isRecording, setIsRecording] = useState(false);
  const [userAudioUrl, setUserAudioUrl] = useState(null);

  const handleRecordToggle = () => {
    if (isRecording) {
      // STOP — keep song playing so user can compare
      playerRef.current?.stopRecording();
      setIsRecording(false);
    } else {
      // START — song keeps playing, echoCancellation is forced OFF in AudioPlayer
      playerRef.current?.startRecording();
      setIsRecording(true);
      setUserAudioUrl(null);
      if (!isPlaying) setIsPlaying(true); // Play song to sing along
    }
  };

  const handleRecordingComplete = ({ blob }) => {
    const url = URL.createObjectURL(blob);
    setUserAudioUrl(url);
  };

  const handlePlayRecording = async () => {
    if (!userAudioUrl) return;
    // Pause song first so user only hears their recording
    if (isPlaying) setIsPlaying(false);
    try {
      // Use AudioContext so audio routes through headphones (not forced to speaker on mobile)
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const response = await fetch(userAudioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      source.start(0);
    } catch (e) {
      // Fallback to basic Audio element
      console.warn('AudioContext playback failed, using Audio element:', e);
      const audio = new Audio(userAudioUrl);
      audio.play();
    }
  };

  // Determine Display Note (Western vs Sargam)
  const getDisplayNote = (noteObj) => {
    if (!noteObj) return { main: "--", sub: "Listening...", colorClass: 'bg-gray-900/50 border-gray-800 grayscale opacity-80' };

    const { note, frequency } = noteObj; // note is like "C4", "F#3"

    // 1. Extract note name and octave
    const noteName = note.replace(/[0-9]/, ""); // "C#4" -> "C#"
    const octave = parseInt(note.replace(/[^0-9]/g, "")) || 4;

    // 2. Find index relative to Root Key
    const rootIndex = NOTES.indexOf(rootKey);
    const noteIndex = NOTES.indexOf(noteName);
    const interval = (rootIndex === -1 || noteIndex === -1) ? 0 : (noteIndex - rootIndex + 12) % 12;

    const isAchal = interval === 0 || interval === 7;
    const isVikrut = [1, 3, 6, 8, 10].includes(interval);

    // 3. Determine Color Class based on note type and octave
    const getStyleClasses = (isAchal, isVikrut, octave) => {
      let base = "";
      let text = "";
      let subText = "";

      if (octave < 4) { // Lower
        if (isAchal) { base = 'bg-blue-950 border-2 border-blue-800 shadow-[inset_0_0_15px_rgba(29,78,216,0.3)]'; text = 'text-blue-300'; subText = 'text-blue-500'; }
        else if (isVikrut) { base = 'bg-rose-950 border-2 border-rose-800 shadow-[inset_0_0_15px_rgba(190,18,60,0.3)]'; text = 'text-rose-300'; subText = 'text-rose-500'; }
        else { base = 'bg-emerald-950 border-2 border-emerald-800 shadow-[inset_0_0_15px_rgba(4,120,87,0.3)]'; text = 'text-emerald-300'; subText = 'text-emerald-500'; }
      } else if (octave > 4) { // Higher
        if (isAchal) { base = 'bg-blue-200 border-2 border-blue-100 shadow-[0_0_20px_rgba(191,219,254,0.6)]'; text = 'text-blue-900'; subText = 'text-blue-700'; }
        else if (isVikrut) { base = 'bg-rose-200 border-2 border-rose-100 shadow-[0_0_20px_rgba(254,205,211,0.6)]'; text = 'text-rose-900'; subText = 'text-rose-700'; }
        else { base = 'bg-emerald-200 border-2 border-emerald-100 shadow-[0_0_20px_rgba(167,243,208,0.6)]'; text = 'text-emerald-900'; subText = 'text-emerald-700'; }
      } else { // Middle
        if (isAchal) { base = 'bg-blue-600 border-2 border-blue-400 shadow-[0_0_15px_rgba(37,99,235,0.6)]'; text = 'text-white'; subText = 'text-blue-200'; }
        else if (isVikrut) { base = 'bg-rose-500 border-2 border-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.6)]'; text = 'text-white'; subText = 'text-rose-200'; }
        else { base = 'bg-emerald-500 border-2 border-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.6)]'; text = 'text-white'; subText = 'text-emerald-200'; }
      }
      return { base, text, subText };
    };

    const colors = getStyleClasses(isAchal, isVikrut, octave);

    if (!showSargam) {
      return { main: note, sub: `${Math.round(frequency)} Hz`, colors };
    }

    // Convert to Sargam
    let sargamNote = (rootIndex === -1 || noteIndex === -1) ? note : SARGAM_MAPPING[interval];

    // Add Octave Dots for Classical Notation
    if (octave < 4) sargamNote += "\u0323"; // Dot Below
    else if (octave > 4) sargamNote += "\u0307"; // Dot Above

    return { main: sargamNote, sub: `${note} / ${Math.round(frequency)} Hz`, colors };
  };

  const display = getDisplayNote(currentNote);

  // Download Notations Feature
  const handleDownloadNotations = () => {
    if (!playerRef.current) return;
    const stableNotes = playerRef.current.getStableNotes();
    if (!stableNotes || stableNotes.length === 0) {
      alert("No notations available to download. Please play the song to allow it to process the pitch.");
      return;
    }

    let csvContent = "Start Time (s),End Time (s),Duration (s),Note,Frequency (Hz)\n";
    stableNotes.forEach(note => {
      const duration = note.endTime - note.startTime;
      csvContent += `${note.startTime.toFixed(2)},${note.endTime.toFixed(2)},${duration.toFixed(2)},${note.label},${note.avgFreq.toFixed(1)}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `notations_${fileName ? fileName.replace(/\.[^/.]+$/, "") : 'track'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Live Mic Pitch Detection
  useEffect(() => {
    let audioCtx;
    let stream;
    let scriptNode;
    let isActive = true;

    const startMic = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });

        if (!isActive) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);

        // We use ScriptProcessorNode for wide compatibility and easy chunk access
        scriptNode = audioCtx.createScriptProcessor(2048, 1, 1);
        const detectPitch = YIN({
          sampleRate: audioCtx.sampleRate,
          threshold: 0.15,
          probabilityThreshold: 0.05
        });

        source.connect(scriptNode);
        scriptNode.connect(audioCtx.destination); // Required for script node to fire

        scriptNode.onaudioprocess = (e) => {
          if (!isActive) return;
          const inputBuffer = e.inputBuffer.getChannelData(0);

          // Noise Gate (ignore silent moments)
          let rms = 0;
          for (let i = 0; i < inputBuffer.length; i++) {
            rms += inputBuffer[i] * inputBuffer[i];
          }
          rms = Math.sqrt(rms / inputBuffer.length);

          if (rms > 0.01) { // Only detect if loud enough
            const frequency = detectPitch(inputBuffer);
            if (frequency && frequency > 50 && frequency < 1200) {
              // Convert frequency to note
              const pitch = Math.round(69 + 12 * Math.log2(frequency / 440));
              const octave = Math.floor(pitch / 12) - 1;
              const noteIndex = pitch % 12;
              const note = NOTES[noteIndex] + octave;

              setCurrentNote({ frequency, note });
            } else {
              setCurrentNote(null);
            }
          } else {
            setCurrentNote(null);
          }
        };

      } catch (err) {
        console.error("Failed to start live mic for Current Note:", err);
        setIsLiveMicEnabled(false);
      }
    };

    if (isLiveMicEnabled) {
      startMic();
    } else {
      setCurrentNote(null);
    }

    return () => {
      isActive = false;
      if (scriptNode) {
        scriptNode.disconnect();
        scriptNode.onaudioprocess = null;
      }
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close();
      }
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, [isLiveMicEnabled]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          handleSkipBackward();
          break;
        case 'ArrowRight':
          handleSkipForward();
          break;
        case 'KeyL':
          handleAddRegion();
          break;
        case 'KeyC':
          handleClearRegions();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans selection:bg-indigo-500 selection:text-white">

      {/* DIAGNOSTIC MODE OVERLAY */}
      {showTestRecorder && <TestRecorder onBack={() => setShowTestRecorder(false)} />}

      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 p-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg shadow-lg">
              <Mic2 size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
                Vocal Practice Pro
              </h1>
              <p className="text-xs text-gray-400">Master every note</p>
            </div>

            {/* DEBUG BUTTON */}
            <button
              onClick={() => setShowTestRecorder(true)}
              className="ml-4 p-1 rounded-full bg-gray-800 text-gray-500 hover:text-orange-500 hover:bg-gray-700 transition"
              title="Open Mic Diagnostic"
            >
              <Bug size={14} />
            </button>
          </div>

          <label className="cursor-pointer group">
            <input type="file" accept="audio/*" onChange={handleFileChange} className="hidden" />
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition group-hover:border-indigo-500/50">
              <Upload size={18} className="text-gray-400 group-hover:text-indigo-400 transition" />
              <span className="text-sm font-medium text-gray-300 group-hover:text-white transition">
                {fileName ? 'Change Song' : 'Upload Song'}
              </span>
            </div>
          </label>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">

        {!audioFile && (
          <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-gray-800 rounded-2xl bg-gray-900/50 text-center space-y-4">
            <div className="p-6 bg-gray-800 rounded-full animate-pulse">
              <Music size={48} className="text-gray-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-700">No Song Loaded</h2>
            <p className="text-gray-500 max-w-md">
              Upload a vocal track to start practicing. See waveforms, spectrograms, and real-time notes.
            </p>
            <label className="cursor-pointer px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-lg shadow-indigo-500/20 transition transform hover:scale-105 active:scale-95">
              Select Audio File
              <input type="file" accept="audio/*" onChange={handleFileChange} className="hidden" />
            </label>
          </div>
        )}

        {audioFile && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">

            {/* Controls Bar */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 px-2">
              <h2 className="text-lg font-medium text-white truncate max-w-xs" title={fileName}>{fileName}</h2>

              <div className="flex flex-wrap items-center gap-3">
                {/* Play Recording Toggle */}
                {userAudioUrl && (
                  <button
                    onClick={handlePlayRecording}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition bg-orange-600 text-white shadow-lg shadow-orange-500/20 hover:bg-orange-700"
                  >
                    <Mic2 size={16} />
                    <span>Play My Recording</span>
                  </button>
                )}

                {/* Settings Dropdown Button */}
                <div className="relative">
                  <button
                    onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition ${showSettingsMenu ? 'bg-indigo-600 text-white shadow-lg' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                  >
                    <Settings size={16} />
                    <span>Settings</span>
                  </button>

                  {/* Settings Dropdown Menu */}
                  {showSettingsMenu && (
                    <div className="absolute top-full left-0 mt-2 w-56 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2">
                      <div className="p-3 border-b border-gray-800 flex items-center justify-between">
                        <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Root Key (Sa)</span>
                        <select
                          value={rootKey}
                          onChange={(e) => setRootKey(e.target.value)}
                          className="bg-gray-800 text-indigo-400 font-bold px-2 py-1 flex-1 ml-3 rounded-md focus:outline-none cursor-pointer text-sm"
                        >
                          {NOTES.map(note => (
                            <option key={note} value={note} className="bg-gray-900">{note}</option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={() => setShowSargam(!showSargam)}
                        className={`flex items-center gap-3 w-full p-3 text-left transition text-sm font-medium ${showSargam ? 'bg-indigo-600/20 text-indigo-300' : 'text-gray-300 hover:bg-gray-800'}`}
                      >
                        <Music2 size={16} />
                        <span>Sargam Notation</span>
                        <div className={`ml-auto w-8 h-4 rounded-full transition-colors relative ${showSargam ? 'bg-indigo-500' : 'bg-gray-700'}`}>
                          <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${showSargam ? 'translate-x-4' : 'translate-x-0'}`} />
                        </div>
                      </button>

                      <button
                        onClick={() => setShowSpectrogram(!showSpectrogram)}
                        className={`flex items-center gap-3 w-full p-3 text-left transition text-sm font-medium ${showSpectrogram ? 'bg-purple-600/20 text-purple-300' : 'text-gray-300 hover:bg-gray-800'}`}
                      >
                        <Waves size={16} />
                        <span>Spectrogram</span>
                        <div className={`ml-auto w-8 h-4 rounded-full transition-colors relative ${showSpectrogram ? 'bg-purple-500' : 'bg-gray-700'}`}>
                          <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${showSpectrogram ? 'translate-x-4' : 'translate-x-0'}`} />
                        </div>
                      </button>

                      <button
                        onClick={() => setNotationMode(prev => prev === 'axis' ? 'floating' : 'axis')}
                        className={`flex items-center gap-3 w-full p-3 text-left transition text-sm font-medium ${notationMode === 'floating' ? 'bg-amber-500/20 text-amber-300' : 'text-gray-300 hover:bg-gray-800'}`}
                      >
                        <Activity size={16} />
                        <span>Floating Mode</span>
                        <div className={`ml-auto w-8 h-4 rounded-full transition-colors relative ${notationMode === 'floating' ? 'bg-amber-500' : 'bg-gray-700'}`}>
                          <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${notationMode === 'floating' ? 'translate-x-4' : 'translate-x-0'}`} />
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                {/* Download Notations Button */}
                <button
                  onClick={handleDownloadNotations}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition bg-emerald-600/90 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                  title="Download Notations (CSV)"
                >
                  <Download size={16} />
                  <span className="hidden sm:inline">Export Notes</span>
                </button>
              </div>
            </div>

            {/* NOTE DISPLAY - The "Caroke" Feature */}
            <div className="flex justify-center">
              <div className={`
                        relative flex flex-col items-center justify-center w-full md:w-64 h-32 rounded-2xl border transition-all duration-300
                        ${isLiveMicEnabled
                  ? (currentNote ? `shadow-2xl scale-105 ${display.colors.base}` : 'bg-indigo-900/40 border-indigo-500/30 shadow-inner')
                  : 'bg-gray-900/50 border-gray-800 grayscale opacity-80'}
                    `}>
                <div className="absolute top-3 left-4 flex items-center gap-2">
                  <span className="text-xs font-bold tracking-wider text-white/50 uppercase">Live Pitch</span>
                  <button
                    onClick={() => setShowPitchGuide(true)}
                    className="text-indigo-400/50 hover:text-indigo-300 transition-colors"
                  >
                    <Info size={14} />
                  </button>
                </div>

                <button
                  onClick={() => setIsLiveMicEnabled(!isLiveMicEnabled)}
                  className={`absolute top-2 right-2 p-1.5 rounded-lg transition-colors border ${isLiveMicEnabled ? 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30' : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-white hover:bg-gray-700'}`}
                  title={isLiveMicEnabled ? "Disable Live Pitch" : "Enable Live Pitch"}
                >
                  {isLiveMicEnabled ? <Mic size={14} /> : <MicOff size={14} />}
                </button>

                {!isLiveMicEnabled ? (
                  <div className="text-gray-500 text-sm font-medium mt-2">Mic Disabled</div>
                ) : currentNote ? (
                  <>
                    <div className={`text-5xl font-black tracking-tighter drop-shadow-lg mt-2 ${display.colors.text}`}>
                      {display.main}
                    </div>
                    <div className={`text-sm font-mono mt-1 ${display.colors.subText}`}>
                      {display.sub}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center text-indigo-400 gap-2 mt-4">
                    <Activity size={24} className="animate-pulse" />
                    <span className="text-sm">Listening...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Visualizer + Controls Fullscreen Container */}
            <div
              ref={visualizerContainerRef}
              className={`${isFullscreen ? 'bg-gray-950 flex flex-col h-screen relative cursor-pointer' : ''}`}
              onClick={isFullscreen ? handleFsClick : undefined}
            >
              {/* Visualizer */}
              <div className={`border border-gray-700 rounded-xl overflow-hidden bg-gray-900/50 relative ${isFullscreen ? 'flex-1 border-0 rounded-none h-full' : 'min-h-[200px]'}`}>
                {/* Non-fullscreen: simple expand button */}
                {!isFullscreen && (
                  <button
                    onClick={toggleFullscreen}
                    className="absolute top-2 right-2 z-10 p-2 bg-gray-800/80 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition backdrop-blur-sm"
                    title="Fullscreen"
                  >
                    <Maximize2 size={18} />
                  </button>
                )}
                <AudioPlayer
                  ref={playerRef}
                  audioFile={audioFile}
                  isPlaying={isPlaying}
                  playbackRate={playbackRate}
                  volume={volume}
                  zoom={zoom}
                  showSpectrogram={showSpectrogram}
                  showSargam={showSargam}
                  rootKey={rootKey}
                  notationMode={notationMode}
                  isFullscreen={isFullscreen}
                  onFinish={() => setIsPlaying(false)}
                  onRecordingComplete={handleRecordingComplete}
                  onSequenceLoopEnd={isSequencePlaying ? handleSequenceLoopEnd : undefined}
                />
              </div>

              {/* ===== FULLSCREEN OVERLAY CONTROLS (YouTube-style) ===== */}
              {isFullscreen && (
                <>
                  {/* TOP-LEFT: Settings Menu (Fullscreen) */}
                  <div className={`absolute top-4 left-4 z-20 transition-all duration-300 ${showFsControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
                    <div className="relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowSettingsMenu(!showSettingsMenu); resetFsTimer(); }}
                        className={`flex items-center justify-center w-10 h-10 rounded-xl transition backdrop-blur-md shadow-lg ${showSettingsMenu ? 'bg-indigo-600/90 text-white' : 'bg-gray-900/80 text-gray-300 hover:bg-gray-800/90 border border-gray-700/50'}`}
                      >
                        <Settings size={20} className={showSettingsMenu ? "animate-spin-slow" : ""} />
                      </button>

                      {/* Settings Dropdown Menu */}
                      {showSettingsMenu && (
                        <div onClick={(e) => e.stopPropagation()} className="absolute top-12 left-0 w-64 bg-gray-900/95 backdrop-blur-xl border border-gray-700 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2">
                          <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-800/30">
                            <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Root Key (Sa)</span>
                            <select
                              value={rootKey}
                              onChange={(e) => { setRootKey(e.target.value); resetFsTimer(); }}
                              className="bg-gray-800 text-indigo-400 font-bold px-3 py-1.5 flex-1 ml-4 rounded-lg focus:outline-none cursor-pointer text-sm border border-gray-700 focus:border-indigo-500 transition-colors"
                            >
                              {NOTES.map(note => (
                                <option key={note} value={note} className="bg-gray-900">{note}</option>
                              ))}
                            </select>
                          </div>

                          <button
                            onClick={() => { setShowSargam(!showSargam); resetFsTimer(); }}
                            className={`flex items-center gap-3 w-full p-4 text-left transition font-medium border-b border-gray-800/50 ${showSargam ? 'bg-indigo-600/10 text-indigo-300' : 'text-gray-300 hover:bg-gray-800/80'}`}
                          >
                            <Music2 size={18} className={showSargam ? 'text-indigo-400' : 'text-gray-500'} />
                            <span>Sargam Notation</span>
                            <div className={`ml-auto w-10 h-5 rounded-full transition-colors relative ${showSargam ? 'bg-indigo-500' : 'bg-gray-700'}`}>
                              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${showSargam ? 'translate-x-5' : 'translate-x-0'}`} />
                            </div>
                          </button>

                          <button
                            onClick={() => { setShowSpectrogram(!showSpectrogram); resetFsTimer(); }}
                            className={`flex items-center gap-3 w-full p-4 text-left transition font-medium border-b border-gray-800/50 ${showSpectrogram ? 'bg-purple-600/10 text-purple-300' : 'text-gray-300 hover:bg-gray-800/80'}`}
                          >
                            <Waves size={18} className={showSpectrogram ? 'text-purple-400' : 'text-gray-500'} />
                            <span>Spectrogram</span>
                            <div className={`ml-auto w-10 h-5 rounded-full transition-colors relative ${showSpectrogram ? 'bg-purple-500' : 'bg-gray-700'}`}>
                              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${showSpectrogram ? 'translate-x-5' : 'translate-x-0'}`} />
                            </div>
                          </button>

                          <button
                            onClick={() => { setNotationMode(prev => prev === 'axis' ? 'floating' : 'axis'); resetFsTimer(); }}
                            className={`flex items-center gap-3 w-full p-4 text-left transition font-medium ${notationMode === 'floating' ? 'bg-amber-500/10 text-amber-300' : 'text-gray-300 hover:bg-gray-800/80'}`}
                          >
                            <Activity size={18} className={notationMode === 'floating' ? 'text-amber-400' : 'text-gray-500'} />
                            <span>Floating Mode</span>
                            <div className={`ml-auto w-10 h-5 rounded-full transition-colors relative ${notationMode === 'floating' ? 'bg-amber-500' : 'bg-gray-700'}`}>
                              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${notationMode === 'floating' ? 'translate-x-5' : 'translate-x-0'}`} />
                            </div>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* TOP-CENTER: Zoom Controls */}
                  <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-20 transition-all duration-300 ${showFsControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
                    <div className="flex items-center gap-4 bg-gray-900/90 backdrop-blur-xl px-4 py-2 rounded-xl border border-gray-700/50 shadow-xl">
                      <button
                        onClick={(e) => { e.stopPropagation(); setZoom(z => Math.max(10, z - 30)); resetFsTimer(); }}
                        className="p-1 text-gray-400 hover:text-white transition"
                      >
                        <ZoomOut size={16} />
                      </button>
                      <span className="text-xs text-gray-500 font-bold tracking-wider uppercase">Zoom</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setZoom(z => Math.min(500, z + 30)); resetFsTimer(); }}
                        className="p-1 text-gray-400 hover:text-white transition"
                      >
                        <ZoomIn size={16} />
                      </button>
                    </div>
                  </div>

                  {/* TOP-RIGHT: Pin Controls & Exit Fullscreen */}
                  <div className={`absolute top-4 right-4 z-20 flex items-center gap-2 transition-all duration-300 ${showFsControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setAutoHideEnabled(!autoHideEnabled);
                        if (!autoHideEnabled && fsTimerRef.current) {
                          // If turning on auto-hide, start the timer
                          fsTimerRef.current = setTimeout(() => setShowFsControls(false), 3000);
                        } else if (fsTimerRef.current) {
                          // If turning off auto-hide, clear the timer
                          clearTimeout(fsTimerRef.current);
                        }
                      }}
                      className={`p-2 rounded-lg transition backdrop-blur-md ${!autoHideEnabled ? 'bg-indigo-600/90 text-white' : 'bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-white'}`}
                      title={!autoHideEnabled ? "Controls Pinned (Always Show)" : "Controls Auto-Hide"}
                    >
                      {!autoHideEnabled ? <Pin size={20} /> : <PinOff size={20} />}
                    </button>

                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                      className="p-2 bg-gray-800/80 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition backdrop-blur-md"
                      title="Exit Fullscreen"
                    >
                      <Minimize2 size={20} />
                    </button>
                  </div>

                  {/* FULLSCREEN CURRENT NOTE DISPLAY */}
                  <div className={`absolute left-8 bottom-32 z-20 transition-all duration-300 ${!isLiveMicEnabled ? 'pointer-events-auto' : 'pointer-events-none'} ${showFsControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                    <div className={`
                        relative flex flex-col items-center justify-center w-40 h-24 rounded-2xl border backdrop-blur-md shadow-2xl
                        ${isLiveMicEnabled
                        ? (currentNote ? display.colors.base : 'bg-indigo-900/40 border-indigo-500/30')
                        : 'bg-gray-900/50 border-gray-700/50 grayscale opacity-80'
                      }
                    `}>
                      <div className="absolute top-2 left-3 text-[10px] items-center flex gap-1 font-bold tracking-wider text-white/50 uppercase pointer-events-auto">
                        <span>Live Pitch</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowPitchGuide(true); }}
                          className="text-indigo-400/50 hover:text-indigo-300 transition-colors"
                        >
                          <Info size={12} />
                        </button>
                      </div>

                      <button
                        onClick={(e) => { e.stopPropagation(); setIsLiveMicEnabled(!isLiveMicEnabled); }}
                        className={`absolute top-2 right-2 p-1 rounded-lg transition-colors border pointer-events-auto ${isLiveMicEnabled ? 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30' : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-white hover:bg-gray-700'}`}
                        title={isLiveMicEnabled ? "Disable Live Pitch" : "Enable Live Pitch"}
                      >
                        {isLiveMicEnabled ? <Mic size={12} /> : <MicOff size={12} />}
                      </button>

                      {!isLiveMicEnabled ? (
                        <div className="text-gray-500 text-xs font-medium mt-3 pointer-events-none">Mic Disabled</div>
                      ) : currentNote ? (
                        <>
                          <div className={`text-4xl font-black tracking-tighter drop-shadow-lg mt-2 pointer-events-none ${display.colors.text}`}>
                            {display.main}
                          </div>
                          <div className={`text-xs font-mono mt-0.5 pointer-events-none ${display.colors.subText}`}>
                            {display.sub}
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center text-indigo-400 gap-1.5 mt-3 pointer-events-none">
                          <Activity size={18} className="animate-pulse" />
                          <span className="text-xs">Listening...</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* BOTTOM-CENTER: Main Controls */}
                  <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-3 transition-all duration-300 ${showFsControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>

                    {/* Main Actions (Bottom Row) */}
                    <div className="flex items-center gap-4 bg-gray-900/90 backdrop-blur-xl px-6 py-3 rounded-2xl border border-gray-700/50 shadow-2xl">

                      {/* Speed Control (Moved to Left) */}
                      <div className="flex items-center gap-1.5 bg-gray-800/80 px-2 py-1.5 rounded-xl border border-gray-700/50">
                        <span className="text-[10px] text-gray-400 font-bold uppercase ml-1 mr-1 hidden sm:inline">Speed</span>
                        {[0.5, 0.75, 1, 1.25, 1.5].map(rate => (
                          <button
                            key={rate}
                            onClick={(e) => { e.stopPropagation(); setPlaybackRate(rate); resetFsTimer(); }}
                            className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${playbackRate === rate ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>

                      {/* Divider */}
                      <div className="w-px h-8 bg-gray-700 mx-1 hidden sm:block"></div>

                      {/* Playback Controls (Moved to Middle) */}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSkipBackward(); resetFsTimer(); }}
                          className="p-2 text-gray-400 hover:text-white transition"
                        >
                          <Rewind size={20} />
                        </button>

                        <button
                          onClick={(e) => { e.stopPropagation(); togglePlay(); resetFsTimer(); }}
                          className={`p-4 rounded-full transition shadow-lg ${isPlaying ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
                        >
                          {isPlaying ? <Pause size={24} fill="white" /> : <Play size={24} fill="white" className="ml-0.5" />}
                        </button>

                        <button
                          onClick={(e) => { e.stopPropagation(); handleRecordToggle(); resetFsTimer(); }}
                          className={`p-3 rounded-full transition ${isRecording ? 'bg-red-600 animate-pulse ring-4 ring-red-500/30' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
                        >
                          <Mic2 size={20} />
                        </button>

                        {/* Play My Recording */}
                        {userAudioUrl && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handlePlayRecording(); resetFsTimer(); }}
                            className="p-3 bg-orange-600 hover:bg-orange-700 rounded-full transition text-white shadow-lg"
                            title="Play My Recording"
                          >
                            <PlayCircle size={20} />
                          </button>
                        )}

                        <button
                          onClick={(e) => { e.stopPropagation(); handleSkipForward(); resetFsTimer(); }}
                          className="p-2 text-gray-400 hover:text-white transition"
                        >
                          <FastForward size={20} />
                        </button>
                      </div>

                      {/* Divider */}
                      <div className="w-px h-8 bg-gray-700 mx-1 hidden sm:block"></div>

                      {/* Loop Controls (Right) */}
                      <div className="flex flex-col sm:flex-row items-center gap-2">
                        {/* Standard Loop */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAddRegion(); resetFsTimer(); }}
                            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 border border-indigo-500 hover:bg-indigo-500 rounded-xl text-white text-xs font-bold transition shadow-md"
                            title="Set Loop"
                          >
                            <Flag size={14} />
                            <span>Loop</span>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleClearRegions(); resetFsTimer(); }}
                            className="p-2 bg-gray-800/80 hover:bg-red-900/80 rounded-xl border border-gray-700/50 hover:border-red-500/50 text-gray-400 hover:text-red-300 transition"
                            title="Clear Loops"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        {/* Sequence Loop */}
                        <div className="flex flex-col sm:border-l border-gray-700 sm:pl-2 gap-2">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAddSequenceLoop(); resetFsTimer(); }}
                              className="flex items-center gap-1 px-3 py-2 bg-amber-600 hover:bg-amber-500 rounded-xl text-white text-xs font-bold transition shadow-md"
                              title="Save current loop to sequence"
                            >
                              <PlusSquare size={14} />
                              <span>Save({sequenceLoops.length})</span>
                            </button>

                            <button
                              onClick={(e) => { e.stopPropagation(); setIsSequenceLoopOnlyOnce(!isSequenceLoopOnlyOnce); resetFsTimer(); }}
                              className={`p-2 rounded-xl border transition ${!isSequenceLoopOnlyOnce ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-gray-800 border-gray-700 text-gray-500 hover:bg-gray-700'}`}
                              title={isSequenceLoopOnlyOnce ? "Play Once (Click to Loop)" : "Loop Infinitely (Click to Play Once)"}
                            >
                              {!isSequenceLoopOnlyOnce ? <Repeat size={14} /> : <Repeat1 size={14} />}
                            </button>

                            <button
                              onClick={(e) => { e.stopPropagation(); handlePlaySequence(); resetFsTimer(); }}
                              disabled={sequenceLoops.length === 0}
                              className={`flex items-center gap-1 px-3 py-2 rounded-xl text-white text-xs font-bold transition shadow-md ${sequenceLoops.length > 0
                                ? (isSequencePlaying ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 'bg-emerald-600 hover:bg-emerald-500')
                                : 'bg-gray-700 text-gray-500 opacity-50 cursor-not-allowed'
                                }`}
                              title="Play Sequence"
                            >
                              <PlaySquare size={14} />
                              <span className="hidden sm:inline">Play</span>
                            </button>

                            {sequenceLoops.length > 0 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleClearSequence(); resetFsTimer(); }}
                                className="p-2 bg-gray-800/80 hover:bg-red-900/80 rounded-xl border border-gray-700/50 hover:border-red-500/50 text-gray-400 hover:text-red-300 transition"
                                title="Clear Sequence"
                              >
                                <XSquare size={16} />
                              </button>
                            )}
                          </div>

                          {/* Sequence Reorder UI Fullscreen */}
                          {sequenceLoops.length > 0 && (
                            <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-[250px] sm:max-w-xs hidden-scrollbar pt-1">
                              {sequenceLoops.map((loop, idx) => (
                                <div key={idx} className="flex flex-col items-center min-w-max bg-gray-900/80 rounded border border-gray-700 p-1 gap-1">
                                  <div className="flex items-center justify-between w-full px-1">
                                    <span className="text-[10px] text-amber-500 font-bold">Seq {idx + 1}</span>
                                    <button onClick={(e) => { e.stopPropagation(); handleRemoveSequenceItem(idx); resetFsTimer(); }} className="text-gray-500 hover:text-red-400 p-0.5">
                                      <XSquare size={12} />
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleReorderSequence(idx, idx - 1); resetFsTimer(); }}
                                      disabled={idx === 0}
                                      className="p-1 bg-gray-800 rounded hover:bg-amber-600 hover:text-white disabled:opacity-30 transition"
                                    >
                                      <ArrowLeft size={10} />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleReorderSequence(idx, idx + 1); resetFsTimer(); }}
                                      disabled={idx === sequenceLoops.length - 1}
                                      className="p-1 bg-gray-800 rounded hover:bg-amber-600 hover:text-white disabled:opacity-30 transition"
                                    >
                                      <ArrowRight size={10} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Non-fullscreen Controls */}
              {!isFullscreen && (
                <Controls
                  isPlaying={isPlaying}
                  onTogglePlay={togglePlay}
                  playbackRate={playbackRate}
                  onPlaybackRateChange={setPlaybackRate}
                  onAddRegion={handleAddRegion}
                  onClearRegions={handleClearRegions}
                  zoom={zoom}
                  onZoomChange={setZoom}
                  onSkipBackward={handleSkipBackward}
                  onSkipForward={handleSkipForward}
                  isRecording={isRecording}
                  onRecordToggle={handleRecordToggle}
                  userAudioUrl={userAudioUrl}
                  onPlayRecording={handlePlayRecording}
                  sequenceLoops={sequenceLoops}
                  onAddSequenceLoop={handleAddSequenceLoop}
                  onPlaySequence={handlePlaySequence}
                  isSequencePlaying={isSequencePlaying}
                  onClearSequence={handleClearSequence}
                  isSequenceLoopOnlyOnce={isSequenceLoopOnlyOnce}
                  setIsSequenceLoopOnlyOnce={setIsSequenceLoopOnlyOnce}
                  onRemoveSequenceItem={handleRemoveSequenceItem}
                  onReorderSequence={handleReorderSequence}
                />
              )}
            </div> {/* End Fullscreen Container */}
          </div>
        )}

      </main>

      {/* Footer Instructions */}
      {audioFile && (
        <div className="max-w-6xl mx-auto px-8 pb-12 opacity-50 text-xs text-center">
          <p className="text-gray-500">
            Space: Play/Pause | Arrows: Seek | L: Loop | C: Clear
          </p>
        </div>
      )}
      {showPitchGuide && (
        <PitchReferenceGuide
          onClose={() => setShowPitchGuide(false)}
          showSargam={showSargam}
          rootKey={rootKey}
        />
      )}
    </div>
  );
}

export default App;
