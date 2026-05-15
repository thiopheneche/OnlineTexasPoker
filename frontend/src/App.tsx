import React, { useState, useEffect, useCallback } from 'react';
import { PokerTable } from './components/PokerTable';
import { Lobby } from './components/Lobby';
import { DisclaimerModal } from './components/Disclaimer';
import { TutorialModal } from './components/Tutorial';
import { API_BASE, sessionWsUrl } from './config';

const STORAGE_USERNAME_KEY = 'poker_username';
const STORAGE_TABLE_KEY = 'poker_table_id';

function App() {
  const [currentTableId, setCurrentTableId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>('');
  const [loginInput, setLoginInput] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [globalChips, setGlobalChips] = useState<number>(0);

  const completeLogin = useCallback((nextUsername: string, chips: number) => {
    setUsername(nextUsername);
    setLoginInput(nextUsername);
    setGlobalChips(chips);
    localStorage.setItem(STORAGE_USERNAME_KEY, nextUsername);
    setCurrentTableId(null);
    localStorage.removeItem(STORAGE_TABLE_KEY);
  }, []);

  const logout = useCallback(() => {
    setUsername('');
    setLoginInput('');
    setLoginError('');
    setGlobalChips(0);
    setCurrentTableId(null);
    localStorage.removeItem(STORAGE_USERNAME_KEY);
    localStorage.removeItem(STORAGE_TABLE_KEY);
  }, []);


  useEffect(() => {
    if (!username) return;
    const sessionWs = new WebSocket(sessionWsUrl(username));
    const heartbeat = setInterval(() => {
      if (sessionWs.readyState === WebSocket.OPEN) {
        sessionWs.send('ping');
      }
    }, 15000);

    return () => {
      clearInterval(heartbeat);
      sessionWs.close();
    };
  }, [username]);

  const refreshChips = useCallback(async () => {
    if (!username) return;
    try {
      const res = await fetch(`${API_BASE}/api/chips/${username}`);
      if (res.ok) {
        const data = await res.json();
        setGlobalChips(data.global_chips);
      }
    } catch (e) {
      console.error('Failed to fetch chips', e);
    }
  }, [username]);

  useEffect(() => {
    if (username && !currentTableId) {
      const timeout = setTimeout(() => {
        void refreshChips();
      }, 0);
      return () => clearTimeout(timeout);
    }
  }, [username, currentTableId, refreshChips]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextUsername = loginInput.trim();
    if (!nextUsername) return;
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: nextUsername })
      });
      const data = await res.json();
      if (data.success) {
        completeLogin(nextUsername, data.global_chips ?? 5);
      } else {
        setLoginError(data.error || 'ID 已被在线玩家占用，请换个名称！');
      }
    } catch {
      setLoginError('连接服务器失败，请确认后端已启动并且跨域允许');
    }
  };

  const handleJoinTable = useCallback((tableId: string) => {
    setCurrentTableId(tableId);
    localStorage.setItem(STORAGE_TABLE_KEY, tableId);
  }, []);

  const handleLeaveTable = useCallback(() => {
    setCurrentTableId(null);
    localStorage.removeItem(STORAGE_TABLE_KEY);
  }, []);

  if (!username) {
    return (
      <div className="app-main flex-center" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="login-card" style={{ background: '#1a1a1a', padding: '50px', borderRadius: '20px', border: '2px solid var(--accent)', textAlign: 'center', width: '450px', boxShadow: '0px 10px 40px rgba(0,0,0,0.5)' }}>
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
          <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <TutorialModal variant="site" trigger="link" />
            <DisclaimerModal trigger="link" />
          </div>
          <p style={{ fontSize: '0.8rem', color: 'gray', marginTop: '15px', lineHeight: '1.5' }}>
              注：登录 ID 与全局筹码会保存在当前浏览器中，刷新页面后不会自动登录。

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
          onLeave={handleLeaveTable}
        />
      ) : (
        <Lobby
          onJoinTable={handleJoinTable}
          onLogout={logout}
          username={username}
          globalChips={globalChips}
          setGlobalChips={setGlobalChips}
        />
      )}
    </div>
  );
}

export default App;
