/**
 * Voice Activity Detection (VAD)
 *
 * Detects speech vs silence in audio streams using energy-based thresholding.
 * This enables push-to-talk free voice input - speech auto-triggers transcription.
 */

export type VADOptions = {
  /** Energy threshold (0-255, default: 25) */
  threshold?: number;
  /** Min speech duration in ms to trigger (default: 250) */
  minSpeechMs?: number;
  /** Min silence duration in ms to end speech (default: 500) */
  minSilenceMs?: number;
  /** Sample rate (default: 16000) */
  sampleRate?: number;
};

export type VADEvent = {
  type: 'speech_start' | 'speech_end';
  timestamp: number;
};

export type VADEventHandler = (event: VADEvent) => void;

export class VoiceActivityDetector {
  private threshold: number;
  private minSpeechMs: number;
  private minSilenceMs: number;
  private sampleRate: number;
  private handler: VADEventHandler | null = null;
  private isSpeaking = false;
  private speechStartTime = 0;
  private silenceStartTime = 0;

  constructor(options: VADOptions = {}) {
    this.threshold = options.threshold ?? 25;
    this.minSpeechMs = options.minSpeechMs ?? 250;
    this.minSilenceMs = options.minSilenceMs ?? 500;
    this.sampleRate = options.sampleRate ?? 16000;
  }

  onEvent(handler: VADEventHandler): void {
    this.handler = handler;
  }

  /**
   * Process audio PCM data and detect speech segments
   * @param pcmData - Raw PCM audio (16-bit signed, mono)
   */
  detect(pcmData: Int16Array): void {
    const energy = this.calculateEnergy(pcmData);
    const now = Date.now();
    const isSpeech = energy > this.threshold;

    if (isSpeech) {
      if (!this.isSpeaking) {
        // Start of speech
        this.speechStartTime = now;
        this.isSpeaking = true;
        this.silenceStartTime = 0;
      } else if (now - this.speechStartTime >= this.minSpeechMs && this.handler) {
        this.handler({ type: 'speech_start', timestamp: now });
      }
    } else {
      if (this.isSpeaking) {
        // Silence during speech
        if (this.silenceStartTime === 0) {
          this.silenceStartTime = now;
        } else if (now - this.silenceStartTime >= this.minSilenceMs) {
          // End of speech
          this.isSpeaking = false;
          this.silenceStartTime = 0;
          if (this.handler) {
            this.handler({ type: 'speech_end', timestamp: now });
          }
        }
      }
    }

    // Reset silence timer if speech resumes
    if (isSpeech && this.isSpeaking) {
      this.silenceStartTime = 0;
    }
  }

  /**
   * Calculate RMS energy of audio sample
   */
  private calculateEnergy(pcmData: Int16Array): number {
    let sum = 0;
    for (let i = 0; i < pcmData.length; i++) {
      const val = pcmData[i];
      if (val === undefined) continue;
      const sample = val / 32768;
      sum += sample * sample;
    }
    return Math.sqrt(sum / pcmData.length) * 255;
  }

  /**
   * Reset VAD state
   */
  reset(): void {
    this.isSpeaking = false;
    this.speechStartTime = 0;
    this.silenceStartTime = 0;
  }

  /**
   * Check if currently detecting speech
   */
  isActive(): boolean {
    return this.isSpeaking;
  }

  /**
   * Get current energy level
   */
  getEnergy(pcmData: Int16Array): number {
    return this.calculateEnergy(pcmData);
  }
}

/**
 * Create VAD from config
 */
export function createVAD(config?: VADOptions): VoiceActivityDetector {
  return new VoiceActivityDetector(config);
}