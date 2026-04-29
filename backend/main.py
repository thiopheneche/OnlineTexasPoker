from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Set
import asyncio
import json
import uuid
import math
import logging
from pathlib import Path
from datetime import datetime, timedelta
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
USER_DATA_PATH = Path(__file__).parent / "data" / "users.json"
RECONNECT_GRACE_SECONDS = 60
logger = logging.getLogger("texas_poker")

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
            stale_connections = []
            for connection in self.active_connections[table_id]:
                try:
                    await connection.send_text(state_json)
                except Exception:
                    stale_connections.append(connection)
            for connection in stale_connections:
                self.disconnect(connection, table_id)

    async def broadcast_chat(self, table_id: str, sender: str, message: str):
        if table_id in self.active_connections:
            chat_json = json.dumps({"type": "chat", "sender": sender, "message": message})
            stale_connections = []
            for connection in self.active_connections[table_id]:
                try:
                    await connection.send_text(chat_json)
                except Exception:
                    stale_connections.append(connection)
            for connection in stale_connections:
                self.disconnect(connection, table_id)

manager = ConnectionManager()

class CreateTableRequest(BaseModel):
    small_blind: int = 25
    big_blind: int = 50
    username: str = ""

class LoginRequest(BaseModel):
    username: str

class JoinTableRequest(BaseModel):
    username: str

active_users: Set[str] = set()
user_global_chips: Dict[str, int] = {}
active_sessions: Dict[str, str] = {}
table_reconnect_tasks: Dict[str, asyncio.Task] = {}
recent_disconnects: Dict[str, datetime] = {}


def _load_users():
    USER_DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not USER_DATA_PATH.exists():
        USER_DATA_PATH.write_text("{}", encoding="utf-8")
        return {}
    try:
        raw = json.loads(USER_DATA_PATH.read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else {}
    except Exception:
        return {}


def _save_users(users: Dict[str, dict]):
    USER_DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    USER_DATA_PATH.write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8")


def _ensure_user(username: str):
    users = _load_users()
    if username not in users:
        users[username] = {
            "global_chips": 5,
            "last_login": None,
        }
        _save_users(users)
    user_global_chips[username] = int(users[username].get("global_chips", 5))
    return users


def _set_user_chips(username: str, chips: int):
    users = _ensure_user(username)
    users[username]["global_chips"] = chips
    user_global_chips[username] = chips
    _save_users(users)


def _mark_last_login(username: str):
    users = _ensure_user(username)
    users[username]["last_login"] = datetime.utcnow().isoformat()
    _save_users(users)


def _cancel_reconnect_task(table_id: str, client_id: str):
    task_key = f"{table_id}:{client_id}"
    task = table_reconnect_tasks.pop(task_key, None)
    if task and not task.done():
        task.cancel()


def _remove_player_from_table(table_id: str, client_id: str):
    if table_id not in tables:
        return
    state = tables[table_id]
    state.players = [p for p in state.players if p.id != client_id]
    if len(state.players) == 0:
        tables.pop(table_id, None)
        decks.pop(table_id, None)
        manager.active_connections.pop(table_id, None)


async def _finalize_player_leave(table_id: str, client_id: str, force_fold: bool):
    if table_id not in tables:
        return

    state = tables[table_id]
    deck = decks[table_id]
    leaving_player = next((p for p in state.players if p.id == client_id), None)
    if leaving_player is None:
        return

    async def cb():
        await manager.broadcast_state(table_id)

    if force_fold and state.phase not in (GamePhase.WAITING, GamePhase.SHOWDOWN) and leaving_player.is_active:
        await PokerEngine.process_action(state, deck, client_id, "fold", 0, cb)
        leaving_player = next((p for p in state.players if p.id == client_id), None)
        if leaving_player is None:
            return

    current_chips = user_global_chips.get(client_id)
    if current_chips is None:
        _ensure_user(client_id)
        current_chips = user_global_chips.get(client_id, 5)
    earned = math.floor(leaving_player.chips / 1000)
    _set_user_chips(client_id, current_chips + earned)
    _remove_player_from_table(table_id, client_id)

    if table_id in tables:
        await manager.broadcast_state(table_id)


async def _schedule_reconnect_cleanup(table_id: str, client_id: str):
    task_key = f"{table_id}:{client_id}"
    try:
        await asyncio.sleep(RECONNECT_GRACE_SECONDS)
        if table_id not in tables:
            return
        state = tables[table_id]
        player = next((p for p in state.players if p.id == client_id), None)
        if player is None or player.is_online:
            return
        await _finalize_player_leave(table_id, client_id, force_fold=True)
        recent_disconnects.pop(client_id, None)
    except asyncio.CancelledError:
        return
    finally:
        table_reconnect_tasks.pop(task_key, None)


def _find_reconnectable_player(username: str):
    for table_id, state in tables.items():
        for player in state.players:
            if player.id == username and not player.is_online:
                return table_id, player
    return None, None


def _debug_table_snapshot(table_id: str):
    state = tables.get(table_id)
    if not state:
        return []
    return [
        {
            "id": p.id,
            "is_online": p.is_online,
            "is_active": p.is_active,
            "chips": p.chips,
        }
        for p in state.players
    ]


@app.post("/api/login")
async def login(req: LoginRequest):
    username = req.username.strip()
    if not username:
        return {"success": False, "error": "请输入有效 ID"}

    _ensure_user(username)
    reconnect_table_id, reconnect_player = _find_reconnectable_player(username)
    logger.info("Login attempt for %s, active=%s, reconnect_table_id=%s", username, username in active_users, reconnect_table_id)

    if username in active_users and reconnect_player is None:
        return {"success": False, "error": "该 ID 当前已在线，请换一个名称"}

    locked_until = recent_disconnects.get(username)
    if locked_until and datetime.utcnow() - locked_until > timedelta(seconds=RECONNECT_GRACE_SECONDS):
        recent_disconnects.pop(username, None)
        locked_until = None

    return {
        "success": True,
        "global_chips": user_global_chips.get(username, 5),
        "reconnect_locked": bool(locked_until),
        "reconnect_table_id": reconnect_table_id,
    }


@app.websocket("/ws/session/{username}")
async def session_websocket(websocket: WebSocket, username: str):
    username = username.strip()
    await websocket.accept()
    _ensure_user(username)
    session_id = str(uuid.uuid4())
    active_sessions[username] = session_id
    active_users.add(username)
    _mark_last_login(username)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if active_sessions.get(username) == session_id:
            active_sessions.pop(username, None)
            active_users.discard(username)


@app.get("/api/users")
async def get_users():
    return {"users": list(active_users), "count": len(active_users)}


@app.get("/api/chips/{username}")
async def get_chips(username: str):
    _ensure_user(username)
    return {"global_chips": user_global_chips.get(username, 0)}


@app.post("/api/tables/join/{table_id}")
async def join_table(table_id: str, req: JoinTableRequest):
    if table_id not in tables:
        return {"success": False, "error": "该牌桌不存在"}

    username = req.username.strip()
    state = tables[table_id]
    existing_player = next((p for p in state.players if p.id == username), None)
    if existing_player:
        if existing_player.is_online:
            return {"success": False, "error": "你已在该牌桌中"}
        return {"success": True, "global_chips": user_global_chips.get(username, 0), "rejoin": True}

    _ensure_user(username)
    chips = user_global_chips.get(username, 0)
    if chips < 1:
        return {"success": False, "error": "全局筹码不足！需要至少 1 枚全局筹码才能入座"}
    _set_user_chips(username, chips - 1)
    return {"success": True, "global_chips": user_global_chips[username], "rejoin": False}


@app.get("/api/tables")
async def get_tables():
    result = []
    for tid, state in tables.items():
        result.append({
            "table_id": tid,
            "phase": state.phase,
            "player_count": sum(1 for p in state.players if p.is_online)
        })
    return result


@app.post("/api/tables")
async def create_table(req: CreateTableRequest):
    if req.username:
        _ensure_user(req.username)
        chips = user_global_chips.get(req.username, 0)
        if chips < 1:
            return {"success": False, "error": "全局筹码不足！需要至少 1 枚全局筹码才能建桌"}
        _set_user_chips(req.username, chips - 1)

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

    _ensure_user(client_id)
    global_game_state = tables[table_id]
    global_deck = decks[table_id]

    await manager.connect(websocket, table_id)
    logger.info("Table websocket connected: table=%s, client=%s", table_id, client_id)
    _cancel_reconnect_task(table_id, client_id)
    recent_disconnects.pop(client_id, None)

    player = next((p for p in global_game_state.players if p.id == client_id), None)
    if player is None:
        player = Player(id=client_id, name=client_id, chips=1000, is_online=True)
        global_game_state.players.append(player)
    else:
        player.is_online = True
        if player.chips > 0 and global_game_state.phase != GamePhase.SHOWDOWN:
            player.is_active = True

    await manager.broadcast_state(table_id)
    logger.info("Broadcast after connect: table=%s snapshot=%s", table_id, _debug_table_snapshot(table_id))

    async def cb():
        await manager.broadcast_state(table_id)

    explicit_leave = False

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

                if action == "leave":
                    explicit_leave = True
                    logger.info("Explicit leave: table=%s, client=%s", table_id, client_id)
                    await _finalize_player_leave(table_id, client_id, force_fold=True)
                    await websocket.close()
                    break

                amount = action_data.get("amount", 0)
                await PokerEngine.process_action(global_game_state, global_deck, client_id, action, amount, cb)

            except json.JSONDecodeError:
                pass

            await manager.broadcast_state(table_id)

    except WebSocketDisconnect:
        logger.info("WebSocketDisconnect: table=%s, client=%s", table_id, client_id)
        pass
    finally:
        manager.disconnect(websocket, table_id)
        if explicit_leave:
            return
        if table_id not in tables:
            return
        player = next((p for p in tables[table_id].players if p.id == client_id), None)
        if player is None:
            return
        player.is_online = False
        recent_disconnects[client_id] = datetime.utcnow()
        logger.info("Player %s disconnected from table %s, marking offline, snapshot_before=%s", client_id, table_id, _debug_table_snapshot(table_id))
        await manager.broadcast_state(table_id)
        logger.info("Broadcast after disconnect: table=%s snapshot_after=%s", table_id, _debug_table_snapshot(table_id))
        task_key = f"{table_id}:{client_id}"
        table_reconnect_tasks[task_key] = asyncio.create_task(_schedule_reconnect_cleanup(table_id, client_id))
