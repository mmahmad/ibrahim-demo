const express = require('express');
const multer = require('multer');
const OpenAI = require('openai');
const { toFile } = require('openai');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.GROQ_API_KEY) {
  console.error('[ERROR] GROQ_API_KEY is not set in .env');
  process.exit(1);
}

// Single Groq client — used for both Whisper transcription and LLM translation
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

function log(level, msg, extra) {
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  const line = `[${ts}] [${level}] ${msg}`;
  if (extra) {
    console.log(line, extra);
  } else {
    console.log(line);
  }
}

// Store uploads in a temp directory; clean up after use
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB — Whisper API limit
  fileFilter: (_req, file, cb) => {
    if (file.originalname.match(/\.(mp3|mp4|mpeg|mpga|m4a|wav|webm|ogg|flac)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Please upload mp3, wav, m4a, flac, ogg, or webm.'));
    }
  },
});

app.use(express.static('public'));

// Log every incoming request
app.use((req, _res, next) => {
  log('INFO', `${req.method} ${req.url}`);
  next();
});

app.post('/transcribe', (req, res) => {
  upload.single('audio')(req, res, async (uploadErr) => {
    if (uploadErr) {
      log('WARN', `Upload rejected: ${uploadErr.message}`);
      return res.status(400).json({ error: uploadErr.message });
    }
    if (!req.file) {
      log('WARN', 'Request arrived with no file attached');
      return res.status(400).json({ error: 'No audio file provided.' });
    }

    const { originalname, mimetype, size, path: filePath } = req.file;
    log('INFO', `File received: "${originalname}" (${mimetype}, ${(size / 1024).toFixed(1)} KB)`);

    try {
      log('INFO', 'Sending to OpenAI Whisper...');
      const t0 = Date.now();

      const transcription = await groq.audio.transcriptions.create({
        file: await toFile(fs.createReadStream(filePath), originalname, { type: mimetype }),
        model: 'whisper-large-v3-turbo',
        language: 'en',
        response_format: 'verbose_json',
      });

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      log('INFO', `Transcription done in ${elapsed}s — ${transcription.text.length} chars`);

      res.json({
        transcript: transcription.text,
        duration: transcription.duration ? Math.round(transcription.duration) : null,
      });
    } catch (err) {
      log('ERROR', `OpenAI error: ${err.message}`);
      if (err.status) log('ERROR', `  status=${err.status} type=${err.type ?? 'n/a'}`);
      res.status(500).json({ error: err.message || 'Transcription failed.' });
    } finally {
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) log('WARN', `Could not delete temp file: ${filePath}`);
      });
    }
  });
});

app.use(express.json());

app.post('/translate', async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'No text provided.' });
  }

  log('INFO', `Translating ${text.length} chars to Urdu...`);
  const t0 = Date.now();

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: 'You are a translator. Translate the user\'s text to Urdu. Return only the Urdu translation, nothing else.' },
        { role: 'user', content: text },
      ],
    });

    const translation = response.choices[0].message.content;
    log('INFO', `Translation done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${translation.length} chars`);
    res.json({ translation });
  } catch (err) {
    log('ERROR', `Translation error: ${err.message}`);
    res.status(500).json({ error: err.message || 'Translation failed.' });
  }
});

app.listen(PORT, () => {
  log('INFO', `Audio transcriber running at http://localhost:${PORT}`);
  log('INFO', `Groq key loaded: ${process.env.GROQ_API_KEY.slice(0, 7)}...`);
});
