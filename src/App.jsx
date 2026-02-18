import React, { useState, useRef, useEffect } from 'react';
import AudioPlayer from './components/AudioPlayer';
import Controls from './components/Controls';
import { Upload, Music, Mic2, Activity, Waves, Settings, Music2 } from 'lucide-react';

// Sargam Mapping Helpers
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SARGAM_MAPPING = ["Sa", "re", "Re", "ga", "Ga", "Ma", "MA", "Pa", "dha", "Dha", "ni", "Ni"];

function App() {
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

            {/* Visualizer */}
            <div className="min-h-[200px] border border-gray-700 rounded-xl overflow-hidden bg-gray-900/50 relative">
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
                onFinish={() => setIsPlaying(false)}
                onPitchUpdate={setCurrentNote}
              />
            </div>

            {/* Controls */}
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
            />
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
