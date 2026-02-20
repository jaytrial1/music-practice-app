import React, { useState, useRef, useEffect, useCallback } from 'react';
import AudioPlayer from './components/AudioPlayer';
import Controls from './components/Controls';
import TestRecorder from './components/TestRecorder';
import { Upload, Music, Mic2, Activity, Waves, Settings, Music2, Bug, Maximize2, Minimize2, Play, Pause, Rewind, FastForward, ZoomIn, ZoomOut, Flag, Trash2, PlayCircle } from 'lucide-react';

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

  const playerRef = useRef(null);
  const visualizerContainerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFsControls, setShowFsControls] = useState(true);
  const fsTimerRef = useRef(null);

  // Auto-hide fullscreen controls after 3 seconds
  const resetFsTimer = useCallback(() => {
    if (fsTimerRef.current) clearTimeout(fsTimerRef.current);
    setShowFsControls(true);
    fsTimerRef.current = setTimeout(() => setShowFsControls(false), 3000);
  }, []);

  // Click/tap handler for fullscreen — toggle controls
  const handleFsClick = useCallback((e) => {
    // Don't toggle if clicking a button or control
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
    if (showFsControls) {
      // Currently visible → hide immediately
      if (fsTimerRef.current) clearTimeout(fsTimerRef.current);
      setShowFsControls(false);
    } else {
      // Currently hidden → show + start auto-hide timer
      resetFsTimer();
    }
  }, [showFsControls, resetFsTimer]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!visualizerContainerRef.current) return;
    if (!document.fullscreenElement) {
      visualizerContainerRef.current.requestFullscreen().catch(err => {
        console.error('Fullscreen error:', err);
      });
    } else {
      document.exitFullscreen();
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
        fsTimerRef.current = setTimeout(() => setShowFsControls(false), 3000);
      }
    };
    document.addEventListener('fullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      if (fsTimerRef.current) clearTimeout(fsTimerRef.current);
    };
  }, []);

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
  const handleClearRegions = () => playerRef.current?.clearRegions();

  // Recording Logic
  const [isRecording, setIsRecording] = useState(false);
  const [userAudioUrl, setUserAudioUrl] = useState(null);

  const handleRecordToggle = () => {
    if (isRecording) {
      // STOP
      playerRef.current?.stopRecording();
      setIsRecording(false);
      if (isPlaying) setIsPlaying(false);
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
    if (userAudioUrl) {
      // Pause the song first so user only hears their recording
      if (isPlaying) setIsPlaying(false);

      // MOBILE FIX: Use AudioContext instead of new Audio()
      // new Audio() can route to phone earpiece; AudioContext routes to headphones
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const response = await fetch(userAudioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);
        source.start(0);
        // Cleanup after playback
        source.onended = () => audioCtx.close();
      } catch (err) {
        // Fallback to simple Audio
        console.warn('AudioContext playback failed, using fallback:', err);
        const audio = new Audio(userAudioUrl);
        audio.play();
      }
    }
  };

  // Determine Display Note (Western vs Sargam)
  const getDisplayNote = (noteObj) => {
    if (!noteObj) return { main: "--", sub: "Listening..." };

    const { note, frequency } = noteObj; // note is like "C4", "F#3"

    if (!showSargam) {
      return { main: note, sub: `${Math.round(frequency)} Hz` };
    }

    // Convert to Sargam
    // 1. Extract note name (C, C#) and octave
    const noteName = note.replace(/[0-9]/, ""); // "C#4" -> "C#"

    // 2. Find index relative to Root Key
    const rootIndex = NOTES.indexOf(rootKey);
    const noteIndex = NOTES.indexOf(noteName);

    if (rootIndex === -1 || noteIndex === -1) return { main: note, sub: "Unknown" };

    // 3. Calculate interval (0-11)
    let interval = (noteIndex - rootIndex + 12) % 12;

    // 4. Map to Sargam
    const sargamNote = SARGAM_MAPPING[interval];

    return { main: sargamNote, sub: `${note} / ${Math.round(frequency)} Hz` };
  };

  const display = getDisplayNote(currentNote);

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

                {/* Root Key Selector */}
                <div className="flex items-center gap-2 bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-800">
                  <span className="text-xs text-gray-400 uppercase font-bold">Sa (Key)</span>
                  <select
                    value={rootKey}
                    onChange={(e) => setRootKey(e.target.value)}
                    className="bg-transparent text-indigo-400 font-bold focus:outline-none cursor-pointer"
                  >
                    {NOTES.map(note => (
                      <option key={note} value={note} className="bg-gray-900">{note}</option>
                    ))}
                  </select>
                </div>

                {/* Sargam Toggle */}
                <button
                  onClick={() => setShowSargam(!showSargam)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition ${showSargam ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                >
                  <Music2 size={16} />
                  <span>{showSargam ? 'Sargam' : 'A B C'}</span>
                </button>

                {/* Spectrogram Toggle */}
                <button
                  onClick={() => setShowSpectrogram(!showSpectrogram)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition ${showSpectrogram ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                >
                  <Waves size={16} />
                  <span>Spectrogram</span>
                </button>

                {/* Notation Mode Toggle */}
                <button
                  onClick={() => setNotationMode(prev => prev === 'axis' ? 'floating' : 'axis')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition ${notationMode === 'floating' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                >
                  <Activity size={16} />
                  <span>{notationMode === 'axis' ? 'Axis Mode' : 'Floating Mode'}</span>
                </button>
              </div>
            </div>

            {/* NOTE DISPLAY - The "Caroke" Feature */}
            <div className="flex justify-center">
              <div className={`
                        relative flex flex-col items-center justify-center w-full md:w-64 h-32 rounded-2xl border transition-all duration-300
                        ${currentNote
                  ? 'bg-gradient-to-br from-indigo-600 to-purple-800 border-indigo-400/50 shadow-2xl shadow-indigo-500/20 scale-105'
                  : 'bg-gray-900/50 border-gray-800 grayscale opacity-80'}
                    `}>
                <div className="absolute top-3 left-4 text-xs font-bold tracking-wider text-white/50 uppercase">Current Note</div>

                {currentNote ? (
                  <>
                    <div className="text-5xl font-black text-white tracking-tighter drop-shadow-lg">
                      {display.main}
                    </div>
                    <div className="text-sm font-mono text-indigo-200 mt-1 opacity-80">
                      {display.sub}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center text-gray-600 gap-2">
                    <Activity size={24} />
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
                  onPitchUpdate={setCurrentNote}
                  onRecordingComplete={handleRecordingComplete}
                />
              </div>

              {/* ===== FULLSCREEN OVERLAY CONTROLS (YouTube-style) ===== */}
              {isFullscreen && (
                <>
                  {/* TOP-LEFT: Axis/Floating Mode + Sargam */}
                  <div className={`absolute top-4 left-4 z-20 flex items-center gap-2 transition-all duration-300 ${showFsControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setNotationMode(prev => prev === 'axis' ? 'floating' : 'axis'); resetFsTimer(); }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition backdrop-blur-md ${notationMode === 'floating' ? 'bg-amber-500/90 text-white' : 'bg-gray-800/80 text-gray-300 hover:bg-gray-700/80'}`}
                    >
                      <Activity size={16} />
                      <span>{notationMode === 'axis' ? 'Axis' : 'Float'}</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowSargam(!showSargam); resetFsTimer(); }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition backdrop-blur-md ${showSargam ? 'bg-indigo-600/90 text-white' : 'bg-gray-800/80 text-gray-300 hover:bg-gray-700/80'}`}
                    >
                      <Music2 size={16} />
                      <span>{showSargam ? 'Sa Re' : 'A B C'}</span>
                    </button>
                  </div>

                  {/* TOP-RIGHT: Exit Fullscreen */}
                  <div className={`absolute top-4 right-4 z-20 transition-all duration-300 ${showFsControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                      className="p-2 bg-gray-800/80 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition backdrop-blur-md"
                      title="Exit Fullscreen"
                    >
                      <Minimize2 size={20} />
                    </button>
                  </div>

                  {/* BOTTOM-CENTER: Main Controls */}
                  <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-20 transition-all duration-300 ${showFsControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
                    <div className="flex items-center gap-3 bg-gray-900/90 backdrop-blur-xl px-6 py-3 rounded-2xl border border-gray-700/50 shadow-2xl">
                      {/* Skip Back */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSkipBackward(); resetFsTimer(); }}
                        className="p-2 text-gray-400 hover:text-white transition"
                      >
                        <Rewind size={20} />
                      </button>

                      {/* Play/Pause */}
                      <button
                        onClick={(e) => { e.stopPropagation(); togglePlay(); resetFsTimer(); }}
                        className={`p-4 rounded-full transition shadow-lg ${isPlaying ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
                      >
                        {isPlaying ? <Pause size={24} fill="white" /> : <Play size={24} fill="white" className="ml-0.5" />}
                      </button>

                      {/* Record */}
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

                      {/* Skip Forward */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSkipForward(); resetFsTimer(); }}
                        className="p-2 text-gray-400 hover:text-white transition"
                      >
                        <FastForward size={20} />
                      </button>

                      {/* Divider */}
                      <div className="w-px h-8 bg-gray-700 mx-1"></div>

                      {/* Speed */}
                      <div className="flex items-center gap-1">
                        {[0.5, 0.75, 1, 1.25, 1.5].map(rate => (
                          <button
                            key={rate}
                            onClick={(e) => { e.stopPropagation(); setPlaybackRate(rate); resetFsTimer(); }}
                            className={`px-2 py-1 rounded text-xs font-bold transition ${playbackRate === rate ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>

                      {/* Divider */}
                      <div className="w-px h-8 bg-gray-700 mx-1"></div>

                      {/* Zoom */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setZoom(z => Math.max(10, z - 30)); resetFsTimer(); }}
                          className="p-1.5 text-gray-400 hover:text-white transition"
                        >
                          <ZoomOut size={18} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setZoom(z => Math.min(500, z + 30)); resetFsTimer(); }}
                          className="p-1.5 text-gray-400 hover:text-white transition"
                        >
                          <ZoomIn size={18} />
                        </button>
                      </div>

                      {/* Divider */}
                      <div className="w-px h-8 bg-gray-700 mx-1"></div>

                      {/* Loop */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAddRegion(); resetFsTimer(); }}
                          className="flex items-center gap-1 px-2 py-1.5 bg-indigo-600/80 hover:bg-indigo-700 rounded-lg text-white text-xs font-medium transition"
                          title="Set Loop"
                        >
                          <Flag size={14} />
                          <span>Loop</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleClearRegions(); resetFsTimer(); }}
                          className="p-1.5 text-gray-400 hover:text-red-400 transition"
                          title="Clear Loops"
                        >
                          <Trash2 size={16} />
                        </button>
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
    </div>
  );
}

export default App;
