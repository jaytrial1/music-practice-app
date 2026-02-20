import React, { useState, useRef } from 'react';
import { Mic, Square } from 'lucide-react';

const TestRecorder = ({ onBack }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [audioUrl, setAudioUrl] = useState(null);
    const [logs, setLogs] = useState([]);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);

    // DEBUG toggles
    const [playDuringRecord, setPlayDuringRecord] = useState(false);
    const [forceNoEcho, setForceNoEcho] = useState(false);
    const [testAudioFile, setTestAudioFile] = useState(null);
    const testAudioPlayerRef = useRef(null);

    const addLog = (msg) => setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);

    const startRecording = async () => {
        try {
            setAudioUrl(null);
            chunksRef.current = [];

            // Choose constraints based on toggle
            const audioConstraints = forceNoEcho
                ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
                : true;

            addLog(`Constraints: ${JSON.stringify(audioConstraints)}`);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
            addLog(`Stream obtained.`);

            const track = stream.getAudioTracks()[0];
            const settings = track.getSettings ? track.getSettings() : {};
            addLog(`Mic: ${track.label}`);
            addLog(`EchoCancellation: ${settings.echoCancellation ?? 'N/A'}`);
            addLog(`NoiseSuppression: ${settings.noiseSuppression ?? 'N/A'}`);
            addLog(`AutoGainControl: ${settings.autoGainControl ?? 'N/A'}`);

            // Play audio if toggle is ON
            if (playDuringRecord && testAudioPlayerRef.current && testAudioPlayerRef.current.src) {
                testAudioPlayerRef.current.currentTime = 0;
                testAudioPlayerRef.current.play();
                addLog("PLAYING AUDIO DURING RECORDING");
            } else if (playDuringRecord) {
                addLog("WARNING: Toggle ON but no audio file loaded!");
            } else {
                addLog("Silent mode (no audio playing)");
            }

            let options = {};
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                options = { mimeType: 'audio/webm;codecs=opus' };
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                options = { mimeType: 'audio/mp4' };
            }
            addLog(`MimeType: ${options.mimeType || 'Default'}`);

            const mediaRecorder = new MediaRecorder(stream, options);
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: options.mimeType || 'audio/webm' });
                const url = URL.createObjectURL(blob);
                setAudioUrl(url);
                addLog(`Stopped. Blob: ${blob.size} bytes`);
                stream.getTracks().forEach(t => t.stop());
                if (testAudioPlayerRef.current) testAudioPlayerRef.current.pause();
            };

            mediaRecorder.start();
            setIsRecording(true);
            addLog("Recording started...");
        } catch (err) {
            addLog(`Error: ${err.message}`);
            console.error(err);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const handleTestFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            if (testAudioPlayerRef.current) testAudioPlayerRef.current.src = url;
            setTestAudioFile(file.name);
            addLog(`Loaded: ${file.name}`);
        }
    };

    return (
        <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center p-4 text-white font-mono overflow-y-auto">
            <h1 className="text-2xl font-bold mb-4 text-orange-500">MIC DIAGNOSTIC MODE</h1>

            <div className="w-full max-w-md mb-4 p-4 bg-yellow-900/30 border border-yellow-600 rounded-lg space-y-3">
                <h3 className="text-yellow-400 font-bold text-sm">Test Controls</h3>

                <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={playDuringRecord}
                        onChange={(e) => setPlayDuringRecord(e.target.checked)} className="w-5 h-5" />
                    <span className="text-sm">Play audio WHILE recording</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={forceNoEcho}
                        onChange={(e) => setForceNoEcho(e.target.checked)} className="w-5 h-5" />
                    <span className="text-sm text-green-400">Force Echo Cancellation OFF</span>
                </label>

                {playDuringRecord && (
                    <div className="space-y-2">
                        <label className="block text-xs text-gray-400">Load your song:</label>
                        <input type="file" accept="audio/*" onChange={handleTestFileChange} className="text-xs" />
                        {testAudioFile && <span className="text-green-400 text-xs">Loaded: {testAudioFile}</span>}
                    </div>
                )}

                <audio ref={testAudioPlayerRef} className="hidden" />
            </div>

            <div className="flex gap-6 mb-4">
                {!isRecording ? (
                    <button onClick={startRecording}
                        className="w-24 h-24 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-2xl transition">
                        <Mic size={40} />
                    </button>
                ) : (
                    <button onClick={stopRecording}
                        className="w-24 h-24 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center animate-pulse border-4 border-red-500">
                        <Square size={40} />
                    </button>
                )}
            </div>

            {audioUrl && (
                <div className="my-4 flex flex-col items-center gap-4 p-6 bg-gray-900 rounded-xl border border-gray-700">
                    <h3 className="text-green-400 font-bold">RECORDING READY</h3>
                    <audio controls src={audioUrl} className="w-full max-w-md" />
                </div>
            )}

            <div className="w-full max-w-md bg-gray-900 p-4 rounded-lg h-48 overflow-y-auto text-xs border border-gray-800 font-mono">
                {logs.map((log, i) => <div key={i} className="mb-1 text-gray-400">{log}</div>)}
            </div>

            <button onClick={onBack} className="mt-4 text-gray-500 hover:text-white underline">
                Exit Diagnostic Mode
            </button>
        </div>
    );
};

export default TestRecorder;
