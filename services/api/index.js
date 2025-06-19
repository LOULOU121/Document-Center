const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const app = express();
const port = 3000;
const upload = multer({ dest: 'uploads/' });

app.use(express.json());

app.get('/', (req, res) => {
  res.send('API is running ✅');
});

const statusMap = {}; // e.g., { "123e4567": "queued" }

app.post('/api/documents', upload.single('file'), async (req, res) => {
  const documentId = uuidv4();
  statusMap[documentId] = 'queued';

  try {
    // ✅ 1) Mark as processing
    statusMap[documentId] = 'processing';

    // ✅ 2) Build form data for OCR call
    const formData = new FormData();
    formData.append('file', fs.createReadStream(req.file.path));

    // ✅ 3) Call OCR microservice inside Docker network
    const ocrResponse = await axios.post('http://ocr:5001/process', formData, {
      headers: formData.getHeaders()
    });

    // ✅ 4) OCR returns blocks
    const blocks = ocrResponse.data.blocks;

    // ✅ 5) For now, just log them — later you’ll save to DB
    console.log(`Blocks for ${documentId}:`, blocks);

    // ✅ 6) Mark as done
    statusMap[documentId] = 'done';

    // ✅ 7) Respond with ID + blocks
    res.json({ documentId, blocks });

  } catch (error) {
    console.error('OCR call failed:', error);
    statusMap[documentId] = 'error';
    res.status(500).json({ error: 'OCR failed' });
  }
});


app.get('/api/documents/:id/status', (req, res) => {
  const id = req.params.id;
  const status = statusMap[id];

  if (!status) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.json({ status });
});

app.listen(port, () => {
  console.log(`API server listening at http://localhost:${port}`);
});
