import React, { useState, useEffect, useCallback } from 'react';
import { PokerTable } from './components/PokerTable';
import { Lobby } from './components/Lobby';
import { DisclaimerModal } from './components/Disclaimer';

function App() {
  const [currentTableId, setCurrentTableId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>('');
  const [loginInput, setLoginInput] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [globalChips, setGlobalChips] = useState<number>(0);

  useEffect(() => {
    if (username) {
      // 建立常驻 Session 心跳
      const sessionWs = new WebSocket(`wss://texaspoker.thiopheneche.dpdns.org/ws/session/${username}`);
      sessionWs.onclose = () => {
         // 自动处理异常断线（静默不打扰用户当前游戏）
      };
      return () => sessionWs.close();
    }
  }, [username]);

  const refreshChips = useCallback(async () => {
    if (!username) return;
    try {
      const res = await fetch(`https://texaspoker.thiopheneche.dpdns.org/api/chips/${username}`);
      if (res.ok) {
        const data = await res.json();
        setGlobalChips(data.global_chips);
      }
    } catch (e) {
      console.error("Failed to fetch chips", e);
    }
  }, [username]);

  // Refresh chips when returning to lobby
  useEffect(() => {
    if (username && !currentTableId) {
      refreshChips();
    }
  }, [username, currentTableId, refreshChips]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginInput.trim()) return;
    try {
      const res = await fetch('https://texaspoker.thiopheneche.dpdns.org/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginInput.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setUsername(loginInput.trim());
        setGlobalChips(data.global_chips ?? 5);
      } else {
        setLoginError(data.error || "ID 已被在线玩家占用，请换个名称！");
      }
    } catch (err) {
      setLoginError("连接服务器失败，请确认后端已启动并且跨域允许");
    }
  };

  if (!username) {
    return (
      <div className="app-main flex-center" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#1a1a1a', padding: '50px', borderRadius: '20px', border: '2px solid var(--accent)', textAlign: 'center', width: '450px', boxShadow: '0px 10px 40px rgba(0,0,0,0.5)' }}>
          <h1 style={{ color: 'var(--accent)', marginBottom: '10px', fontSize: '2.5rem' }}>♠️ 德州扑克 ♣️</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '30px' }}>请输入您的唯一游戏 ID 以进入大厅</p>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
             <input 
               type="text" 
               placeholder="输入昵称 (如: Player1)" 
               value={loginInput}
               onChange={(e) => { setLoginInput(e.target.value); setLoginError(''); }}
               style={{ padding: '15px', borderRadius: '10px', border: '1px solid #333', background: '#2a2a2a', color: 'white', fontSize: '1.2rem', textAlign: 'center', outline: 'none' }}
               maxLength={12}
             />
             {loginError && <div style={{ color: 'var(--danger)', fontSize: '0.95rem' }}>⚠️ {loginError}</div>}
             <button type="submit" style={{ padding: '15px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '10px', fontSize: '1.2rem', cursor: 'pointer', fontWeight: 'bold', transition: 'background 0.2s' }}>
               进入大厅 (Enter)
             </button>
          </form>
          <div style={{ marginTop: '20px' }}>
            <DisclaimerModal trigger="link" />
          </div>
          <p style={{ fontSize: '0.8rem', color: 'gray', marginTop: '15px', lineHeight: '1.5' }}>
            注：您的 ID 采取"用完即焚"机制。全站仅在您保持浏览期间独占此名称，关闭或刷新网页将自动断线将其释放！
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-main">
      {currentTableId ? (
        <PokerTable 
          tableId={currentTableId} 
          clientId={username}
          onLeave={() => setCurrentTableId(null)} 
        />
      ) : (
        <Lobby 
          onJoinTable={(id) => setCurrentTableId(id)} 
          username={username}
          globalChips={globalChips}
          setGlobalChips={setGlobalChips}
        />
      )}
    </div>
  );
}

export default App;
