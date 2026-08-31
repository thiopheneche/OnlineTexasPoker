import React, { useState, useEffect, useCallback } from 'react';
import { Spade, ArrowRight, AlertCircle } from 'lucide-react';
import { PokerTable } from './components/PokerTable';
import { Lobby } from './components/Lobby';
import { DisclaimerModal } from './components/Disclaimer';
import { TutorialModal } from './components/Tutorial';
import { API_BASE, sessionWsUrl } from './config';

const STORAGE_TABLE_KEY = 'poker_table_id';

function App() {
  const [currentTableId, setCurrentTableId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>('');
  const [loginInput, setLoginInput] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [globalChips, setGlobalChips] = useState<number>(0);
  const [booting, setBooting] = useState<boolean>(true);
  const [recoverMode, setRecoverMode] = useState<boolean>(false);
  const [recoverInput, setRecoverInput] = useState<string>('');

  const completeLogin = useCallback((nextUsername: string, chips: number) => {
    setUsername(nextUsername);
    setLoginInput(nextUsername);
    setGlobalChips(chips);
    setCurrentTableId(null);
    localStorage.removeItem(STORAGE_TABLE_KEY);
  }, []);

  // 登录态由服务端 httpOnly cookie 保持，页面加载时问一次即可自动登录
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/session`, { credentials: 'include' });
        const data = await res.json();
        if (!cancelled && data.success) {
          setUsername(data.username);
          setLoginInput(data.username);
          setGlobalChips(data.global_chips ?? 0);
        }
      } catch {
        // 拿不到会话就停在登录页，不需要额外处理
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/logout`, { method: 'POST', credentials: 'include' });
    } catch {
      // 即使请求失败也把本地状态清掉
    }
    setUsername('');
    setLoginInput('');
    setLoginError('');
    setGlobalChips(0);
    setCurrentTableId(null);
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
      const res = await fetch(`${API_BASE}/api/chips/${username}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        // 会话失效时后端返回 null，此时保持原值，不要把界面刷成 0
        if (typeof data.global_chips === 'number') {
          setGlobalChips(data.global_chips);
        }
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
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: nextUsername })
      });
      const data = await res.json();
      if (data.success) {
        completeLogin(data.username ?? nextUsername, data.global_chips ?? 5);
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

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = recoverInput.trim();
    if (!code) return;
    try {
      const res = await fetch(`${API_BASE}/api/recovery/redeem`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (data.success) {
        setRecoverMode(false);
        setRecoverInput('');
        completeLogin(data.username, data.global_chips ?? 0);
      } else {
        setLoginError(data.error || '恢复码无效');
      }
    } catch {
      setLoginError('连接服务器失败，请稍后再试');
    }
  };

  // 会话检查完成前先不渲染登录页，避免已登录用户看到一闪而过的登录界面
  if (booting) {
    return (
      <div className="app-main">
        <div className="loading-screen">正在恢复登录状态…</div>
      </div>
    );
  }

  if (!username) {
    return (
      <div className="app-main">
        <div className="a-login">
          <div className="a-login-inner">
            <div className="a-logo"><Spade size={30} /></div>
            <h1>德州扑克</h1>
            <p className="sub">和朋友来一局</p>

            {recoverMode ? (
              <form onSubmit={handleRecover}>
                <input
                  type="text"
                  placeholder="粘贴账号恢复码"
                  value={recoverInput}
                  onChange={(e) => { setRecoverInput(e.target.value); setLoginError(''); }}
                  autoFocus
                />
                {loginError && (
                  <div className="a-login-error">
                    <AlertCircle size={15} style={{ flexShrink: 0 }} />
                    <span>{loginError}</span>
                  </div>
                )}
                <button type="submit" className="a-primary" disabled={!recoverInput.trim()}>
                  用恢复码登录 <ArrowRight size={17} />
                </button>
              </form>
            ) : (
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
            )}

            <button
              type="button"
              className="a-login-switch"
              onClick={() => { setRecoverMode(m => !m); setLoginError(''); }}
            >
              {recoverMode ? '返回用 ID 登录' : '换了设备？用恢复码登录'}
            </button>

            <div className="a-login-links">
              <TutorialModal variant="site" trigger="link" />
              <DisclaimerModal trigger="link" />
            </div>
            <p className="a-login-note">登录状态会在本浏览器保留 30 天，下次打开自动进入。</p>
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
