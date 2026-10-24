"""
QueryPilot Reference FastAPI Backend Server
Provides real-time WebSockets and REST APIs for multi-agent schema investigations.
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio
import json
from typing import List, Dict, Any

app = FastAPI(title="QueryPilot API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class InvestigationRequest(BaseModel):
    prompt: str
    schemaId: str

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        for connection in self.active_connections:
            await connection.send_json(message)

manager = ConnectionManager()

@app.websocket("/ws/investigations")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle client commands if any
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.post("/api/investigations/start")
async def start_investigation(req: InvestigationRequest):
    # Asynchronously dispatch multi-agent crew steps
    asyncio.create_task(run_agent_pipeline(req.prompt, req.schemaId))
    return {"status": "started", "prompt": req.prompt}

async def run_agent_pipeline(prompt: str, schema_id: str):
    # Step 1: Hypothesis
    await manager.broadcast({
        "type": "agent:step",
        "agentId": "agent_nova",
        "agentName": "Captain Nova",
        "task": f"Formulating query plan for: {prompt}",
        "thought": "Decomposing query constraints and target tables.",
        "progress": 20
    })
    await asyncio.sleep(1.5)

    # Step 2: SQL Execution
    sql_example = "SELECT status, count(*) FROM orders GROUP BY status;"
    await manager.broadcast({
        "type": "sql:executing",
        "queryId": "q_1",
        "agentId": "agent_cipher",
        "sql": sql_example,
        "targetTables": ["orders"]
    })
    await asyncio.sleep(1.5)

    await manager.broadcast({
        "type": "sql:executed",
        "queryId": "q_1",
        "sql": sql_example,
        "rowsAffected": 5420000,
        "durationMs": 42
    })
    await asyncio.sleep(1.5)

    # Step 3: Verification
    await manager.broadcast({
        "type": "verification:passed",
        "assertion": "Foreign key referential integrity constraint verified.",
        "details": "0 orphaned records found."
    })
    await asyncio.sleep(1.0)

    # Step 4: Completion
    await manager.broadcast({
        "type": "investigation:completed",
        "missionId": "m_1",
        "summary": "Investigation completed with full integrity.",
        "rootCause": "Timeout anomaly identified.",
        "remedy": "Index optimization recommended."
    })

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
