import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { handleQuery } from './agent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/message', async (req, res) => {
  try {
    const { query, resume } = req.body;
    if (!query && !resume) return res.status(400).json({ error: 'Missing query or resume' });

    let response;
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await handleQuery(query || '', resume || null);
        break;
      } catch (err) {
        lastError = err;
        const errStr = String(err);
        if (errStr.includes('429') || errStr.includes('rate_limit')) {
          const waitMatch = errStr.match(/try again in ([\d.]+)s/i);
          const waitSec = waitMatch ? Math.ceil(parseFloat(waitMatch[1])) + 1 : 15;
          console.log(`Rate limited, retrying in ${waitSec}s (attempt ${attempt + 1}/3)...`);
          await new Promise(r => setTimeout(r, waitSec * 1000));
          continue;
        }
        throw err;
      }
    }

    if (!response) {
      return res.status(429).json({
        ok: false,
        error: '⏳ Rate limit reached. Please wait a few seconds and try again.'
      });
    }

    const safe = {};
    if (Array.isArray(response?.messages)) {
      safe.messages = response.messages.map(m => ({ role: m.role, content: m.content }));
    }
    if (Array.isArray(response?.__interrupt__)) {
      safe.__interrupt__ = response.__interrupt__.map(it => ({ id: it.id, value: it.value }));
    }
    if (!safe.messages && !safe.__interrupt__) {
      safe.raw = JSON.parse(JSON.stringify(response));
    }

    return res.json({ ok: true, response: safe });
  } catch (err) {
    console.error(err);
    const errStr = String(err);
    const error = errStr.includes('429') || errStr.includes('rate_limit')
      ? '⏳ Rate limit reached. Please wait 15-20 seconds and try again.'
      : errStr;
    return res.status(500).json({ ok: false, error });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web UI available: http://localhost:${PORT}`));
