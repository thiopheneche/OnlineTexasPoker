from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Set, Any, Optional
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
import store

app = FastAPI()

# 会话改用 httpOnly cookie 之后，allow_origins=["*"] + allow_credentials=True
# 等于允许任意站点带着用户凭据调用本 API，必须收敛成显式白名单。
# 线上前后端同源（nginx 反代 /api 与 /ws），CORS 只在本地开发时才用得上。
ALLOWED_ORIGINS = [
    "https://texaspoker.thiopheneche.dpdns.org",
    "http://localhost:5173",
    "http://localhost:5180",
    "http://localhost:6666",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5180",
    "http://127.0.0.1:6666",
]
_extra_origins = os.environ.get("POKER_ALLOWED_ORIGINS", "")
if _extra_origins:
    ALLOWED_ORIGINS.extend(o.strip() for o in _extra_origins.split(",") if o.strip())

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SESSION_COOKIE = "poker_session"

# 启动时就建库并完成 users.json 迁移，而不是等第一个请求触发
store.connect()

tables: Dict[str, GameState] = {}
decks: Dict[str, Deck] = {}
MAX_TABLE_PLAYERS = 8

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

active_users: Set[str] = set()
disconnected_users: Dict[str, float] = {}
disconnect_tasks: Dict[str, asyncio.Task] = {}

# --- 账号与会话（SQLite，见 store.py）---
# 下面几个函数保留了原来的「按用户名操作」签名，牌局逻辑无需改动；
# 内部统一走 store，把用户名解析成 user_id 之后再读写筹码。

def purge_expired_accounts(now: Optional[float] = None):
    store.purge_expired(active_usernames=active_users, now=now)

def ensure_account(username: str, now: Optional[float] = None) -> Dict[str, Any]:
    """按用户名取账号，不存在则建一个访客账号。"""
    user = store.get_user_by_name(username)
    if user is None:
        user = store.create_guest(username, now)
    return user

def update_last_login(username: str, now: Optional[float] = None):
    user = ensure_account(username, now)
    store.touch_login(user["user_id"], now)

def get_global_chips(username: str) -> int:
    user = store.get_user_by_name(username)
    return int(user["global_chips"]) if user else 0

def set_global_chips(username: str, chips: int):
    user = ensure_account(username)
    store.set_chips(user["user_id"], chips)

def add_global_chips(username: str, delta: int) -> int:
    user = ensure_account(username)
    new_total = int(user["global_chips"]) + int(delta)
    store.set_chips(user["user_id"], new_total)
    return new_total

# --- 会话辅助 ---

def current_user(request: Request) -> Optional[Dict[str, Any]]:
    return store.resolve_session(request.cookies.get(SESSION_COOKIE))

def ws_user(websocket: WebSocket) -> Optional[Dict[str, Any]]:
    return store.resolve_session(websocket.cookies.get(SESSION_COOKIE))

def set_session_cookie(response: Response, request: Request, raw_token: str):
    # 本地开发走 http，Secure cookie 会被浏览器丢弃；线上经 nginx 反代是 https。
    forwarded_proto = request.headers.get("x-forwarded-proto", "")
    is_https = forwarded_proto == "https" or request.url.scheme == "https"
    response.set_cookie(
        key=SESSION_COOKIE,
        value=raw_token,
        max_age=store.SESSION_TTL_SECONDS,
        httponly=True,
        secure=is_https,
        samesite="lax",
        path="/",
    )

def public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "username": user["username"],
        "global_chips": user["global_chips"],
        "is_guest": user["is_guest"],
        "has_recovery_code": user["has_recovery_code"],
    }

class CreateTableRequest(BaseModel):
    small_blind: int = 5
    big_blind: int = 10
    buy_in: int = 2000
    username: str = ""

class LoginRequest(BaseModel):
    username: str

class RecoveryRequest(BaseModel):
    code: str

@app.get("/api/session")
async def get_session(request: Request):
    """页面加载时调一次：cookie 有效就直接登录，实现「关掉再打开还是我」。"""
    user = current_user(request)
    if user is None:
        return {"success": False}
    store.touch_login(user["user_id"])
    return {"success": True, **public_user(user)}

@app.post("/api/logout")
async def logout(request: Request, response: Response):
    store.delete_session(request.cookies.get(SESSION_COOKIE))
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"success": True}

@app.post("/api/login")
async def login(req: LoginRequest, request: Request, response: Response):
    now = time.time()
    purge_expired_accounts(now)

    username = req.username.strip()
    if not username:
        return {"success": False, "error": "请输入游戏 ID"}
    if len(username) > 12:
        return {"success": False, "error": "游戏 ID 最长 12 个字符"}

    # 本设备已经登录过同一个账号：直接续用，不重复建号
    existing = current_user(request)
    if existing is not None and existing["username"].lower() == username.lower():
        store.touch_login(existing["user_id"], now)
        return {"success": True, **public_user(existing)}

    if username in active_users:
        return {"success": False, "error": "该 ID 当前已在线，请换一个名称"}

    account = store.get_user_by_name(username)
    if account is None:
        account = store.create_guest(username, now)
    elif account["claimed"]:
        # 已被某台设备认领：没有凭据就不能再顶替，这正是原来能白拿别人筹码的口子
        return {
            "success": False,
            "error": "该 ID 已被其他设备使用。换一个 ID，或用原设备的账号恢复码登录。",
        }
    else:
        # 老数据迁移过来的未认领账号，第一个登录的设备接管它（保持老玩家的筹码）
        store.claim_user(account["user_id"], now)
        account = store.get_user_by_id(account["user_id"])

    store.touch_login(account["user_id"], now)
    if existing is not None:
        store.delete_session(request.cookies.get(SESSION_COOKIE))
    token = store.create_session(account["user_id"], now)
    set_session_cookie(response, request, token)
    return {"success": True, **public_user(account)}

@app.post("/api/recovery/issue")
async def issue_recovery(request: Request):
    """给当前账号生成恢复码。只在这里返回一次，库里只存哈希。"""
    user = current_user(request)
    if user is None:
        return {"success": False, "error": "请先登录"}
    code = store.issue_recovery_code(user["user_id"])
    return {"success": True, "code": code}

@app.post("/api/recovery/redeem")
async def redeem_recovery(req: RecoveryRequest, request: Request, response: Response):
    """在新设备上用恢复码登录回原账号。"""
    now = time.time()
    account = store.redeem_recovery_code(req.code)
    if account is None:
        return {"success": False, "error": "恢复码无效"}
    if account["username"] in active_users:
        return {"success": False, "error": "该账号当前已在线"}
    store.touch_login(account["user_id"], now)
    store.delete_session(request.cookies.get(SESSION_COOKIE))
    token = store.create_session(account["user_id"], now)
    set_session_cookie(response, request, token)
    return {"success": True, **public_user(account)}

@app.websocket("/ws/session/{username}")
async def session_websocket(websocket: WebSocket, username: str):
    # 路径里的用户名不再被信任，必须与 cookie 里的会话一致
    user = ws_user(websocket)
    if user is None or user["username"].lower() != username.lower():
        await websocket.close(code=1008, reason="未登录或身份不匹配")
        return
    username = user["username"]
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
async def get_chips(username: str, request: Request):
    # 只允许查自己的筹码；未登录时返回 null 而不是 0，
    # 避免前端把「查不到」误显示成「筹码为 0」而禁用建桌/入座
    user = current_user(request)
    if user is None or user["username"].lower() != username.lower():
        return {"success": False, "global_chips": None}
    return {"success": True, "global_chips": int(user["global_chips"])}

class JoinTableRequest(BaseModel):
    username: str = ""

@app.post("/api/tables/join/{table_id}")
async def join_table(table_id: str, req: JoinTableRequest, request: Request):
    # 花的是谁的筹码由会话决定，不看请求体，避免替别人扣费
    user = current_user(request)
    if user is None:
        return {"success": False, "error": "登录已过期，请重新登录"}
    username = user["username"]

    if table_id not in tables:
        return {"success": False, "error": "该牌桌不存在"}
    if any(p.id == username for p in tables[table_id].players):
        return {"success": True, "global_chips": get_global_chips(username)}
    if len(tables[table_id].players) >= MAX_TABLE_PLAYERS:
        return {"success": False, "error": "该牌桌已满（最多 8 人）"}
    chips = int(user["global_chips"])
    if chips < 1:
        return {"success": False, "error": "全局筹码不足！需要至少 1 枚全局筹码才能入座"}
    store.set_chips(user["user_id"], chips - 1)
    return {"success": True, "global_chips": get_global_chips(username)}

@app.get("/api/tables")
async def get_tables():
    result = []
    for tid, state in tables.items():
        result.append({
            "table_id": tid,
            "phase": state.phase,
            "player_count": sum(1 for p in state.players if p.is_online),
            "seat_count": len(state.players),
        })
    return result

@app.post("/api/tables")
async def create_table(req: CreateTableRequest, request: Request):
    # 同上：建桌扣的是会话对应账号的筹码
    user = current_user(request)
    if user is None:
        return {"success": False, "error": "登录已过期，请重新登录"}
    username = user["username"]
    chips = int(user["global_chips"])
    if chips < 1:
        return {"success": False, "error": "全局筹码不足！需要至少 1 枚全局筹码才能建桌"}
    store.set_chips(user["user_id"], chips - 1)

    tid = str(uuid.uuid4())[:8]
    tables[tid] = GameState(
        table_id=tid, 
        small_blind=req.small_blind, 
        big_blind=req.big_blind,
        buy_in=req.buy_in,
        min_raise=req.big_blind
    )
    decks[tid] = Deck()
    return {"success": True, "table_id": tid, "global_chips": get_global_chips(username)}

async def execute_leave_cleanup(table_id: str, client_id: str, cb):
    if table_id not in tables:
        return
    global_game_state = tables[table_id]
    global_deck = decks[table_id]
    
    leaving_player = next((p for p in global_game_state.players if p.id == client_id), None)
    if leaving_player:
        buy_in_unit = max(1, int(global_game_state.buy_in))
        earned = math.floor(leaving_player.chips / buy_in_unit)
        if earned:
            add_global_chips(client_id, earned)

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
    # 牌桌身份同样以会话为准，避免伪造 client_id 冒充他人行动
    user = ws_user(websocket)
    if user is None or user["username"].lower() != client_id.lower():
        await websocket.close(code=1008, reason="未登录或身份不匹配")
        return
    client_id = user["username"]

    if table_id not in tables:
        await websocket.close()
        return

    global_game_state = tables[table_id]
    global_deck = decks[table_id]

    if (
        not any(p.id == client_id for p in global_game_state.players)
        and len(global_game_state.players) >= MAX_TABLE_PLAYERS
    ):
        await websocket.close(code=1008, reason="Table is full")
        return
    
    await manager.connect(websocket, table_id)
    
    if client_id in disconnect_tasks:
        disconnect_tasks[client_id].cancel()
        del disconnect_tasks[client_id]
    
    if not any(p.id == client_id for p in global_game_state.players):
        new_player = Player(id=client_id, name=client_id, chips=global_game_state.buy_in)
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
