import React from 'react';
import {
    Play,
    Pause,
    RotateCcw,
    Flag,
    Trash2,
    ZoomIn,
    ZoomOut,
    FastForward,
    Rewind,
    Mic,
    PlayCircle
} from 'lucide-react';

const Controls = ({
    isPlaying,
    onTogglePlay,
    playbackRate,
    onPlaybackRateChange,
    onAddRegion,
    onClearRegions,
    zoom,
    onZoomChange,
    onSkipBackward,
    onSkipForward,
    isRecording,
    onRecordToggle,
    userAudioUrl,
    onPlayRecording
}) => {
    const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

    return (
        <div className="bg-gray-800 p-6 rounded-xl shadow-2xl border border-gray-700 w-full max-w-4xl mx-auto mt-6">

            {/* Top Row: Playback Controls */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-6">

                {/* Play/Pause & Skip */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={onSkipBackward}
                        className="p-3 bg-gray-700 hover:bg-gray-600 rounded-full transition text-white"
                        title="Rewind 5s"
                    >
                        <Rewind size={20} />
                    </button>

                    <button
                        onClick={onTogglePlay}
                        className={`p-5 rounded-full transition shadow-lg flex items-center justify-center ${isPlaying ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
                        title={isPlaying ? "Pause" : "Play"}
                    >
                        {isPlaying ? <Pause size={32} fill="white" /> : <Play size={32} fill="white" className="ml-1" />}
                    </button>

                    <button
                        onClick={onRecordToggle}
                        className={`p-4 rounded-full transition shadow-lg flex items-center justify-center ${isRecording ? 'bg-red-600 animate-pulse ring-4 ring-red-500/30' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
                        title={isRecording ? "Stop Recording" : "Start Recording"}
                    >
                        <Mic size={24} />
                    </button>

                    {/* Play My Recording Button (Mobile Friendly) */}
                    {userAudioUrl && (
                        <button
                            onClick={onPlayRecording}
                            className="p-3 bg-orange-600 hover:bg-orange-700 rounded-full transition text-white shadow-lg animate-in zoom-in"
                            title="Play My Recording"
                        >
                            <PlayCircle size={24} />
                        </button>
                    )}

                    <button
                        onClick={onSkipForward}
                        className="p-3 bg-gray-700 hover:bg-gray-600 rounded-full transition text-white"
                        title="Forward 5s"
                    >
                        <FastForward size={20} />
                    </button>
                </div>

                {/* Speed Control */}
                <div className="flex items-center gap-3 bg-gray-900/50 p-2 rounded-lg">
                    <span className="text-gray-400 text-sm font-medium uppercase tracking-wider">Speed</span>
                    <div className="flex gap-1">
                        {speeds.map((rate) => (
                            <button
                                key={rate}
                                onClick={() => onPlaybackRateChange(rate)}
                                className={`px-3 py-1 rounded text-sm font-bold transition-all ${playbackRate === rate
                                    ? 'bg-indigo-600 text-white shadow-md transform scale-105'
                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                    }`}
                            >
                                {rate}x
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="h-px bg-gray-700 my-4 w-full" />

            {/* Bottom Row: Advanced Tools (Looping & Zoom) */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">

                {/* Looping Controls */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={onAddRegion}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white font-medium transition shadow-lg"
                        title="Loop current section (5s)"
                    >
                        <Flag size={18} />
                        <span>Set Loop</span>
                    </button>

                    <button
                        onClick={onClearRegions}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-red-900/50 hover:text-red-200 rounded-lg text-gray-300 transition"
                        title="Clear all loops"
                    >
                        <Trash2 size={18} />
                        <span>Clear</span>
                    </button>
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <ZoomOut size={18} className="text-gray-400" />
                    <input
                        type="range"
                        min="10"
                        max="500"
                        value={zoom}
                        onChange={(e) => onZoomChange(Number(e.target.value))}
                        className="w-full md:w-32 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                    <ZoomIn size={18} className="text-gray-400" />
                </div>

            </div>
        </div>
    );
};

export default Controls;
