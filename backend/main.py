from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Set, Any
import json
import uuid
import math
import os
import time
import asyncio
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

# --- Persistent Users Data ---
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
ACCOUNT_TTL_SECONDS = 24 * 60 * 60

def normalize_user_record(username: str, data: Any, now: float | None = None) -> Dict[str, Any]:
    timestamp = now if now is not None else time.time()
    if isinstance(data, dict):
        chips = int(data.get("global_chips", 5))
        last_login_at = float(data.get("last_login_at", timestamp))
        return {"global_chips": chips, "last_login_at": last_login_at}
    return {"global_chips": int(data), "last_login_at": timestamp}

def load_users() -> Dict[str, Dict[str, Any]]:
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, "r", encoding="utf-8") as f:
                raw_data = json.load(f)
                now = time.time()
                if isinstance(raw_data, dict):
                    return {
                        username: normalize_user_record(username, user_data, now)
                        for username, user_data in raw_data.items()
                    }
        except Exception:
            pass
    return {}

def save_users(users_data: Dict[str, Dict[str, Any]]):
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users_data, f, ensure_ascii=False, indent=2)

user_accounts: Dict[str, Dict[str, Any]] = load_users()

def save_accounts():
    save_users(user_accounts)

def purge_expired_accounts(now: float | None = None):
    current_time = now if now is not None else time.time()
    expired_usernames = [
        username
        for username, account in user_accounts.items()
        if current_time - float(account.get("last_login_at", 0)) > ACCOUNT_TTL_SECONDS
        and username not in active_users
    ]
    if not expired_usernames:
        return
    for username in expired_usernames:
        user_accounts.pop(username, None)
        disconnected_users.pop(username, None)
    save_accounts()

def ensure_account(username: str, now: float | None = None) -> Dict[str, Any]:
    current_time = now if now is not None else time.time()
    purge_expired_accounts(current_time)
    account = user_accounts.get(username)
    if account is None:
        account = {"global_chips": 5, "last_login_at": current_time}
        user_accounts[username] = account
        save_accounts()
    return account

def update_last_login(username: str, now: float | None = None):
    current_time = now if now is not None else time.time()
    account = ensure_account(username, current_time)
    account["last_login_at"] = current_time
    save_accounts()

def get_global_chips(username: str) -> int:
    return int(user_accounts.get(username, {}).get("global_chips", 0))

def set_global_chips(username: str, chips: int):
    account = ensure_account(username)
    account["global_chips"] = chips
    save_accounts()

active_users: Set[str] = set()
disconnected_users: Dict[str, float] = {}
disconnect_tasks: Dict[str, asyncio.Task] = {}

class CreateTableRequest(BaseModel):
    small_blind: int = 25
    big_blind: int = 50
    username: str = ""

class LoginRequest(BaseModel):
    username: str

@app.post("/api/login")
async def login(req: LoginRequest):
    now = time.time()
    purge_expired_accounts(now)
    if req.username in active_users:
        return {"success": False, "error": "该 ID 当前已在线，请换一个名称"}
    
    if req.username in disconnected_users:
        if now - disconnected_users[req.username] < 60:
            pass
            
    account = ensure_account(req.username, now)
    update_last_login(req.username, now)
        
    return {"success": True, "global_chips": account["global_chips"]}

@app.websocket("/ws/session/{username}")
async def session_websocket(websocket: WebSocket, username: str):
    await websocket.accept()
    active_users.add(username)
    if username in disconnected_users:
        del disconnected_users[username]
        
    ensure_account(username)
    update_last_login(username)
        
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        active_users.discard(username)
        disconnected_users[username] = time.time()

@app.get("/api/users")
async def get_users():
    return {"users": list(active_users), "count": len(active_users)}

@app.get("/api/chips/{username}")
async def get_chips(username: str):
    purge_expired_accounts()
    return {"global_chips": get_global_chips(username)}

class JoinTableRequest(BaseModel):
    username: str

@app.post("/api/tables/join/{table_id}")
async def join_table(table_id: str, req: JoinTableRequest):
    if table_id not in tables:
        return {"success": False, "error": "该牌桌不存在"}
    account = ensure_account(req.username)
    chips = int(account["global_chips"])
    if chips < 1:
        return {"success": False, "error": "全局筹码不足！需要至少 1 枚全局筹码才能入座"}
    set_global_chips(req.username, chips - 1)
    return {"success": True, "global_chips": get_global_chips(req.username)}

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
    if req.username:
        account = ensure_account(req.username)
        chips = int(account["global_chips"])
        if chips < 1:
            return {"success": False, "error": "全局筹码不足！需要至少 1 枚全局筹码才能建桌"}
        set_global_chips(req.username, chips - 1)
    
    tid = str(uuid.uuid4())[:8]
    tables[tid] = GameState(
        table_id=tid, 
        small_blind=req.small_blind, 
        big_blind=req.big_blind,
        min_raise=req.big_blind
    )
    decks[tid] = Deck()
    return {"success": True, "table_id": tid, "global_chips": get_global_chips(req.username)}

async def execute_leave_cleanup(table_id: str, client_id: str, cb):
    if table_id not in tables:
        return
    global_game_state = tables[table_id]
    global_deck = decks[table_id]
    
    leaving_player = next((p for p in global_game_state.players if p.id == client_id), None)
    if leaving_player:
        account = ensure_account(client_id)
        earned = math.floor(leaving_player.chips / 1000)
        account["global_chips"] = int(account["global_chips"]) + earned
        save_accounts()

    if leaving_player:
        leaving_player.is_ready = False
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

@app.websocket("/ws/{table_id}/{client_id}")
async def websocket_endpoint(websocket: WebSocket, table_id: str, client_id: str):
    if table_id not in tables:
        await websocket.close()
        return
        
    global_game_state = tables[table_id]
    global_deck = decks[table_id]
    
    await manager.connect(websocket, table_id)
    
    if client_id in disconnect_tasks:
        disconnect_tasks[client_id].cancel()
        del disconnect_tasks[client_id]
    
    if not any(p.id == client_id for p in global_game_state.players):
        new_player = Player(id=client_id, name=client_id, chips=1000)
        global_game_state.players.append(new_player)
    else:
        for p in global_game_state.players:
            if p.id == client_id:
                p.is_online = True
    await manager.broadcast_state(table_id)
    
    async def cb():
        await manager.broadcast_state(table_id)

    try:
        while True:
            data_str = await websocket.receive_text()
            try:
                action_data = json.loads(data_str)
                action = action_data.get("action")
                
                if action == "leave":
                    await execute_leave_cleanup(table_id, client_id, cb)
                    await websocket.close()
                    return
                
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
        
        for p in global_game_state.players:
            if p.id == client_id:
                p.is_online = False
        await manager.broadcast_state(table_id)
        
        async def cleanup_task():
            await asyncio.sleep(60)
            if client_id in disconnect_tasks:
                del disconnect_tasks[client_id]
            # Verify if still offline and exists in table
            if table_id in tables:
                current_state = tables[table_id]
                p_current = next((p for p in current_state.players if p.id == client_id), None)
                if p_current and not p_current.is_online:
                    await execute_leave_cleanup(table_id, client_id, cb)
                    
        task = asyncio.create_task(cleanup_task())
        disconnect_tasks[client_id] = task
