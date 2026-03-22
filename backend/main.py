from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Set
import json
import uuid
from pydantic import BaseModel
from poker_logic.game_state import GameState, GamePhase, Player
from poker_logic.deck import Deck
from poker_logic.game import PokerEngine

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

tables: Dict[str, GameState] = {}
decks: Dict[str, Deck] = {}

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, table_id: str):
        await websocket.accept()
        if table_id not in self.active_connections:
            self.active_connections[table_id] = []
        self.active_connections[table_id].append(websocket)

    def disconnect(self, websocket: WebSocket, table_id: str):
        if table_id in self.active_connections:
            if websocket in self.active_connections[table_id]:
                self.active_connections[table_id].remove(websocket)

    async def broadcast_state(self, table_id: str):
        if table_id in tables and table_id in self.active_connections:
            state_json = tables[table_id].model_dump_json()
            for connection in self.active_connections[table_id]:
                try:
                    await connection.send_text(state_json)
                except Exception:
                    pass

manager = ConnectionManager()

class CreateTableRequest(BaseModel):
    small_blind: int = 25
    big_blind: int = 50

active_users: Set[str] = set()

class LoginRequest(BaseModel):
    username: str

@app.post("/login")
async def login(req: LoginRequest):
    if req.username in active_users:
        return {"success": False, "error": "该 ID 当前已在线，请换一个名称"}
    return {"success": True}

@app.websocket("/ws/session/{username}")
async def session_websocket(websocket: WebSocket, username: str):
    await websocket.accept()
    active_users.add(username)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        active_users.discard(username)

@app.get("/tables")
async def get_tables():
    result = []
    for tid, state in tables.items():
        result.append({
            "table_id": tid,
            "phase": state.phase,
            "player_count": sum(1 for p in state.players if p.is_active)
        })
    return result

@app.post("/tables")
async def create_table(req: CreateTableRequest):
    tid = str(uuid.uuid4())[:8]
    tables[tid] = GameState(
        table_id=tid, 
        small_blind=req.small_blind, 
        big_blind=req.big_blind,
        min_raise=req.big_blind
    )
    decks[tid] = Deck()
    return {"table_id": tid}

@app.websocket("/ws/{table_id}/{client_id}")
async def websocket_endpoint(websocket: WebSocket, table_id: str, client_id: str):
    if table_id not in tables:
        await websocket.close()
        return
        
    global_game_state = tables[table_id]
    global_deck = decks[table_id]
    
    await manager.connect(websocket, table_id)
    
    if not any(p.id == client_id for p in global_game_state.players):
        new_player = Player(id=client_id, name=client_id, chips=1000)
        global_game_state.players.append(new_player)
    else:
        for p in global_game_state.players:
            if p.id == client_id:
                p.is_active = True
                
    await manager.broadcast_state(table_id)
    
    async def cb():
        await manager.broadcast_state(table_id)

    try:
        while True:
            data_str = await websocket.receive_text()
            try:
                action_data = json.loads(data_str)
                action = action_data.get("action")
                amount = action_data.get("amount", 0)
                
                await PokerEngine.process_action(global_game_state, global_deck, client_id, action, amount, cb)
                        
            except json.JSONDecodeError:
                pass
                
            await manager.broadcast_state(table_id)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket, table_id)
        
        if global_game_state.phase in (GamePhase.WAITING, GamePhase.SHOWDOWN):
            global_game_state.players = [p for p in global_game_state.players if p.id != client_id]
        else:
            await PokerEngine.process_action(global_game_state, global_deck, client_id, "fold", 0, cb)

        await manager.broadcast_state(table_id)
