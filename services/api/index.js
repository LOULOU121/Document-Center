const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const express = require("express");
const app = express();
const port = 3000;
const upload = multer({ dest: "uploads/" });
const db = require('./db');

const cors = require('cors');

// Allow your frontend origin only:
app.use(cors({
  origin: 'http://localhost:5173'
}));


app.use(express.json());

app.get("/", (req, res) => {
  res.send("API is running ✅");
});

function safeParseLLM(raw) {
  let cleaned = raw.replace(/```json/gi, '')
    .replace(/```/g, '')
    .split('#')[0]   // crude removal of trailing comment
    .trim()
    .replace(/'/g, '"') // single to double quotes
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']');

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error("❌ LLM output is not valid JSON. Fallback to {}. Raw:", cleaned);
    parsed = {};
  }
  return parsed;
}

const statusMap = {}; // e.g., { "123e4567": "queued" }

const path = require('path');

app.post("/api/documents", upload.single("file"), async (req, res) => {
  const documentId = uuidv4();
  statusMap[documentId] = "queued";

  await db.query(
    'INSERT INTO documents (id, filename, originalname, status) VALUES ($1, $2, $3, $4)',
    [documentId, req.file.filename, req.file.originalname, 'queued']
  );

  try {
    // ✅ 1) Mark as processing
    statusMap[documentId] = "processing";

    // ✅ 2) Build form data for OCR call
    const formData = new FormData();
    formData.append("file", fs.createReadStream(req.file.path));

    // ✅ 3) Call OCR microservice inside Docker network
    const ocrResponse = await axios.post("http://ocr:5001/process", formData, {
      headers: formData.getHeaders(),
    });

    // ✅ 4) OCR returns blocks
    const blocks = ocrResponse.data.blocks;

    for (const block of blocks) {
      await db.query(
        'INSERT INTO ocr_blocks (document_id, block) VALUES ($1, $2)',
        [documentId, block]
      );
    }


    // ✅ 5) For now, just log them — later you’ll save to DB
    console.log(`Blocks for ${documentId}:`, blocks);

    const systemPrompt = `
  You are a JSON generator bot.
  Only output a single valid JSON object.
  No code fences. No explanations.
  Example: {"client_name":"Jane Doe","address":"123 Example St."}
`;

    const userPrompt = `
  OCR Blocks: ${JSON.stringify(blocks)}
  Instruction: Extract standard fields as JSON.
`;

    const ollamaResponse = await axios.post(
      "http://ollama:11434/api/generate",
      {
        model: "deepseek-coder",
        prompt: `${systemPrompt}\n${userPrompt}`,
        stream: false,
      }
    );

    const raw = ollamaResponse.data.response;
    const parsedSpec = safeParseLLM(raw);

    const version = await db.getNextSpecVersion(documentId);

    await db.query(
      'INSERT INTO specs (document_id, version, spec) VALUES ($1, $2, $3)',
      [documentId, version, parsedSpec]
    );

    // ✅ 6) Mark as done
    statusMap[documentId] = "done";

    // ✅ 7) Respond with ID + blocks
    res.json({ documentId, blocks });
  } catch (error) {
    console.error("OCR call failed:", error);
    statusMap[documentId] = "error";
    res.status(500).json({ error: "OCR failed" });
  }
});

app.get("/api/documents/:id/status", (req, res) => {
  const id = req.params.id;
  const status = statusMap[id];

  if (!status) {
    return res.status(404).json({ error: "Not found" });
  }

  res.json({ status });
});

app.post("/api/templates/spec", async (req, res) => {
  try {
    // ✅ 1) Extract OCR blocks & user instruction
    const { blocks, instruction, documentId } = req.body;
    const version = await db.getNextSpecVersion(documentId);

    // ✅ 2) Build a clear system + user prompt
    const systemPrompt = `
      You are a JSON generator bot.
      Your job is to extract fields from OCR blocks based on instructions.
      You MUST output ONLY a VALID JSON object.
      Do not add ANY explanation, code block, or text.
      Just output the JSON — nothing else.
      Example: {"client_name":"Jane Doe","address":"123 Example St."}
    `;

    const userPrompt = `
      OCR Blocks: ${JSON.stringify(blocks)}

      Instruction: ${instruction}

      Return your answer EXACTLY in this format:
      {"client_name":"Jane Doe","address":"123 Example St."}
      No other text.
`;

    // ✅ 3) Call Ollama running in Docker network (hostname: ollama)
    const ollamaResponse = await axios.post(
      "http://ollama:11434/api/generate",
      {
        model: "deepseek-coder",
        prompt: `${systemPrompt}\n${userPrompt}`,
        stream: false, // ✅ disables chunked streaming
      }
    );
    console.log("Full Ollama reply:", ollamaResponse.data);

    // ✅ 4) Return raw LLM response to client
    const raw = ollamaResponse.data.response;
    const parsedSpec = safeParseLLM(raw);

    await db.query(
      'INSERT INTO specs (document_id, version, spec) VALUES ($1, $2, $3)',
      [documentId, version, parsedSpec]
    );

    res.json({ spec: parsedSpec });


  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Spec generation failed" });
  }
});

app.get('/api/documents/:id', async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM documents WHERE id = $1',
    [req.params.id]
  );
  const blocks = await db.query(
    'SELECT block FROM ocr_blocks WHERE document_id = $1',
    [req.params.id]
  );
  res.json({ document: rows[0], blocks: blocks.rows });
});

app.get('/api/documents/:id/specs', async (req, res) => {
  const { rows } = await db.query(
    'SELECT version, spec, created_at FROM specs WHERE document_id = $1 ORDER BY version ASC',
    [req.params.id]
  );
  res.json({ specs: rows });
});

app.post('/api/documents/:id/specs/new', async (req, res) => {
  try {
    // ✅ 1️⃣ Extract URL param and body
    const documentId = req.params.id;
    const { instruction } = req.body;

    // ✅ 2️⃣ Fetch blocks for this doc from DB
    const { rows } = await db.query(
      'SELECT block FROM ocr_blocks WHERE document_id = $1',
      [documentId]
    );
    const blocks = rows.map(r => r.block);

    // ✅ 3️⃣ Mark doc as processing
    await db.query(
      'UPDATE documents SET status = $1 WHERE id = $2',
      ['processing', documentId]
    );

    // ✅ 4️⃣ Build prompt and call Ollama
    const systemPrompt = `
  You are a JSON bot.
  ONLY output a single, valid, compact JSON object.
  NO code fences. NO markdown. NO comments. NO explanation.
  Example: {"client_name":"Jane Doe","address":"123 Example St."}
  If unsure, just return an empty JSON object {}.
`;
    const userPrompt = `
      OCR Blocks: ${JSON.stringify(blocks)}
      Instruction: ${instruction}
    `;
    const ollamaResponse = await axios.post('http://ollama:11434/api/generate', {
      model: "deepseek-coder",
      prompt: `${systemPrompt}\n${userPrompt}`,
      stream: false
    });

    const raw = ollamaResponse.data.response;
    const parsedSpec = safeParseLLM(raw);

    // ✅ 5️⃣ Get next version number using your helper
    const version = await db.getNextSpecVersion(documentId);

    await db.query(
      'INSERT INTO specs (document_id, version, spec) VALUES ($1, $2, $3)',
      [documentId, version, parsedSpec]
    );

    // ✅ 7️⃣ Mark doc as done
    await db.query(
      'UPDATE documents SET status = $1 WHERE id = $2',
      ['done', documentId]
    );

    // ✅ 8️⃣ Respond
    res.json({ spec: parsedSpec, version });

  } catch (error) {
    console.error("Spec regeneration error:", error);
    res.status(500).json({ error: 'Spec regeneration failed' });
  }
});

app.get('/api/documents/:id/download', async (req, res) => {
  const { rows } = await db.query(
    'SELECT filename, originalname FROM documents WHERE id = $1',
    [req.params.id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Document not found' });
  }

  const filename = rows[0].filename;
  const originalname = rows[0].originalname;
  const filePath = path.join(__dirname, 'uploads', filename);

  res.download(filePath, filename, (err) => {
    if (err) {
      console.error('File download error:', err);
      res.status(500).send('Error downloading file.');
    }
  });
});





app.listen(port, () => {
  console.log(`API server listening at http://localhost:${port}`);
});
