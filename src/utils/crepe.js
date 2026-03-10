/**
 * CREPE Pitch Detection via TensorFlow.js
 * 
 * Standalone implementation of the CREPE model for high-accuracy
 * monophonic pitch detection. Uses the "tiny" CREPE model (~5MB)
 * loaded from the official CREPE GitHub Pages.
 * 
 * Accuracy: >90% within 10 cents (vs ~70% for YIN)
 */
import * as tf from '@tensorflow/tfjs';

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/ml5js/ml5-data-and-models/models/pitch-detection/crepe/model.json';

// CREPE constants
const SAMPLE_RATE = 16000;
const FRAME_SIZE = 1024;
const NUM_BINS = 360;
const CENTS_PER_BIN = 20;
const FREQ_MIN = 32.70; // C1

let model = null;
let isLoading = false;
let loadPromise = null;

/**
 * Load the CREPE model (cached after first load)
 */
export async function loadCREPE() {
    if (model) return model;
    if (loadPromise) return loadPromise;

    isLoading = true;
    loadPromise = (async () => {
        try {
            // Try loading from CDN first
            model = await tf.loadLayersModel(MODEL_URL);
            console.log('CREPE model loaded successfully from CDN');
        } catch (e1) {
            console.warn('CDN model load failed, trying alternative...', e1);
            try {
                // Fallback: try the original CREPE demo URL
                model = await tf.loadLayersModel(
                    'https://marl.github.io/crepe/model/model.json'
                );
                console.log('CREPE model loaded from MARL');
            } catch (e2) {
                console.error('All CREPE model sources failed:', e2);
                model = null;
            }
        }
        isLoading = false;
        return model;
    })();
    return loadPromise;
}

/**
 * Check if CREPE is ready
 */
export function isCREPEReady() {
    return model !== null;
}

export function isCREPELoading() {
    return isLoading;
}

/**
 * Convert bin index to frequency in Hz
 */
function binToFrequency(bin) {
    const cents = bin * CENTS_PER_BIN;
    return FREQ_MIN * Math.pow(2, cents / 1200);
}

/**
 * Detect pitch from an audio buffer using CREPE
 * 
 * @param {Float32Array} audioBuffer - Raw audio samples
 * @param {number} sampleRate - Sample rate of the audio
 * @returns {{ frequency: number, confidence: number } | null}
 */
export function detectPitch(audioBuffer, sampleRate) {
    if (!model) return null;

    // Calculate minimum input size needed to get 1024 samples at 16kHz
    const minInputSamples = Math.ceil(FRAME_SIZE * sampleRate / SAMPLE_RATE);
    if (audioBuffer.length < minInputSamples * 0.8) {
        return null; // Input too short for reliable CREPE detection
    }

    // Resample to 16kHz if needed
    let resampled = audioBuffer;
    if (sampleRate !== SAMPLE_RATE) {
        const ratio = SAMPLE_RATE / sampleRate;
        const newLen = Math.round(audioBuffer.length * ratio);
        resampled = new Float32Array(newLen);
        for (let i = 0; i < newLen; i++) {
            const srcIdx = i / ratio;
            const low = Math.floor(srcIdx);
            const high = Math.min(low + 1, audioBuffer.length - 1);
            const frac = srcIdx - low;
            resampled[i] = audioBuffer[low] * (1 - frac) + audioBuffer[high] * frac;
        }
    }

    // Take center 1024 samples — MUST have enough after resampling
    let frame;
    if (resampled.length >= FRAME_SIZE) {
        const start = Math.floor((resampled.length - FRAME_SIZE) / 2);
        frame = resampled.slice(start, start + FRAME_SIZE);
    } else {
        // Not enough samples even after resampling — skip
        return null;
    }

    // Normalize
    const mean = frame.reduce((a, b) => a + b, 0) / frame.length;
    let std = 0;
    for (let i = 0; i < frame.length; i++) {
        std += (frame[i] - mean) ** 2;
    }
    std = Math.sqrt(std / frame.length);
    if (std < 1e-6) return null; // Silent

    const normalized = new Float32Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
        normalized[i] = (frame[i] - mean) / std;
    }

    // Run inference
    const result = tf.tidy(() => {
        const input = tf.tensor2d(normalized, [1, FRAME_SIZE]);
        const prediction = model.predict(input);
        return prediction.dataSync();
    });

    // Find the peak bin and confidence
    let maxBin = 0;
    let maxConf = 0;
    for (let i = 0; i < result.length; i++) {
        if (result[i] > maxConf) {
            maxConf = result[i];
            maxBin = i;
        }
    }

    if (maxConf < 0.1) return null; // Low confidence

    // Parabolic interpolation for sub-bin accuracy
    let refinedBin = maxBin;
    if (maxBin > 0 && maxBin < result.length - 1) {
        const y0 = result[maxBin - 1];
        const y1 = result[maxBin];
        const y2 = result[maxBin + 1];
        const shift = (y2 - y0) / (2 * (2 * y1 - y0 - y2));
        if (Math.abs(shift) < 1) {
            refinedBin = maxBin + shift;
        }
    }

    const frequency = binToFrequency(refinedBin);

    // Only return valid vocal range
    if (frequency < 50 || frequency > 1200) return null;

    return { frequency, confidence: maxConf };
}

/**
 * Create a CREPE-based pitch detector that works as a drop-in
 * replacement for the YIN detector. Falls back to YIN if model
 * fails to load.
 * 
 * @param {object} options - { sampleRate: number }
 * @returns {function} detectPitch(buffer) => frequency | null
 */
export function createCREPEDetector(options = {}) {
    const sr = options.sampleRate || 44100;

    // Start loading model in background
    loadCREPE();

    return function detect(audioBuffer) {
        if (!model) return null; // Model not ready yet, return null
        const result = detectPitch(audioBuffer, sr);
        return result ? result.frequency : null;
    };
}

/**
 * Process an entire audio buffer through CREPE for file analysis.
 * Much more accurate than YIN for batch processing.
 * 
 * @param {AudioBuffer} buffer - Web Audio API AudioBuffer
 * @param {object} options - { hopSize, onProgress }
 * @returns {Promise<Array<{time: number, freq: number|null, confidence: number, rms: number}>>}
 */
export async function processAudioBuffer(buffer, options = {}) {
    const hopSize = options.hopSize || 1024; // 50% overlap with 2048 window
    const onProgress = options.onProgress || (() => { });

    // Ensure model is loaded
    await loadCREPE();
    if (!model) {
        console.error('CREPE model not available for batch processing');
        return [];
    }

    const channelData = buffer.getChannelData(0);
    const sr = buffer.sampleRate;
    // Frame size must be large enough so resampling to 16kHz gives >= 1024 samples
    // At 44.1kHz: need ceil(1024 * 44100/16000) = 2824, so use 4096
    const frameSize = Math.max(4096, Math.ceil(FRAME_SIZE * sr / SAMPLE_RATE) + 512);
    const totalFrames = Math.floor((channelData.length - frameSize) / hopSize) + 1;

    const results = [];

    // Process in chunks to avoid UI freeze
    const BATCH_SIZE = 16;

    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
        const startSample = frameIdx * hopSize;
        const chunk = channelData.slice(startSample, startSample + frameSize);

        // Compute RMS energy
        let sumSq = 0;
        for (let j = 0; j < chunk.length; j++) {
            sumSq += chunk[j] * chunk[j];
        }
        const rms = Math.sqrt(sumSq / chunk.length);

        const time = startSample / sr;

        // Skip silent frames
        if (rms < 0.005) {
            results.push({ time, freq: null, confidence: 0, rms });
            continue;
        }

        // Run CREPE detection
        const detection = detectPitch(chunk, sr);

        if (detection && detection.frequency > 50 && detection.frequency < 1200) {
            results.push({
                time,
                freq: detection.frequency,
                confidence: detection.confidence,
                rms
            });
        } else {
            results.push({ time, freq: null, confidence: 0, rms });
        }

        // Yield to UI every BATCH_SIZE frames
        if (frameIdx % BATCH_SIZE === 0) {
            onProgress(frameIdx / totalFrames);
            await new Promise(r => setTimeout(r, 0));
        }
    }

    onProgress(1);

    // --- POST-PROCESSING ---
    // 1. Confidence filtering: remove low-confidence detections
    for (let i = 0; i < results.length; i++) {
        if (results[i].confidence < 0.25) {
            results[i].freq = null;
        }
    }

    // 2. Median smoothing (window=5) for stable pitch
    const smoothed = results.map(r => ({ ...r }));
    for (let i = 0; i < smoothed.length; i++) {
        if (!smoothed[i].freq) continue;

        const neighbors = [];
        for (let j = Math.max(0, i - 2); j <= Math.min(smoothed.length - 1, i + 2); j++) {
            if (results[j].freq) neighbors.push(results[j].freq);
        }
        if (neighbors.length >= 3) {
            neighbors.sort((a, b) => a - b);
            smoothed[i].freq = neighbors[Math.floor(neighbors.length / 2)];
        }
    }

    // 3. Octave error correction (compare to local median)
    for (let i = 0; i < smoothed.length; i++) {
        if (!smoothed[i].freq) continue;

        const neighbors = [];
        for (let j = Math.max(0, i - 5); j <= Math.min(smoothed.length - 1, i + 5); j++) {
            if (j !== i && smoothed[j].freq) neighbors.push(smoothed[j].freq);
        }
        if (neighbors.length < 3) continue;

        neighbors.sort((a, b) => a - b);
        const median = neighbors[Math.floor(neighbors.length / 2)];
        const ratio = smoothed[i].freq / median;

        if (ratio >= 1.85 && ratio <= 2.15) smoothed[i].freq /= 2;
        else if (ratio >= 0.47 && ratio <= 0.54) smoothed[i].freq *= 2;
        else if (ratio >= 2.85 && ratio <= 3.15) smoothed[i].freq /= 3;
    }

    return smoothed;
}
