import { EdgeTTSProvider } from '../src/comms/voice.ts';
import fs from 'fs';

async function test() {
  console.log('--- Testing Edge TTS ---');
  try {
    const provider = new EdgeTTSProvider();
    const text = 'Hello, this is a test of the AETHER text to speech system on Windows.';
    console.log(`Synthesizing: "${text}"`);
    const buffer = await provider.synthesize(text);
    console.log(`Success! Buffer size: ${buffer.length} bytes`);
    
    const outputPath = 'scratch/test_tts.mp3';
    fs.writeFileSync(outputPath, buffer);
    console.log(`Saved test audio to ${outputPath}`);
  } catch (err) {
    console.error('TTS Test Failed:', err);
  }
}

test();
