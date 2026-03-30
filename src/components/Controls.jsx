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
    PlayCircle,
    PlusSquare,
    PlaySquare,
    Repeat,
    Repeat1,
    XSquare,
    ArrowLeft,
    ArrowRight
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
    onPlayRecording,
    isPlayingRecording,
    onDeleteRecording,
    sequenceLoops = [],
    onAddSequenceLoop,
    onPlaySequence,
    isSequencePlaying,
    onClearSequence,
    isSequenceLoopOnlyOnce,
    setIsSequenceLoopOnlyOnce,
    onRemoveSequenceItem,
    onReorderSequence
}) => {
    const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

    return (
        <div className="bg-gray-800 p-6 rounded-xl shadow-2xl border border-gray-700 w-full max-w-4xl mx-auto mt-6">

            {/* Top Row: Zoom Controls (Centered) */}
            <div className="flex items-center justify-center gap-4 mb-6">
                <ZoomOut size={20} className="text-gray-400" />
                <input
                    type="range"
                    min="10"
                    max="500"
                    value={zoom}
                    onChange={(e) => onZoomChange(Number(e.target.value))}
                    className="w-full max-w-md h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                <ZoomIn size={20} className="text-gray-400" />
            </div>

            <div className="h-px bg-gray-700 my-4 w-full" />

            {/* Middle Row: Speed & Playback Controls */}
            <div className="flex flex-col md:flex-row items-center justify-center gap-8 mb-6">

                {/* Speed Control (Compact Dropdown) */}
                <div className="flex items-center gap-2 bg-gray-900/50 px-3 py-2 rounded-xl border border-gray-700/50 shadow-inner">
                    <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">Speed</span>
                    <select
                        value={playbackRate}
                        onChange={(e) => onPlaybackRateChange(Number(e.target.value))}
                        className="bg-gray-800 text-indigo-400 font-bold px-2 py-1 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer text-sm"
                    >
                        {speeds.map((rate) => (
                            <option key={rate} value={rate} className="bg-gray-900">
                                {rate}x
                            </option>
                        ))}
                    </select>
                </div>

                {/* Play/Pause & Skip (Moved to right) */}
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

                    {/* Play My Recording + Delete */}
                    {userAudioUrl && (
                        <>
                            <button
                                onClick={onPlayRecording}
                                className={`p-4 rounded-full transition text-white shadow-lg animate-in zoom-in ${isPlayingRecording ? 'bg-amber-500 hover:bg-amber-600 ring-2 ring-amber-400/40' : 'bg-orange-600 hover:bg-orange-700'}`}
                                title={isPlayingRecording ? "Stop Playback" : "Play My Recording"}
                            >
                                {isPlayingRecording ? <Pause size={24} /> : <PlayCircle size={28} />}
                            </button>
                            <button
                                onClick={onDeleteRecording}
                                className="p-3 bg-gray-700 hover:bg-red-900 rounded-full transition text-gray-400 hover:text-red-300 border border-gray-600 hover:border-red-500"
                                title="Delete Recording"
                            >
                                <Trash2 size={20} />
                            </button>
                        </>
                    )}

                    <button
                        onClick={onSkipForward}
                        className="p-3 bg-gray-700 hover:bg-gray-600 rounded-full transition text-white"
                        title="Forward 5s"
                    >
                        <FastForward size={20} />
                    </button>
                </div>

            </div>

            <div className="h-px bg-gray-700 my-4 w-full" />

            <div className="flex flex-col md:flex-row items-center justify-between gap-6 px-4">
                {/* Standard Looping */}
                <div className="flex items-center gap-3 bg-gray-900/40 p-3 rounded-xl border border-gray-700/50">
                    <span className="text-gray-400 text-xs font-bold uppercase tracking-wider hidden sm:block">Standard</span>
                    <button
                        onClick={onAddRegion}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white font-medium transition shadow-md"
                        title="Loop current section (5s)"
                    >
                        <Flag size={18} />
                        <span>Set Loop</span>
                    </button>
                    <button
                        onClick={onClearRegions}
                        className="flex items-center p-2 bg-gray-700 hover:bg-red-900/50 hover:text-red-300 rounded-lg text-gray-400 transition"
                        title="Clear all loops"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>

                {/* Sequence Looping */}
                <div className="flex flex-col gap-3 bg-amber-900/20 p-3 rounded-xl border border-amber-900/30 w-full md:w-auto">
                    <div className="flex items-center gap-3">
                        <span className="text-amber-500 text-xs font-bold uppercase tracking-wider hidden sm:block">Sequence</span>
                        <div className="flex flex-1 md:flex-initial gap-2 items-center">
                            <button
                                onClick={onAddSequenceLoop}
                                className="flex items-center justify-center gap-2 px-3 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg text-white font-medium transition shadow-md"
                                title="Save current loop to sequence"
                            >
                                <PlusSquare size={18} />
                                <span className="hidden sm:inline">Save (+{sequenceLoops.length})</span>
                            </button>

                            <button
                                onClick={() => setIsSequenceLoopOnlyOnce(!isSequenceLoopOnlyOnce)}
                                className={`p-2 rounded-lg border transition ${!isSequenceLoopOnlyOnce ? 'bg-amber-500/20 border-amber-500/50 text-amber-500' : 'bg-gray-800 border-gray-700 text-gray-500 hover:bg-gray-700'}`}
                                title={isSequenceLoopOnlyOnce ? "Play Once (Click to Loop)" : "Loop Infinitely (Click to Play Once)"}
                            >
                                {!isSequenceLoopOnlyOnce ? <Repeat size={18} /> : <Repeat1 size={18} />}
                            </button>

                            <button
                                onClick={onPlaySequence}
                                disabled={sequenceLoops.length === 0}
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-white font-medium transition shadow-md ${sequenceLoops.length > 0
                                    ? (isSequencePlaying ? 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]' : 'bg-emerald-600 hover:bg-emerald-700')
                                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                    }`}
                                title="Play all saved loops sequentially"
                            >
                                <PlaySquare size={18} />
                                <span className="hidden sm:inline">{isSequencePlaying ? 'Playing...' : 'Play Seq'}</span>
                            </button>

                            {sequenceLoops.length > 0 && (
                                <button
                                    onClick={onClearSequence}
                                    className="p-2 ml-1 bg-gray-800 hover:bg-red-900/50 hover:text-red-300 rounded-lg text-gray-400 border border-gray-700 hover:border-red-500/50 transition"
                                    title="Clear sequence loops"
                                >
                                    <XSquare size={18} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Sequence Reorder UI */}
                    {sequenceLoops.length > 0 && (
                        <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-[300px] sm:max-w-md hidden-scrollbar border-t border-amber-900/30 pt-2">
                            {sequenceLoops.map((loop, idx) => (
                                <div key={idx} className="flex flex-col items-center min-w-max bg-gray-900/80 rounded border border-gray-700 p-1 gap-1">
                                    <div className="flex items-center justify-between w-full px-1">
                                        <span className="text-[10px] text-amber-500 font-bold">Seq {idx + 1}</span>
                                        <button onClick={() => onRemoveSequenceItem(idx)} className="text-gray-500 hover:text-red-400 p-0.5">
                                            <XSquare size={12} />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => onReorderSequence(idx, idx - 1)}
                                            disabled={idx === 0}
                                            className="p-1 bg-gray-800 rounded hover:bg-amber-600 hover:text-white disabled:opacity-30 transition"
                                        >
                                            <ArrowLeft size={10} />
                                        </button>
                                        <button
                                            onClick={() => onReorderSequence(idx, idx + 1)}
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
    );
};

export default Controls;
