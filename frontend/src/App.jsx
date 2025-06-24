import React, { useState, useEffect } from "react";

function App() {
  const [documentId, setDocumentId] = useState(null);
  const [status, setStatus] = useState("");
  const [specs, setSpecs] = useState([]);
  const [instruction, setInstruction] = useState("");

  const handleUpload = async (e) => {
    e.preventDefault();
    const file = e.target.fileInput.files[0];
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("http://localhost:3000/api/documents", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    setDocumentId(data.documentId);
    setStatus("queued");
    pollStatus(data.documentId);
    loadSpecs(data.documentId);
  };

  const pollStatus = async (id) => {
    const res = await fetch(`http://localhost:3000/api/documents/${id}/status`);
    const data = await res.json();
    setStatus(data.status);

    if (data.status !== "done") {
      setTimeout(() => pollStatus(id), 2000);
    } else {
      loadSpecs(id);
    }
  };

  const loadSpecs = async (id) => {
    const res = await fetch(`http://localhost:3000/api/documents/${id}/specs`);
    const data = await res.json();
    setSpecs(data.specs);
  };

  const regenerate = async () => {
    if (!documentId) return;
    const res = await fetch(
      `http://localhost:3000/api/documents/${documentId}/specs/new`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: instruction || "Regenerate default",
        }),
      }
    );
    const data = await res.json();
    alert(`New version: ${data.version}`);
    loadSpecs(documentId);
  };

  return (
    <div style={{ padding: 40 }}>
      <h1>Document Center</h1>

      <form onSubmit={handleUpload}>
        <input name="fileInput" type="file" accept="application/pdf" required />
        <button type="submit">Upload PDF</button>
      </form>

      <p>Status: {status}</p>

      <h2>Specs:</h2>
      <pre>{JSON.stringify(specs, null, 2)}</pre>

      {documentId && (
        <div>
          <a
            href={`http://localhost:3000/api/documents/${documentId}/download`}
            target="_blank"
            rel="noreferrer"
          >
            Download Original PDF
          </a>
        </div>
      )}

      <h3>Regenerate Spec:</h3>
      <input
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="New instruction"
      />
      <button onClick={regenerate}>Regenerate</button>
    </div>
  );
}

export default App;
