import os
import sys
import logging
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Literal

import json
import uvicorn
from fastapi import FastAPI, APIRouter, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from dotenv import load_dotenv

load_dotenv()

LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        RotatingFileHandler(
            LOG_DIR / "multiagent.log",
            maxBytes=10 * 1024 * 1024,
            backupCount=5,
        ),
    ],
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Multi-Agent Consulting System starting up")
    yield
    logger.info("Multi-Agent Consulting System shutting down")


app = FastAPI(
    title="Multi-Agent Consulting System",
    description="Dual-mode multi-agent AI consulting system using CrewAI and custom engine",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    start_time = time.time()
    logger.info(f"Request: {request.method} {request.url.path}")
    response = await call_next(request)
    duration = time.time() - start_time
    logger.info(f"Response: {response.status_code} ({duration:.3f}s)")
    return response


class ChatRequest(BaseModel):
    user_id: str = Field(default="anonymous", description="User identifier")
    query: str = Field(..., description="The consulting query to analyze")
    mode: Literal["crew", "engine"] = Field(
        default="engine",
        description="Mode: 'crew' for CrewAI, 'engine' for custom orchestrator",
    )


class ChatDetails(BaseModel):
    analysis: str | None = None
    plan: str | None = None
    critique: str | None = None
    psychology: str | None = None


class ChatResponse(BaseModel):
    answer: str
    mode: str
    details: ChatDetails


router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/", response_class=HTMLResponse)
async def root():
    html_path = Path(__file__).parent / "static" / "index.html"
    return HTMLResponse(content=html_path.read_text())


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    logger.info(f"Chat request: user_id={request.user_id} mode={request.mode} query_length={len(request.query)}")

    if not request.query.strip():
        return JSONResponse(status_code=400, content={"error": "Query cannot be empty"})

    try:
        if request.mode == "crew":
            result = await _run_crew_mode(request)
        else:
            result = await _run_engine_mode(request)

        return ChatResponse(
            answer=result["answer"],
            mode=request.mode,
            details=ChatDetails(**result.get("details", {})),
        )
    except ValueError as e:
        logger.error(f"Configuration error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})
    except Exception as e:
        logger.exception(f"Error processing chat request: {e}")
        return JSONResponse(status_code=500, content={"error": f"Processing error: {str(e)}"})


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """SSE streaming endpoint — yields agent progress events as they complete."""
    if request.mode != "engine":
        return JSONResponse(status_code=400, content={"error": "Streaming only supported in engine mode"})

    if not request.query.strip():
        return JSONResponse(status_code=400, content={"error": "Query cannot be empty"})

    async def event_generator():
        try:
            from core_engine.orchestrator import handle_query_stream
            async for event in handle_query_stream(request.query, request.user_id):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.exception(f"Streaming error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            yield "data: {\"type\": \"done\"}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


async def _run_engine_mode(request: ChatRequest) -> dict:
    from core_engine.orchestrator import handle_query
    return await handle_query(query=request.query, user_id=request.user_id)


async def _run_crew_mode(request: ChatRequest) -> dict:
    import asyncio
    from crewai_app.crew_psy_team import run_crew

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, run_crew, request.query, request.user_id)
    return result


app.include_router(router, prefix="/multiagent")
app.include_router(router, prefix="")

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    logger.info(f"Starting server on port {port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
