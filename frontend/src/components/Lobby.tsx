import React, { useEffect, useState } from 'react';
import { PlusCircle, LogIn, RefreshCcw, Users, Gem, LogOut } from 'lucide-react';
import { DisclaimerModal } from './Disclaimer';
import { TutorialModal } from './Tutorial';

const API_BASE = 'https://texaspoker.thiopheneche.dpdns.org';

type TableInfo = {
  table_id: string;
  phase: string;
  player_count: number;
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
  const [smallBlind, setSmallBlind] = useState<number>(25);
  const [bigBlind, setBigBlind] = useState<number>(50);
  const [chipError, setChipError] = useState<string>('');
  const reconnectTableId = localStorage.getItem('poker_table_id')?.trim() || '';

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

  const handleCreateTable = async () => {
    setChipError('');
    try {
      const res = await fetch(`${API_BASE}/api/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ small_blind: smallBlind, big_blind: bigBlind, username })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setGlobalChips(data.global_chips);
          onJoinTable(data.table_id);
        } else {
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

  return (
    <div className="poker-table-container pb-10" style={{ padding: '40px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <h1 style={{ color: 'var(--primary)', margin: 0 }}>💎 扑克大厅</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,215,0,0.05))', padding: '8px 18px', borderRadius: '20px', border: '1px solid rgba(255,215,0,0.3)' }}>
            <Gem size={18} style={{ color: 'gold' }} />
            <span style={{ color: 'gold', fontWeight: 'bold', fontSize: '1.1rem' }}>{globalChips}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>全局筹码</span>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>当前账号：{username}</div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <TutorialModal variant="site" trigger="banner" />
          <DisclaimerModal trigger="banner" />
          <button onClick={onLogout} className="btn-start" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>
            <LogOut size={18} /> 退出登录
          </button>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(0,0,0,0.3)', padding: '5px 10px', borderRadius: '8px' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>小盲/大盲:</span>
            <input type="number" min="1" value={smallBlind} onChange={e => setSmallBlind(Number(e.target.value))} style={{ width: '50px', background:'transparent', color:'white', border:'1px solid rgba(255,255,255,0.2)', padding:'5px', borderRadius:'4px' }} />
            <span style={{color: 'var(--text-muted)'}}>/</span>
            <input type="number" min="2" value={bigBlind} onChange={e => setBigBlind(Number(e.target.value))} style={{ width: '50px', background:'transparent', color:'white', border:'1px solid rgba(255,255,255,0.2)', padding:'5px', borderRadius:'4px' }} />
          </div>

          <button onClick={fetchTables} className="btn-start" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
            <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} /> 刷新
          </button>

          <button onClick={handleCreateTable} className="btn-bet" style={{ opacity: globalChips < 1 ? 0.4 : 1 }} disabled={globalChips < 1}>
            <PlusCircle size={18} /> 新建牌桌 (消耗1💎)
          </button>
        </div>
      </div>

      {chipError && (
        <div style={{ padding: '0 20px', marginBottom: '15px' }}>
          <div style={{ background: 'rgba(207,102,121,0.15)', border: '1px solid var(--danger)', padding: '12px 20px', borderRadius: '10px', color: 'var(--danger)', fontWeight: 'bold', textAlign: 'center' }}>
            ⚠️ {chipError}
          </div>
        </div>
      )}

      <div style={{ padding: '0 20px', marginBottom: '25px' }}>
         <div style={{ background: 'rgba(0,0,0,0.3)', padding: '15px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#03dac6', fontWeight: 'bold' }}>
               <Users size={18} />
               <span>全局在线 ({onlineUsers.length} 人):</span>
            </div>
            {onlineUsers.length > 0 ? (
                onlineUsers.map(user => (
                   <span key={user} style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 12px', borderRadius: '15px', fontSize: '0.9rem', border: '1px solid rgba(255,255,255,0.2)' }}>👤 {user}</span>
                ))
            ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>暂无在线玩家</span>
            )}
         </div>
      </div>

      <div style={{ padding: '0 20px', marginBottom: '25px' }}>
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '15px 20px', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.6' }}>
            💡 <strong style={{color: 'var(--text-main)'}}>全局筹码机制</strong>：每位新玩家初始获得 <strong style={{color:'gold'}}>5💎</strong> 全局筹码。
            每次进入或创建牌桌消耗 <strong style={{color:'var(--danger)'}}>1💎</strong>。
            离开牌桌时，您手中的游戏筹码每满 <strong>1000</strong> 可兑换 <strong style={{color:'gold'}}>1💎</strong> 全局筹码（向下取整）。
          </p>
          {reconnectTableId && (
            <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
              <button onClick={() => onJoinTable(reconnectTableId)} className="btn-start">
                继续刚才的牌桌 #{reconnectTableId}
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {tables.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px', fontSize: '1.2rem' }}>
            当前没有活动的牌桌，赶快建一个呼朋唤友吧！
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '25px' }}>
            {tables.map(t => (
              <div key={t.table_id} className="opponent-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '25px' }}>
                <h3 style={{ margin: '0 0 10px 0', color: 'white', fontSize: '1.2rem' }}>牌桌 #{t.table_id}</h3>
                <p style={{ margin: '5px 0', fontSize: '0.95rem', color: 'var(--text-muted)' }}>当前在线: {t.player_count} 人</p>
                <p style={{ margin: '5px 0 20px 0', fontSize: '0.95rem', color: 'var(--text-muted)' }}>游戏进度: {t.phase}</p>
                <button
                  onClick={() => handleJoinTable(t.table_id)}
                  className="btn-start"
                  style={{ width: '100%', justifyContent: 'center', opacity: globalChips < 1 ? 0.4 : 1 }}
                  disabled={globalChips < 1}
                >
                  <LogIn size={18} /> 加入这桌 (消耗1💎)
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
