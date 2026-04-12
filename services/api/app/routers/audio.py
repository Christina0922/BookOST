from pathlib import Path

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import FileResponse

router = APIRouter(tags=["audio"])


@router.get("/audio/{job_id}")
async def stream_audio(job_id: str, disposition: str | None = None) -> Response:
    path = Path("data") / "out" / f"{job_id}_final.wav"
    if not path.exists():
        raise HTTPException(status_code=404, detail="audio not found")
    headers = {}
    if disposition == "attachment":
        headers["Content-Disposition"] = 'attachment; filename="bookost.wav"'
    return FileResponse(path, media_type="audio/wav", headers=headers)
