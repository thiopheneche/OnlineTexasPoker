"""账号与会话存储（SQLite）。

设计要点：
- 主键是 user_id（uuid），username 只是唯一的显示名。筹码挂在 user_id 上，
  这样改名、换设备都不会影响资产，也避免了「知道名字就能拿走筹码」。
- 会话令牌只存 sha256 哈希，数据库泄漏不会直接交出可用的登录态。
- 恢复码同理只存哈希。暂时没有邮件通道，恢复码是换设备/清 cookie 后找回账号的唯一手段。
- 老的 data/users.json 会在首次启动时自动迁移进来，并保留原文件作为备份。
  迁移进来的账号处于「未认领」状态：第一个用该用户名登录的设备接管它，
  行为与迁移前一致，不会把老玩家挡在门外。
"""

import hashlib
import json
import os
import secrets
import sqlite3
import time
import uuid
from typing import Any, Dict, Optional

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
DB_FILE = os.path.join(DATA_DIR, "poker.db")
LEGACY_USERS_FILE = os.path.join(DATA_DIR, "users.json")

# 访客账号 30 天不登录才回收（原来是 24 小时，太短，筹码会莫名蒸发）
GUEST_TTL_SECONDS = 30 * 24 * 60 * 60
SESSION_TTL_SECONDS = 30 * 24 * 60 * 60
INITIAL_CHIPS = 5

_conn: Optional[sqlite3.Connection] = None


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def connect() -> sqlite3.Connection:
    global _conn
    if _conn is not None:
        return _conn
    os.makedirs(DATA_DIR, exist_ok=True)
    _conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    _conn.row_factory = sqlite3.Row
    _conn.execute("PRAGMA journal_mode=WAL")
    _conn.execute("PRAGMA foreign_keys=ON")
    _init_schema(_conn)
    _migrate_legacy_users(_conn)
    return _conn


def _init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            user_id       TEXT PRIMARY KEY,
            username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
            global_chips  INTEGER NOT NULL DEFAULT 5,
            is_guest      INTEGER NOT NULL DEFAULT 1,
            email         TEXT UNIQUE,
            recovery_hash TEXT,
            claimed_at    REAL,
            created_at    REAL NOT NULL,
            last_login_at REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token_hash   TEXT PRIMARY KEY,
            user_id      TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            created_at   REAL NOT NULL,
            last_seen_at REAL NOT NULL,
            expires_at   REAL NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        """
    )
    conn.commit()


def _migrate_legacy_users(conn: sqlite3.Connection) -> None:
    """把 data/users.json 一次性迁移进 SQLite，原文件改名保留为备份。"""
    if not os.path.exists(LEGACY_USERS_FILE):
        return
    try:
        with open(LEGACY_USERS_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except Exception:
        return
    if not isinstance(raw, dict):
        return

    now = time.time()
    migrated = 0
    for username, data in raw.items():
        if not isinstance(username, str) or not username.strip():
            continue
        if isinstance(data, dict):
            chips = int(data.get("global_chips", INITIAL_CHIPS))
            last_login = float(data.get("last_login_at", now))
        else:
            try:
                chips = int(data)
            except (TypeError, ValueError):
                continue
            last_login = now
        try:
            conn.execute(
                """INSERT INTO users
                   (user_id, username, global_chips, is_guest, claimed_at, created_at, last_login_at)
                   VALUES (?, ?, ?, 1, NULL, ?, ?)""",
                (str(uuid.uuid4()), username, chips, last_login, last_login),
            )
            migrated += 1
        except sqlite3.IntegrityError:
            # 已经迁移过，跳过
            continue
    conn.commit()

    backup = LEGACY_USERS_FILE + ".migrated-" + time.strftime("%Y%m%d-%H%M%S")
    try:
        os.rename(LEGACY_USERS_FILE, backup)
    except OSError:
        pass
    if migrated:
        print(f"[store] 已从 users.json 迁移 {migrated} 个账号，原文件备份为 {os.path.basename(backup)}")


# --------------------------------------------------------------------------
# 账号
# --------------------------------------------------------------------------

def _row_to_user(row: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    return {
        "user_id": row["user_id"],
        "username": row["username"],
        "global_chips": int(row["global_chips"]),
        "is_guest": bool(row["is_guest"]),
        "email": row["email"],
        "has_recovery_code": row["recovery_hash"] is not None,
        "claimed": row["claimed_at"] is not None,
        "created_at": row["created_at"],
        "last_login_at": row["last_login_at"],
    }


def get_user_by_name(username: str) -> Optional[Dict[str, Any]]:
    conn = connect()
    row = conn.execute("SELECT * FROM users WHERE username = ? COLLATE NOCASE", (username,)).fetchone()
    return _row_to_user(row)


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    conn = connect()
    row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
    return _row_to_user(row)


def create_guest(username: str, now: Optional[float] = None) -> Dict[str, Any]:
    conn = connect()
    ts = now if now is not None else time.time()
    user_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO users
           (user_id, username, global_chips, is_guest, claimed_at, created_at, last_login_at)
           VALUES (?, ?, ?, 1, ?, ?, ?)""",
        (user_id, username, INITIAL_CHIPS, ts, ts, ts),
    )
    conn.commit()
    return get_user_by_id(user_id)  # type: ignore[return-value]


def claim_user(user_id: str, now: Optional[float] = None) -> None:
    """把一个迁移过来的未认领账号标记为已认领。"""
    conn = connect()
    ts = now if now is not None else time.time()
    conn.execute("UPDATE users SET claimed_at = ? WHERE user_id = ? AND claimed_at IS NULL", (ts, user_id))
    conn.commit()


def touch_login(user_id: str, now: Optional[float] = None) -> None:
    conn = connect()
    ts = now if now is not None else time.time()
    conn.execute("UPDATE users SET last_login_at = ? WHERE user_id = ?", (ts, user_id))
    conn.commit()


def get_chips(user_id: str) -> int:
    conn = connect()
    row = conn.execute("SELECT global_chips FROM users WHERE user_id = ?", (user_id,)).fetchone()
    return int(row["global_chips"]) if row else 0


def set_chips(user_id: str, chips: int) -> None:
    conn = connect()
    conn.execute("UPDATE users SET global_chips = ? WHERE user_id = ?", (max(0, int(chips)), user_id))
    conn.commit()


# --------------------------------------------------------------------------
# 会话
# --------------------------------------------------------------------------

def create_session(user_id: str, now: Optional[float] = None) -> str:
    conn = connect()
    ts = now if now is not None else time.time()
    raw = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)",
        (_hash(raw), user_id, ts, ts, ts + SESSION_TTL_SECONDS),
    )
    conn.commit()
    return raw


def resolve_session(raw_token: Optional[str], now: Optional[float] = None) -> Optional[Dict[str, Any]]:
    """用 cookie 里的原始令牌换回用户；顺带滑动续期。"""
    if not raw_token:
        return None
    conn = connect()
    ts = now if now is not None else time.time()
    row = conn.execute("SELECT * FROM sessions WHERE token_hash = ?", (_hash(raw_token),)).fetchone()
    if row is None:
        return None
    if float(row["expires_at"]) < ts:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (row["token_hash"],))
        conn.commit()
        return None
    conn.execute(
        "UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?",
        (ts, ts + SESSION_TTL_SECONDS, row["token_hash"]),
    )
    conn.commit()
    return get_user_by_id(row["user_id"])


def delete_session(raw_token: Optional[str]) -> None:
    if not raw_token:
        return
    conn = connect()
    conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_hash(raw_token),))
    conn.commit()


# --------------------------------------------------------------------------
# 恢复码（暂无邮件通道时的换设备手段）
# --------------------------------------------------------------------------

def issue_recovery_code(user_id: str) -> str:
    """生成新的恢复码并使旧码失效。只返回一次，库里只留哈希。"""
    conn = connect()
    raw = "-".join(secrets.token_hex(2).upper() for _ in range(4))  # 形如 A1B2-C3D4-E5F6-7890
    conn.execute("UPDATE users SET recovery_hash = ? WHERE user_id = ?", (_hash(raw), user_id))
    conn.commit()
    return raw


def redeem_recovery_code(code: str) -> Optional[Dict[str, Any]]:
    conn = connect()
    normalized = code.strip().upper()
    row = conn.execute("SELECT * FROM users WHERE recovery_hash = ?", (_hash(normalized),)).fetchone()
    return _row_to_user(row)


# --------------------------------------------------------------------------
# 回收
# --------------------------------------------------------------------------

def purge_expired(active_usernames: Optional[set] = None, now: Optional[float] = None) -> None:
    conn = connect()
    ts = now if now is not None else time.time()
    conn.execute("DELETE FROM sessions WHERE expires_at < ?", (ts,))
    rows = conn.execute(
        "SELECT user_id, username FROM users WHERE is_guest = 1 AND last_login_at < ?",
        (ts - GUEST_TTL_SECONDS,),
    ).fetchall()
    for row in rows:
        if active_usernames and row["username"] in active_usernames:
            continue
        conn.execute("DELETE FROM users WHERE user_id = ?", (row["user_id"],))
    conn.commit()
