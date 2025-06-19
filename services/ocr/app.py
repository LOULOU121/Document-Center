from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse

app = FastAPI()

@app.post("/process")
async def process_pdf(file: UploadFile = File(...)):
    fake_blocks = [
        {"text": "Hello World", "x": 10, "y": 20, "width": 100, "height": 20},
        {"text": "This is a test.", "x": 15, "y": 50, "width": 200, "height": 25}
    ]
    return JSONResponse(content={"blocks": fake_blocks})
