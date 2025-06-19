const multer = require('multer');
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

app.post('/api/documents', upload.single('file'), (req, res) => {
  // 1️⃣ Generate a unique ID
  const documentId = uuidv4();

  // 2️⃣ Save its initial status
  statusMap[documentId] = 'queued';

  // 3️⃣ (Optional) You could move the file or rename it here — not needed for now

  // 4️⃣ Respond with the ID
  res.json({ documentId });
});

app.get('/api/documents/:id/status', (req, res) => {
  const id = req.params.id;
  const status = statusMap[id];

  if (!status) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.json({ status });
});

// app.post('/upload', upload.single('file'), (req, res) => {
//   const file = req.file;
//   const filename = uuidv4();
//   const filepath = `uploads/${filename}`;
//   fs.renameSync(file.path, filepath);
//   res.send({ filename, filepath });
// });

app.listen(port, () => {
  console.log(`API server listening at http://localhost:${port}`);
});
