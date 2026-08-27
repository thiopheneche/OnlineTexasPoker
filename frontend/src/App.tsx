import React, { useState, useEffect, useCallback } from 'react';
import { Spade, ArrowRight, AlertCircle } from 'lucide-react';
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
      <div className="app-main">
        <div className="a-login">
          <div className="a-login-inner">
            <div className="a-logo"><Spade size={30} /></div>
            <h1>德州扑克</h1>
            <p className="sub">和朋友来一局</p>

            <form onSubmit={handleLogin}>
              <input
                type="text"
                placeholder="输入你的游戏 ID"
                value={loginInput}
                onChange={(e) => { setLoginInput(e.target.value); setLoginError(''); }}
                maxLength={12}
                autoFocus
              />
              {loginError && (
                <div className="a-login-error">
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span>{loginError}</span>
                </div>
              )}
              <button type="submit" className="a-primary" disabled={!loginInput.trim()}>
                进入大厅 <ArrowRight size={17} />
              </button>
            </form>

            <div className="a-login-links">
              <TutorialModal variant="site" trigger="link" />
              <DisclaimerModal trigger="link" />
            </div>
            <p className="a-login-note">刷新页面不会自动登录，重新输入相同 ID 即可续回原牌桌。</p>
          </div>
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
