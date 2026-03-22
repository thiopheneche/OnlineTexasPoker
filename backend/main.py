from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Set
import json
import uuid
import math
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

    async def broadcast_chat(self, table_id: str, sender: str, message: str):
        if table_id in self.active_connections:
            chat_json = json.dumps({"type": "chat", "sender": sender, "message": message})
            for connection in self.active_connections[table_id]:
                try:
                    await connection.send_text(chat_json)
                except Exception:
                    pass

manager = ConnectionManager()

class CreateTableRequest(BaseModel):
    small_blind: int = 25
    big_blind: int = 50
    username: str = ""

active_users: Set[str] = set()
user_global_chips: Dict[str, int] = {}

class LoginRequest(BaseModel):
    username: str

@app.post("/api/login")
async def login(req: LoginRequest):
    if req.username in active_users:
        return {"success": False, "error": "该 ID 当前已在线，请换一个名称"}
    # Initialize global chips for new users
    if req.username not in user_global_chips:
        user_global_chips[req.username] = 5
    return {"success": True, "global_chips": user_global_chips.get(req.username, 5)}

@app.websocket("/ws/session/{username}")
async def session_websocket(websocket: WebSocket, username: str):
    await websocket.accept()
    active_users.add(username)
    # Ensure chips are initialized
    if username not in user_global_chips:
        user_global_chips[username] = 5
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        active_users.discard(username)
        # Clean up global chips when user goes offline
        # (keep chips in memory so they persist if user reconnects)

@app.get("/api/users")
async def get_users():
    return {"users": list(active_users), "count": len(active_users)}

@app.get("/api/chips/{username}")
async def get_chips(username: str):
    return {"global_chips": user_global_chips.get(username, 0)}

class JoinTableRequest(BaseModel):
    username: str

@app.post("/api/tables/join/{table_id}")
async def join_table(table_id: str, req: JoinTableRequest):
    if table_id not in tables:
        return {"success": False, "error": "该牌桌不存在"}
    chips = user_global_chips.get(req.username, 0)
    if chips < 1:
        return {"success": False, "error": "全局筹码不足！需要至少 1 枚全局筹码才能入座"}
    user_global_chips[req.username] = chips - 1
    return {"success": True, "global_chips": user_global_chips[req.username]}

@app.get("/api/tables")
async def get_tables():
    result = []
    for tid, state in tables.items():
        result.append({
            "table_id": tid,
            "phase": state.phase,
            "player_count": sum(1 for p in state.players if p.is_active)
        })
    return result

@app.post("/api/tables")
async def create_table(req: CreateTableRequest):
    # Validate global chips
    if req.username:
        chips = user_global_chips.get(req.username, 0)
        if chips < 1:
            return {"success": False, "error": "全局筹码不足！需要至少 1 枚全局筹码才能建桌"}
        user_global_chips[req.username] = chips - 1
    
    tid = str(uuid.uuid4())[:8]
    tables[tid] = GameState(
        table_id=tid, 
        small_blind=req.small_blind, 
        big_blind=req.big_blind,
        min_raise=req.big_blind
    )
    decks[tid] = Deck()
    return {"success": True, "table_id": tid, "global_chips": user_global_chips.get(req.username, 0)}

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
                
                if action == "chat":
                    chat_msg = action_data.get("message", "").strip()
                    if chat_msg:
                        await manager.broadcast_chat(table_id, client_id, chat_msg)
                    continue
                
                amount = action_data.get("amount", 0)
                await PokerEngine.process_action(global_game_state, global_deck, client_id, action, amount, cb)
                        
            except json.JSONDecodeError:
                pass
                
            await manager.broadcast_state(table_id)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket, table_id)
        
        # Calculate global chips earned from this session
        leaving_player = None
        for p in global_game_state.players:
            if p.id == client_id:
                leaving_player = p
                break
        
        if leaving_player and client_id in user_global_chips:
            earned = math.floor(leaving_player.chips / 1000)
            user_global_chips[client_id] += earned
        
        if global_game_state.phase not in (GamePhase.WAITING, GamePhase.SHOWDOWN):
            await PokerEngine.process_action(global_game_state, global_deck, client_id, "fold", 0, cb)
            
        global_game_state.players = [p for p in global_game_state.players if p.id != client_id]
        
        if len(global_game_state.players) == 0:
            if table_id in tables:
                del tables[table_id]
            if table_id in decks:
                del decks[table_id]
            if table_id in manager.active_connections:
                del manager.active_connections[table_id]
        else:
            await manager.broadcast_state(table_id)
