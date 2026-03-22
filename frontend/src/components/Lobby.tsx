import React, { useEffect, useState } from 'react';
import { PlusCircle, LogIn, RefreshCcw, Users } from 'lucide-react';

type TableInfo = {
  table_id: string;
  phase: string;
  player_count: number;
};

type Props = {
  onJoinTable: (tableId: string) => void;
};

export const Lobby: React.FC<Props> = ({ onJoinTable }) => {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [smallBlind, setSmallBlind] = useState<number>(25);
  const [bigBlind, setBigBlind] = useState<number>(50);

  const fetchTables = async () => {
    setLoading(true);
    try {
      const [tablesRes, usersRes] = await Promise.all([
        fetch('https://texaspoker.thiopheneche.dpdns.org/api/tables'),
        fetch('https://texaspoker.thiopheneche.dpdns.org/api/users')
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
      console.error("Failed to fetch data", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTables();
    
    // Auto-refresh the lobby every 5 seconds to keep online users updated
    const interval = setInterval(fetchTables, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateTable = async () => {
    try {
      const res = await fetch('https://texaspoker.thiopheneche.dpdns.org/api/tables', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ small_blind: smallBlind, big_blind: bigBlind })
      });
      if (res.ok) {
        const data = await res.json();
        onJoinTable(data.table_id);
      }
    } catch (e) {
      console.error("Failed to create table", e);
    }
  };

  return (
    <div className="poker-table-container pb-10" style={{ padding: '40px', display: 'flex', flexDirection: 'column' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', marginBottom: '20px' }}>
        <h1 style={{ color: 'var(--primary)', margin: 0 }}>💎 扑克大厅</h1>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(0,0,0,0.3)', padding: '5px 10px', borderRadius: '8px' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>小盲/大盲:</span>
            <input type="number" min="1" value={smallBlind} onChange={e => setSmallBlind(Number(e.target.value))} style={{ width: '50px', background:'transparent', color:'white', border:'1px solid rgba(255,255,255,0.2)', padding:'5px', borderRadius:'4px' }} />
            <span style={{color: 'var(--text-muted)'}}>/</span>
            <input type="number" min="2" value={bigBlind} onChange={e => setBigBlind(Number(e.target.value))} style={{ width: '50px', background:'transparent', color:'white', border:'1px solid rgba(255,255,255,0.2)', padding:'5px', borderRadius:'4px' }} />
          </div>

          <button onClick={fetchTables} className="btn-start" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
            <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} /> 刷新
          </button>
          
          <button onClick={handleCreateTable} className="btn-bet">
            <PlusCircle size={18} /> 新建牌桌
          </button>
        </div>
      </div>

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

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {tables.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '60px', fontSize: '1.2rem' }}>
            当前没有活动的牌桌，赶快建一个呼朋唤友吧！
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '25px' }}>
            {tables.map(t => (
              <div key={t.table_id} className="opponent-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '25px' }}>
                <h3 style={{ margin: '0 0 10px 0', color: 'white', fontSize: '1.2rem' }}>牌桌 #{t.table_id}</h3>
                <p style={{ margin: '5px 0', fontSize: '0.95rem', color: 'var(--text-muted)' }}>当前玩家: {t.player_count} 人</p>
                <p style={{ margin: '5px 0 20px 0', fontSize: '0.95rem', color: 'var(--text-muted)' }}>游戏进度: {t.phase}</p>
                <button 
                  onClick={() => onJoinTable(t.table_id)} 
                  className="btn-start" 
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <LogIn size={18} /> 加入这桌
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
