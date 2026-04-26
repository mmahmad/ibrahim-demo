const OpenAI = require('openai');
const { toFile } = require('openai');
const fs = require('fs');
require('dotenv').config();

const AUDIO_FILE = './test-audio.wav';

async function main() {
  console.log('1. Checking API key...');
  if (!process.env.GROQ_API_KEY) {
    console.error('   FAIL: GROQ_API_KEY not set in .env');
    process.exit(1);
  }
  console.log('   OK:', process.env.GROQ_API_KEY.slice(0, 12) + '...');

  console.log('2. Checking audio file...');
  if (!fs.existsSync(AUDIO_FILE)) {
    console.error('   FAIL: test-audio.wav not found');
    process.exit(1);
  }
  const stat = fs.statSync(AUDIO_FILE);
  console.log(`   OK: ${(stat.size / 1024).toFixed(1)} KB`);

  console.log('3. Building Groq client...');
  const openai = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
  });
  console.log('   OK');

  console.log('4. Wrapping file with toFile()...');
  const audioFile = await toFile(fs.createReadStream(AUDIO_FILE), 'test-audio.wav', { type: 'audio/wav' });
  console.log('   OK:', audioFile.name, audioFile.type);

  console.log('5. Calling Whisper API...');
  const t0 = Date.now();
  try {
    const result = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3-turbo',
      language: 'en',
    });
    console.log(`   OK (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    console.log('\nTranscript:', result.text);
  } catch (err) {
    console.error(`   FAIL (${((Date.now() - t0) / 1000).toFixed(1)}s): ${err.constructor.name}: ${err.message}`);
    if (err.status) console.error('   HTTP status:', err.status);
    if (err.cause) console.error('   Caused by:', err.cause);
    process.exit(1);
  }
}

main();
