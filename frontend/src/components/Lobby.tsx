import React, { useEffect, useState } from 'react';
import { Plus, LogIn, RefreshCcw, Users, Gem, LogOut, Spade, MoreHorizontal, AlertCircle } from 'lucide-react';
import { DisclaimerModal } from './Disclaimer';
import { TutorialModal } from './Tutorial';
import { API_BASE } from '../config';

const STORAGE_TABLE_KEY = 'poker_table_id';

const AVATAR_PALETTE = ['#7c5cbf', '#2f8f7a', '#8f6b2f', '#5c7cbf', '#bf5c7c', '#4f9e68', '#9e7a4f'];

const avatarColor = (name: string) => {
  let idx = 0;
  for (let i = 0; i < name.length; i++) idx = (idx + name.charCodeAt(i)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx];
};

const Avatar: React.FC<{ name: string; size?: number }> = ({ name, size = 40 }) => (
  <span
    className="a-avatar"
    style={{
      width: size,
      height: size,
      background: avatarColor(name),
      fontSize: Math.round(size * 0.42)
    }}
  >
    {name.charAt(0)}
  </span>
);

const PHASE_LABEL: Record<string, string> = {
  WAITING: '等待开局',
  SHOWDOWN: '结算中'
};

type TableInfo = {
  table_id: string;
  phase: string;
  player_count: number;
  seat_count: number;
};

type Props = {
  onJoinTable: (tableId: string) => void;
  onLogout: () => void;
  username: string;
  globalChips: number;
  setGlobalChips: (chips: number) => void;
};

export const Lobby: React.FC<Props> = ({ onJoinTable, onLogout, username, globalChips, setGlobalChips }) => {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [smallBlind, setSmallBlind] = useState<number>(5);
  const [bigBlind, setBigBlind] = useState<number>(10);
  const [buyIn, setBuyIn] = useState<number>(2000);
  const [chipError, setChipError] = useState<string>('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const reconnectTableId = localStorage.getItem(STORAGE_TABLE_KEY)?.trim() || '';
  const reconnectTableExists = reconnectTableId ? tables.some(table => table.table_id === reconnectTableId) : false;

  const fetchTables = async () => {
    setLoading(true);
    try {
      const [tablesRes, usersRes] = await Promise.all([
        fetch(`${API_BASE}/api/tables`),
        fetch(`${API_BASE}/api/users`)
      ]);

      if (tablesRes.ok) {
        const data = await tablesRes.json();
        setTables(data);
      }
      if (usersRes.ok) {
        const userData = await usersRes.json();
        setOnlineUsers(userData.users);
      }
    } catch (e) {
      console.error('Failed to fetch data', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchTables();
    }, 0);
    const interval = setInterval(fetchTables, 5000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!reconnectTableId) {
      return;
    }
    if (loading) {
      return;
    }
    if (tables.length > 0 && reconnectTableExists) {
      return;
    }
    localStorage.removeItem(STORAGE_TABLE_KEY);
  }, [loading, reconnectTableExists, reconnectTableId, tables.length]);

  const handleCreateTable = async () => {
    setChipError('');
    try {
      const res = await fetch(`${API_BASE}/api/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ small_blind: smallBlind, big_blind: bigBlind, buy_in: buyIn, username })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setGlobalChips(data.global_chips);
          setCreateOpen(false);
          onJoinTable(data.table_id);
        } else {
          setCreateOpen(false);
          setChipError(data.error || '筹码不足');
        }
      }
    } catch (e) {
      console.error('Failed to create table', e);
    }
  };

  const handleJoinTable = async (tableId: string) => {
    setChipError('');
    try {
      const res = await fetch(`${API_BASE}/api/tables/join/${tableId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setGlobalChips(data.global_chips);
          onJoinTable(tableId);
        } else {
          setChipError(data.error || '操作失败');
        }
      }
    } catch (e) {
      console.error('Failed to join table', e);
    }
  };

  const canAct = globalChips >= 1;

  return (
    <>
      <div className="a-lobby-page">
        <div className="a-lobby">
          <div className="a-lobby-top">
            <div className="a-who">
              <Avatar name={username} size={44} />
              <div style={{ minWidth: 0 }}>
                <div className="name">{username}</div>
                <div className="chips">
                  <Gem size={13} style={{ color: 'var(--gold-soft)' }} />
                  <span className="chip-num">{globalChips}</span> 全局筹码
                </div>
              </div>
            </div>
            <button className="a-icon-btn" onClick={() => setMenuOpen(true)} aria-label="更多">
              <MoreHorizontal size={20} />
            </button>
          </div>

          {chipError && (
            <div className="a-error">
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{chipError}</span>
            </div>
          )}

          {reconnectTableId && reconnectTableExists && (
            <div className="a-resume">
              <span>你刚才在牌桌 #{reconnectTableId}</span>
              <button onClick={() => handleJoinTable(reconnectTableId)}>继续这桌</button>
            </div>
          )}

          <div className="a-section-label">
            <h2>牌桌</h2>
            <span className="count">{tables.length > 0 ? `${tables.length} 桌进行中` : ''}</span>
          </div>

          {tables.length === 0 ? (
            <div className="a-empty">
              <div className="ic"><Spade size={36} /></div>
              <p>现在还没有牌桌</p>
              <p className="hint">点右下角「创建牌桌」，把房间号发给朋友就能开局</p>
            </div>
          ) : (
            tables.map(t => {
              const full = t.seat_count >= 8;
              const idle = t.phase === 'WAITING';
              return (
                <div key={t.table_id} className="a-table-row">
                  <div className="felt-dot"><Spade size={17} /></div>
                  <div className="a-table-main">
                    <div className="a-table-title">
                      牌桌 {t.table_id}
                      <span className={`status${idle ? ' idle' : ''}`}>{PHASE_LABEL[t.phase] || t.phase}</span>
                    </div>
                    <div className="a-table-meta">
                      <span>在座 <b>{t.seat_count}/8</b></span>
                      <span>在线 <b>{t.player_count}</b> 人</span>
                    </div>
                  </div>
                  <button
                    className="a-join"
                    onClick={() => handleJoinTable(t.table_id)}
                    disabled={!canAct || full}
                  >
                    {full ? '已满' : <><LogIn size={15} /> 加入</>}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <button
        className="a-create-fab"
        onClick={() => { setChipError(''); setCreateOpen(true); }}
        disabled={!canAct}
      >
        <Plus size={18} /> 创建牌桌
      </button>

      {/* 建桌抽屉：默认关闭 */}
      {createOpen && (
        <div className="a-sheet-mask" onClick={(e) => { if (e.target === e.currentTarget) setCreateOpen(false); }}>
          <div className="a-sheet">
            <h3>创建牌桌</h3>
            <p className="sub">消耗 <b style={{ color: 'var(--gold-soft)' }}>1</b> 全局筹码 · 离桌时每满一个买入额返还 1 枚</p>

            <div className="a-field">
              <label>盲注（小盲 / 大盲）</label>
              <div className="a-field-row">
                <input type="number" min={1} value={smallBlind} onChange={e => setSmallBlind(Number(e.target.value))} />
                <input type="number" min={2} value={bigBlind} onChange={e => setBigBlind(Number(e.target.value))} />
              </div>
            </div>

            <div className="a-field">
              <label>买入</label>
              <input type="number" min={100} step={100} value={buyIn} onChange={e => setBuyIn(Number(e.target.value))} />
            </div>

            <button className="a-primary" onClick={handleCreateTable}>创建并进入</button>
            <button className="ghost" onClick={() => setCreateOpen(false)}>取消</button>
          </div>
        </div>
      )}

      {/* 收纳菜单：教程 / 免责 / 在线人数 / 刷新 / 退出登录 */}
      {menuOpen && (
        <div className="a-menu-mask" onClick={(e) => { if (e.target === e.currentTarget) setMenuOpen(false); }}>
          <div className="a-menu">
            <div className="a-menu-item">
              <Users size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span style={{ color: 'var(--text-main)' }}>当前在线 {onlineUsers.length} 人</span>
            </div>
            <button onClick={() => { void fetchTables(); setMenuOpen(false); }}>
              <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} /> 刷新牌桌
            </button>
            <div className="a-menu-item"><TutorialModal variant="site" trigger="link" /></div>
            <div className="a-menu-item"><DisclaimerModal trigger="link" /></div>
            <button className="danger" onClick={() => { setMenuOpen(false); onLogout(); }}>
              <LogOut size={16} /> 退出登录
            </button>
            <div className="menu-note">
              新玩家初始 5 枚全局筹码，进桌 / 建桌各消耗 1 枚；离桌时手中筹码每满一个买入额返还 1 枚。
            </div>
          </div>
        </div>
      )}
    </>
  );
};
