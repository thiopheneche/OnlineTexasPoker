import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Coins, Play, UserCircle, LogOut, Check, ArrowUpCircle, XCircle, MessageSquare, Send } from 'lucide-react';
import { TutorialModal } from './Tutorial';

export type Player = {
  id: string;
  name: string;
  chips: number;
  current_bet: number;
  total_investment: number;
  is_active: boolean;
  is_online: boolean;
  is_ready: boolean;
  has_acted: boolean;
  revives_used: number;
  hole_cards: string[];
};

export type ShowdownResult = {
  name: string;
  won: number;
  reason: string;
  run?: number;
};

export type GameState = {
  table_id: string;
  phase: string;
  pot: number;
  current_highest_bet: number;
  min_raise: number;
  showdown_results: ShowdownResult[];
  community_cards: string[];
  players: Player[];
  button_index: number;
  current_turn_index: number;
  first_allin_player_id: string;
  awaiting_run_twice: boolean;
  run_it_twice: number;
  run_twice_boards: string[][];
};

type ChatMessage = {
  sender: string;
  message: string;
  timestamp: number;
};

type Props = {
  tableId: string;
  clientId: string;
  onLeave: () => void;
};

export const PokerTable: React.FC<Props> = ({ tableId, clientId, onLeave }) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [raiseAmount, setRaiseAmount] = useState<number>(0);
  const [bankruptTimer, setBankruptTimer] = useState<number | null>(null);
  const [isSpectating, setIsSpectating] = useState<boolean>(false);
  const [victoryDismissed, setVictoryDismissed] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [chatOpen, setChatOpen] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [cardsRevealed, setCardsRevealed] = useState<boolean>(false);
  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const leavingRef = useRef(false);

  useEffect(() => {
    localStorage.setItem('poker_table_id', tableId);
    leavingRef.current = false;
    ws.current = new WebSocket(`wss://texaspoker.thiopheneche.dpdns.org/ws/${tableId}/${clientId}`);
    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat') {
          const msg: ChatMessage = { sender: data.sender, message: data.message, timestamp: Date.now() };
          setChatMessages(prev => [...prev.slice(-99), msg]);
          if (!chatOpen) {
            setUnreadCount(prev => prev + 1);
          }
        } else {
          setGameState(data as GameState);
        }
      } catch (e) { console.error("Failed to parse", e); }
    };
    return () => {
      if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
      const socket = ws.current;
      ws.current = null;
      if (!leavingRef.current) {
        socket?.close();
        return;
      }
      socket?.close();
    };
  }, [tableId, clientId, chatOpen]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleAction = (action: string, amount: number = 0) => {
      ws.current?.send(JSON.stringify({ action, amount }));
  };

  const handleChatToggle = () => {
    setChatOpen(prev => {
      const next = !prev;
      if (next) {
        setUnreadCount(0);
      }
      return next;
    });
  };

  const handleLeaveTable = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    localStorage.removeItem('poker_table_id');
    const socket = ws.current;
    ws.current = null;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ action: 'leave' }));
      setTimeout(() => {
        socket.close();
        onLeave();
      }, 150);
      return;
    }
    onLeave();
  }, [onLeave]);

  const sendChat = () => {
    const msg = chatInput.trim();
    if (!msg || !ws.current) return;
    ws.current.send(JSON.stringify({ action: 'chat', message: msg }));
    setChatInput('');
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  };

  const getCardColorClass = (card: string) => (card.includes('♥') || card.includes('♦')) ? 'red' : '';
  const renderAnimatedCommunityCard = (card: string, key: string | number) => (
    <div key={key} className={`card community dealing ${getCardColorClass(card)}`}>{card}</div>
  );
  const renderCoveredHoleCard = (key: string | number) => (
    <div
      key={key}
      className="card-back-shell"
      style={{ width: 'clamp(35px, 5vw, 55px)', height: 'clamp(50px, 7vw, 78px)' }}
    >
      <div className="card-back-face">
        <div className="card-back-core">
          <span className="card-back-glyph">♠</span>
        </div>
      </div>
    </div>
  );

  const me = gameState?.players.find(p => p.id === clientId);
  const currentTurnPlayer = gameState?.players[gameState.current_turn_index] || null;
  const derivedRaiseAmount = gameState ? gameState.current_highest_bet + gameState.min_raise : 0;
  
  const isBankrupt = me && me.chips === 0 && (gameState?.phase === "WAITING" || gameState?.phase === "SHOWDOWN");
  const shouldShowBankruptModal = Boolean(isBankrupt && !isSpectating);
  const shouldShowVictory = Boolean(gameState && me && me.chips > 0 && gameState.players.length >= 2 && gameState.players.filter(p => p.id !== clientId).every(p => p.chips === 0 && p.revives_used >= 3 && ((gameState.phase === "WAITING" || gameState.phase === "SHOWDOWN") || !p.is_active)) && !victoryDismissed);

  useEffect(() => {
    if (!shouldShowBankruptModal) return;
    const timeout = setTimeout(() => setBankruptTimer(60), 0);
    return () => clearTimeout(timeout);
  }, [shouldShowBankruptModal]);

  useEffect(() => {
    if (shouldShowBankruptModal) return;
    const timeout = setTimeout(() => setBankruptTimer(null), 0);
    return () => clearTimeout(timeout);
  }, [shouldShowBankruptModal]);

  useEffect(() => {
      if (bankruptTimer === null) return;
      if (bankruptTimer <= 0) {
          handleLeaveTable();
          return;
      }
      const interval = setInterval(() => {
          setBankruptTimer(prev => prev !== null ? prev - 1 : null);
      }, 1000);
      return () => clearInterval(interval);
  }, [bankruptTimer, handleLeaveTable]);

  if (!gameState) {
    return <div className="flex-center"><h2>🌀 正在接入牌桌 #{tableId}...</h2></div>;
  }

  const isMyTurn = currentTurnPlayer?.id === clientId;
  const isWaitingOrShowdown = gameState.phase === "WAITING" || gameState.phase === "SHOWDOWN";
  const readyPlayers = gameState.players.filter(p => p.chips > 0);
  const allReady = readyPlayers.length >= 2 && readyPlayers.every(p => p.is_ready);
  const canCheck = me && (me.current_bet === gameState.current_highest_bet);
  const disableControls = !isMyTurn || isWaitingOrShowdown;
  const showSettlement = gameState.phase === "SHOWDOWN" && gameState.showdown_results && gameState.showdown_results.length > 0;
  const minRaiseTotal = gameState.current_highest_bet + gameState.min_raise;
  const maxRaiseTotal = me ? me.chips + me.current_bet : 0;
  const effectiveRaiseAmount = Math.min(Math.max(raiseAmount || derivedRaiseAmount, minRaiseTotal), Math.max(minRaiseTotal, maxRaiseTotal));
  const showRunTwiceBoards = gameState.run_it_twice === 2 && gameState.run_twice_boards.length === 2 && gameState.run_twice_boards.some(board => board.length > 0);
  const runTwiceBaseCount = gameState.community_cards.length;

  const presetBtnStyle: React.CSSProperties = {
    padding: '3px 8px', fontSize: '0.75rem', background: 'rgba(255,255,255,0.15)',
    color: '#ccc', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px',
    cursor: 'pointer', whiteSpace: 'nowrap'
  };

  return (
    <div className="poker-table-container" style={{ position: 'relative' }}>

      {/* ===== 聊天浮动按钮 ===== */}
        <button 
          onClick={handleChatToggle} 

        style={{ 
          position: 'fixed', bottom: '160px', right: '30px', zIndex: 9999,
          width: '50px', height: '50px', borderRadius: '50%', border: 'none',
          background: chatOpen ? 'var(--accent)' : 'var(--primary)', color: '#000',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,0,0,0.4)',
          transition: 'all 0.2s'
        }}
      >
        <MessageSquare size={22} />
        {unreadCount > 0 && !chatOpen && (
          <span style={{
            position: 'absolute', top: '-5px', right: '-5px', background: 'var(--danger)',
            color: 'white', borderRadius: '50%', width: '22px', height: '22px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.75rem', fontWeight: 'bold'
          }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {/* ===== 聊天面板 ===== */}
      {chatOpen && (
        <div style={{
          position: 'fixed', bottom: '220px', right: '30px', zIndex: 9998,
          width: '320px', height: '360px', background: 'rgba(20,20,20,0.95)',
          borderRadius: '16px', border: '1px solid rgba(255,255,255,0.15)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 10px 40px rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)'
        }}>
          {/* 聊天头部 */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold', color: 'var(--accent)', fontSize: '0.95rem' }}>💬 牌桌聊天</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{chatMessages.length} 条消息</span>
          </div>
          {/* 消息列表 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {chatMessages.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px', fontSize: '0.9rem' }}>
                暂无消息，和对手互搏一下吧！
              </div>
            ) : (
              chatMessages.map((msg, idx) => {
                const isMe = msg.sender === clientId;
                return (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                    <span style={{ fontSize: '0.7rem', color: isMe ? 'var(--accent)' : 'var(--text-muted)', marginBottom: '2px' }}>
                      {isMe ? '你' : msg.sender}
                    </span>
                    <div style={{
                      maxWidth: '85%', padding: '8px 12px', borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      background: isMe ? 'rgba(3,218,198,0.2)' : 'rgba(255,255,255,0.1)',
                      color: 'var(--text-main)', fontSize: '0.9rem', wordBreak: 'break-word', lineHeight: '1.4'
                    }}>
                      {msg.message}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>
          {/* 输入框 */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatKeyDown}
              placeholder="说点什么..."
              maxLength={200}
              style={{
                flex: 1, padding: '8px 12px', background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px',
                color: 'white', fontSize: '0.9rem', outline: 'none'
              }}
            />
            <button
              onClick={sendChat}
              disabled={!chatInput.trim()}
              style={{
                padding: '8px 12px', background: chatInput.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                color: chatInput.trim() ? '#000' : '#555', border: 'none', borderRadius: '8px',
                cursor: chatInput.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center',
                transition: 'all 0.2s'
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
      
      {/* 破产复活弹窗 */}
       {shouldShowBankruptModal && me && (

        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#1a1a1a', padding: '40px', borderRadius: '20px', border: '2px solid var(--danger)', textAlign: 'center', width: '400px' }}>
            <h1 style={{ color: 'var(--danger)', marginBottom: '10px' }}>💔 您已破产</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '30px' }}>
              距离自动退出还有 <span style={{color: 'white', fontWeight: 'bold', fontSize: '1.2rem'}}>{bankruptTimer}</span> 秒
            </p>
            {me.revives_used < 3 ? (
               <button onClick={() => handleAction("revive")} style={{ width: '100%', padding: '15px', background: '#4caf50', color: 'white', border: 'none', borderRadius: '10px', fontSize: '1.2rem', cursor: 'pointer', marginBottom: '10px'}}>
                 🌟 立刻复活 (买入 1000)<br/><span style={{fontSize: '0.9rem', opacity: 0.8}}>剩余复活次数: {3 - me.revives_used} / 3</span>
               </button>
            ) : (
               <div style={{ padding: '20px', background: '#333', borderRadius: '10px', color: 'gray', marginBottom: '10px'}}>
                 ❌ 复活次数已耗尽，您已被淘汰。
               </div>
            )}
            {me.revives_used >= 3 && (
               <button onClick={() => setIsSpectating(true)} style={{ width: '100%', padding: '15px', background: '#2196f3', color: 'white', border: 'none', borderRadius: '10px', fontSize: '1rem', cursor: 'pointer', marginBottom: '10px'}}>
                 👁️ 留在本桌观战
               </button>
            )}
               <button onClick={handleLeaveTable} style={{ width: '100%', padding: '15px', background: 'transparent', border: '1px solid gray', color: 'gray', borderRadius: '10px', fontSize: '1rem', cursor: 'pointer'}}>

              逃离牌局并返回大厅
            </button>
          </div>
        </div>
      )}

      {/* 发两次决定弹窗 */}
      {gameState && gameState.awaiting_run_twice && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'linear-gradient(135deg, #1a1a2e, #16213e)', padding: '40px', borderRadius: '20px', border: '2px solid var(--accent)', textAlign: 'center', minWidth: '400px', maxWidth: '550px', boxShadow: '0 10px 40px rgba(3,218,198,0.3)' }}>
            <h1 style={{ color: 'var(--accent)', margin: '0 0 15px 0', fontSize: '2rem' }}>🃏 发牌次数选择 🃏</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '10px', fontSize: '0.95rem' }}>当前底池: <strong style={{ color: '#ffd700' }}>💰 {gameState.pot}</strong></p>
            {gameState.first_allin_player_id === clientId ? (
              <>
                <p style={{ color: '#ddd', marginBottom: '25px', lineHeight: '1.6', fontSize: '0.95rem' }}>
                  您是第一个 All-In 的玩家，请选择剩余公共牌的发牌次数：
                </p>
                <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
                  <button onClick={() => handleAction("run_once")} style={{ padding: '15px 30px', background: 'linear-gradient(135deg, #4caf50, #2e7d32)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '1.1rem', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(76,175,80,0.4)', flex: 1 }}>
                    🎲 发一次
                    <div style={{ fontSize: '0.75rem', fontWeight: 'normal', marginTop: '5px', opacity: 0.8 }}>正常结算</div>
                  </button>
                  <button onClick={() => handleAction("run_twice")} style={{ padding: '15px 30px', background: 'linear-gradient(135deg, #e65c00, #F9D423)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '1.1rem', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(230,92,0,0.4)', flex: 1 }}>
                    🎲🎲 发两次
                    <div style={{ fontSize: '0.75rem', fontWeight: 'normal', marginTop: '5px', opacity: 0.8 }}>底池对半结算</div>
                  </button>
                </div>
              </>
            ) : (
              <p style={{ color: '#ddd', fontSize: '1.1rem', animation: 'pulse 1.5s infinite' }}>
                ✉️ 等待 <strong style={{ color: 'var(--accent)' }}>{gameState.players.find(p => p.id === gameState.first_allin_player_id)?.name || 'All-In玩家'}</strong> 选择发牌次数...
              </p>
            )}
          </div>
        </div>
      )}

      {/* 结算弹窗 */}
      {showSettlement && (!isBankrupt || isSpectating) && !shouldShowVictory && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#111', padding: '40px', borderRadius: '20px', border: '2px solid gold', textAlign: 'center', minWidth: '500px', boxShadow: '0 10px 40px rgba(255, 215, 0, 0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h1 style={{ color: 'gold', margin: '0 0 30px 0', fontSize: '2.5rem', textShadow: '0 2px 10px rgba(255, 215, 0, 0.3)' }}>🏆 巅峰决战 🏆</h1>

            {/* 发两次的双板展示 */}
            {gameState.run_it_twice === 2 && gameState.run_twice_boards && gameState.run_twice_boards.length === 2 ? (
              <>
                {[0, 1].map(runIdx => (
                  <div key={runIdx} style={{ marginBottom: '20px', padding: '15px', background: runIdx === 0 ? 'rgba(76,175,80,0.1)' : 'rgba(33,150,243,0.1)', borderRadius: '15px', border: `1px solid ${runIdx === 0 ? 'rgba(76,175,80,0.3)' : 'rgba(33,150,243,0.3)'}` }}>
                    <h4 style={{ color: runIdx === 0 ? '#4caf50' : '#2196f3', margin: '0 0 10px 0', fontSize: '1rem' }}>
                      {runIdx === 0 ? '🃏 第一次发牌' : '🃏 第二次发牌'} · 底池 {runIdx === 0 ? Math.floor(gameState.pot / 2) : gameState.pot - Math.floor(gameState.pot / 2)}
                    </h4>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '10px' }}>
                      {gameState.run_twice_boards[runIdx].map((card, cidx) => (
                        <div key={cidx} className={`card community ${getCardColorClass(card)}`} style={{ transform: 'none', width: '50px', height: '70px', fontSize: '1.2rem', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>{card}</div>
                      ))}
                    </div>
                    {gameState.showdown_results.filter(r => r.run === runIdx + 1).map((r, idx) => (
                      <div key={idx} style={{ fontSize: '1.1rem', marginTop: '5px' }}>
                        赢家 <strong style={{ color: 'var(--accent)' }}>{r.name}</strong> 依靠 <span style={{ color: 'white', fontWeight: 'bold' }}>{r.reason}</span> → <span style={{ color: '#4caf50', fontWeight: 'bold' }}>💰 {r.won}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            ) : (
              <>
                {gameState.community_cards.length > 0 && (
                  <div style={{ marginBottom: '30px', padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '15px' }}>
                    <h4 style={{ color: 'var(--text-muted)', margin: '0 0 15px 0', fontSize: '1.1rem' }}>🌍 公共牌面 🌍</h4>
                    <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
                      {gameState.community_cards.map((card, idx) => (
                        <div key={idx} className={`card community ${getCardColorClass(card)}`} style={{ transform: 'none', width: '60px', height: '84px', fontSize: '1.5rem', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>{card}</div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ marginBottom: '30px' }}>
                  {gameState.showdown_results.map((r, idx) => (
                    <div key={idx} style={{ marginBottom: '15px', fontSize: '1.4rem' }}>
                      赢家 <strong style={{ color: 'var(--accent)' }}>{r.name}</strong> 依靠 <span style={{color:'white', fontWeight:'bold'}}>{r.reason}</span> <br/>
                      通吃 <span style={{ color: '#4caf50', fontWeight: 'bold' }}>💰 {r.won}</span> 筹码！
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* 弃牌获胜时的亮牌选项 */}
            {(() => {
              const isFoldWin = gameState.showdown_results.some(r => r.reason.includes('Fold'));
              const amIWinner = me && gameState.showdown_results.some(r => r.name === me.name);
              const myCardsShown = me && me.hole_cards && me.hole_cards.length > 0;
              if (isFoldWin && amIWinner) {
                return (
                  <div style={{ marginBottom: '30px', padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {myCardsShown ? (
                      <>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '15px' }}>
                          {me.hole_cards.map((card, idx) => (
                            <span key={idx} style={{ background: 'white', border: '1px solid #ccc', borderRadius: '8px', padding: '8px 15px', fontSize: '1.5rem', color: getCardColorClass(card) === 'red' ? '#e53935' : '#333', fontWeight: 'bold', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>{card}</span>
                          ))}
                        </div>
                        <button onClick={() => handleAction("hide_cards")} style={{ padding: '8px 20px', background: 'rgba(255,255,255,0.15)', color: '#ccc', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
                          🙈 隐藏底牌
                        </button>
                      </>
                    ) : (
                      <button onClick={() => handleAction("show_cards")} style={{ padding: '10px 25px', background: 'linear-gradient(135deg, #e65c00, #F9D423)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', boxShadow: '0 3px 10px rgba(230,92,0,0.3)' }}>
                        🃏 向对手展示底牌
                      </button>
                    )}
                  </div>
                );
              }
              return null;
            })()}

            {/* 正常showdown的底牌揭晓 */}
            {gameState.players.filter(p => p.is_active && p.hole_cards && p.hole_cards.length > 0).length > 0 && (
              <div style={{ marginBottom: '30px', padding: '20px', background: 'rgba(0,0,0,0.4)', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.1)' }}>
                 <h4 style={{ color: 'var(--text-muted)', margin: '0 0 20px 0', fontSize: '1.1rem' }}>🃏 最终拼杀底牌揭晓 🃏</h4>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                   {gameState.players.filter(p => p.is_active && p.hole_cards && p.hole_cards.length > 0).map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 30px' }}>
                         <span style={{ color: 'white', fontWeight: 'bold', fontSize: '1.3rem' }}>{p.name}</span>
                         <div style={{ display: 'flex', gap: '10px' }}>
                           {p.hole_cards.map((card, idx) => (
                             <span key={idx} style={{ background: 'white', border: '1px solid #ccc', borderRadius: '8px', padding: '8px 15px', fontSize: '1.5rem', color: getCardColorClass(card) === 'red' ? '#e53935' : '#333', fontWeight: 'bold', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>{card}</span>
                           ))}
                         </div>
                      </div>
                   ))}
                 </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '10px' }}>
              {me && me.chips > 0 && (
                <button className="btn-start" style={{ padding: '15px 40px', fontSize: '1.2rem', letterSpacing: '2px', boxShadow: '0 5px 15px rgba(76, 175, 80, 0.4)' }} onClick={() => handleAction("start")}>
                  <Play size={20} /> 新的一局
                </button>
              )}
              <button onClick={handleLeaveTable} style={{ padding: '15px 40px', fontSize: '1.2rem', background: 'transparent', border: '1px solid gray', color: 'gray', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LogOut size={20} /> 返回大厅
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 终极大赢家弹窗 */}
      {shouldShowVictory && me && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,215,0,0.2)', backdropFilter: 'blur(5px)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
           <div style={{ background: 'linear-gradient(135deg, #2a2a2a, #111)', padding: '50px', borderRadius: '20px', border: '3px solid gold', textAlign: 'center', boxShadow: '0px 0px 50px rgba(255,215,0,0.4)', maxWidth: '500px' }}>
             <h1 style={{ fontSize: '3.5rem', color: 'gold', textShadow: '0px 0px 15px gold', margin: '0 0 20px 0' }}>👑 绝对征服 👑</h1>
             <p style={{ fontSize: '1.2rem', color: 'white', lineHeight: '1.6', marginBottom: '30px' }}>
               全桌对手已悉数破产！您的统治已经确立，当前筹码堆积如山：<br/>
               <span style={{ fontSize: '2rem', color: '#4caf50', fontWeight: 'bold', display: 'block', margin: '15px 0' }}>💰 {me.chips}</span>
             </p>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                 <button onClick={handleLeaveTable} style={{ padding: '15px', background: 'linear-gradient(to right, #e65c00, #F9D423)', color: 'white', border: 'none', borderRadius: '10px', fontSize: '1.2rem', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0px 5px 15px rgba(230, 92, 0, 0.4)'}}>

                  🛑 带着荣誉离开 (退回大厅)
                </button>
                <button onClick={() => setVictoryDismissed(true)} style={{ padding: '15px', background: 'transparent', color: 'gold', border: '2px solid gold', borderRadius: '10px', fontSize: '1.2rem', cursor: 'pointer', fontWeight: 'bold'}}>
                  🪑 傲视群雄 (留桌等待挑战者)
                </button>
             </div>
           </div>
        </div>
      )}

      <header className="header" style={{ position: 'relative', zIndex: 10000 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
           <button onClick={handleLeaveTable} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--text-main)', padding: '10px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap:'5px' }}>
             <LogOut size={16} /> 退大厅
           </button>
           <TutorialModal variant="rules" trigger="button" />
           <h1>💎 牌桌 #{tableId}</h1>
        </div>
        <div className="turn-indicator">
          {currentTurnPlayer && !isWaitingOrShowdown ? (
            <span className="active-turn">🗣️ 当前轮到：{currentTurnPlayer.name}</span>
          ) : (
             <span className="waiting">{gameState.phase === "SHOWDOWN" ? "亮牌结算！" : "队伍集结中..."}</span>
          )}
        </div>
      </header>

      <main className="game-board">
        <div className="opponents">
          {gameState.players.map((p) => {
             if (p.id === clientId) return null;
             return (
                <div key={p.id} className="opponent-card" style={{opacity: p.is_online ? (p.is_active ? 1 : 0.4) : 0.35, filter: p.is_online ? 'grayscale(0)' : 'grayscale(1)'}}>

                 <UserCircle size={20} className="icon" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span>{p.name} {!p.is_online ? '[🔴 掉线中]' : p.chips === 0 && p.is_active ? '(All-In)' : ''}</span>
                    <span>💰 {p.chips} | 注: {p.current_bet}</span>
                    <span style={{fontSize: '0.8rem', color:'var(--text-muted)'}}>
                      ❤️ 剩余买入: {3 - p.revives_used}{gameState.phase === "WAITING" ? ` | ${p.is_ready ? '✅ 已准备' : '⏳ 未准备'}` : ''}
                    </span>
                  </div>

                 {p.is_active || <span className="badge" style={{background: 'var(--danger)'}}>弃牌</span>}
                 {gameState.current_turn_index === gameState.players.indexOf(p) && !isWaitingOrShowdown && (
                   <span className="badge" style={{background: 'var(--accent)'}}>思考中</span>
                 )}
                 {p.hole_cards && p.hole_cards.length > 0 && gameState.phase === "SHOWDOWN" && (
                   <div style={{display:'flex', gap:'5px', marginTop:'10px'}}>
                     {p.hole_cards.map((c, i) => (
                       <span key={i} style={{background:'white', borderRadius:'4px', padding:'3px 8px', fontSize:'1rem', color: c.includes('♥')||c.includes('♦')?'#e53935':'#333', fontWeight:'bold', boxShadow:'1px 1px 3px rgba(0,0,0,0.5)'}}>{c}</span>
                     ))}
                   </div>
                 )}
               </div>
             )
          })}
        </div>

        <section className="community-area">
          <h3>总底池: <span className="pot-amount">💰{gameState.pot}</span></h3>
          <p style={{ margin:0, fontSize:'0.85rem', color:'var(--text-muted)'}}>最高下注: {gameState.current_highest_bet}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
            {showRunTwiceBoards ? (
              gameState.run_twice_boards.map((board, rowIdx) => (
                (rowIdx === 0 || gameState.phase === "SHOWDOWN" || board.length > runTwiceBaseCount) ? (
                <div key={rowIdx} style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: rowIdx === 0 ? '#4caf50' : '#64b5f6', fontWeight: 'bold', letterSpacing: '1px' }}>
                    {rowIdx === 0 ? '第 1 排公共牌' : '第 2 排公共牌'}
                  </span>
                  <div className="cards-row">
                    {board.length > 0
                      ? board.map((card, i) => renderAnimatedCommunityCard(card, `${rowIdx}-${i}`))
                      : <div className="card empty">等待发牌...</div>}
                  </div>
                </div>
                ) : null
              ))
            ) : (
              <div className="cards-row">
                {gameState.community_cards.length > 0 
                 ? gameState.community_cards.map((card, i) => renderAnimatedCommunityCard(card, i))
                 : <div className="card empty">等待发牌...</div>}
              </div>
            )}
          </div>
          <div className="phase-badge">当前阶段: {gameState.phase}</div>
        </section>

        {me && (
          <section style={{ flexShrink: 0, background: 'rgba(0,0,0,0.75)', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '0' }}>
            
            {/* Row 1: 底牌 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '0.8vh 2vw', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 'clamp(0.75rem, 1.3vw, 1rem)' }}>
                {me.name} 的底牌{isSpectating && ' 👁️观战中'}:
              </span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {me.hole_cards.length > 0 ? (
                  cardsRevealed ? (
                    me.hole_cards.map((card, idx) => (
                      <div key={idx} className={`card private ${getCardColorClass(card)}`} style={{ width: 'clamp(35px, 5vw, 55px)', height: 'clamp(50px, 7vw, 78px)', fontSize: 'clamp(1rem, 2vw, 1.6rem)', transition: 'all 0.3s' }}>{card}</div>
                    ))
                  ) : (
                    me.hole_cards.map((_, idx) => (
                      renderCoveredHoleCard(idx)
                    ))
                  )
                ) : (
                  <span style={{ color: 'var(--text-muted)', fontSize: 'clamp(0.7rem, 1.2vw, 0.9rem)' }}>暂无手牌</span>
                )}
              </div>
              {me.hole_cards.length > 0 && (
                <button 
                  onClick={() => {
                    if (cardsRevealed) return;
                    setCardsRevealed(true);
                    if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
                    peekTimerRef.current = setTimeout(() => setCardsRevealed(false), 3000);
                  }}
                  style={{ padding: '4px 12px', background: cardsRevealed ? 'rgba(3,218,198,0.3)' : 'rgba(255,255,255,0.15)', color: cardsRevealed ? 'var(--accent)' : '#ccc', border: `1px solid ${cardsRevealed ? 'var(--accent)' : 'rgba(255,255,255,0.2)'}`, borderRadius: '8px', cursor: cardsRevealed ? 'default' : 'pointer', fontSize: 'clamp(0.7rem, 1.1vw, 0.85rem)', whiteSpace: 'nowrap', transition: 'all 0.3s' }}
                >
                  {cardsRevealed ? '👁️ 展示中...' : '👀 看牌'}
                </button>
              )}
            </div>

            {/* Row 2: 筹码 + 剩余买入 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', padding: '0.5vh 2vw', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 'clamp(0.7rem, 1.2vw, 0.9rem)' }}>
              <span style={{ color: 'var(--text-muted)' }}>筹码: <strong style={{ color: '#ffd700' }}>💰 {me.chips}</strong></span>
              <span style={{ color: 'var(--text-muted)' }}>本轮下注: <strong style={{ color: 'white' }}>💰 {me.current_bet}</strong></span>
              <span style={{ color: 'var(--text-muted)' }}>❤️ 剩余买入: <strong style={{ color: 'var(--accent)' }}>{3 - me.revives_used}</strong></span>
              {gameState.phase === "WAITING" && <span style={{ color: me.is_ready ? '#4caf50' : 'var(--text-muted)' }}>{me.is_ready ? '✅ 你已准备' : '⏳ 你未准备'}</span>}
            </div>

            {gameState.phase === "WAITING" ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '1vh 2vw', flexWrap: 'wrap' }}>
                <button
                  className="btn-start"
                  style={{ padding: '0.8vh 3vw', fontSize: 'clamp(0.85rem, 1.5vw, 1.1rem)', opacity: isSpectating || me.chips === 0 || me.is_ready ? 0.5 : 1 }}
                  onClick={() => handleAction("ready")}
                  disabled={isSpectating || me.chips === 0 || me.is_ready}
                >
                  <Play size={16} /> 准备
                </button>
                <button
                  style={{ padding: '0.8vh 3vw', fontSize: 'clamp(0.85rem, 1.5vw, 1.1rem)', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '10px', opacity: isSpectating || me.chips === 0 || !me.is_ready ? 0.5 : 1, cursor: isSpectating || me.chips === 0 || !me.is_ready ? 'not-allowed' : 'pointer' }}
                  onClick={() => handleAction("unready")}
                  disabled={isSpectating || me.chips === 0 || !me.is_ready}
                >
                  取消准备
                </button>
                <button
                  className="btn-start"
                  style={{ padding: '0.8vh 3vw', fontSize: 'clamp(0.85rem, 1.5vw, 1.1rem)', opacity: allReady ? 1 : 0.5 }}
                  onClick={() => handleAction("start")}
                  disabled={!allReady}
                >
                  <Play size={16} /> {readyPlayers.length < 2 ? '等待筹码充足的玩家...' : allReady ? '🎲 开始发牌' : `等待全部准备 (${readyPlayers.filter(p => p.is_ready).length}/${readyPlayers.length})`}
                </button>
              </div>
            ) : (
              <>
                {/* Row 3: 弃牌 + 过牌/跟注 */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', padding: '0.6vh 2vw', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <button style={{ flex: 1, maxWidth: '200px', background: 'var(--danger)', color: 'white', opacity: disableControls ? 0.3 : 1, cursor: disableControls ? 'not-allowed' : 'pointer', justifyContent: 'center' }} disabled={disableControls} onClick={() => handleAction("fold")}>
                    <XCircle size={16} /> 弃牌
                  </button>
                  {canCheck ? (
                    <button style={{ flex: 1, maxWidth: '200px', background: '#4caf50', color: 'white', opacity: disableControls ? 0.3 : 1, cursor: disableControls ? 'not-allowed' : 'pointer', justifyContent: 'center' }} disabled={disableControls} onClick={() => handleAction("check")}>
                      <Check size={16} /> 过牌
                    </button>
                  ) : (
                    <button style={{ flex: 1, maxWidth: '200px', background: '#2196f3', color: 'white', opacity: disableControls ? 0.3 : 1, cursor: disableControls ? 'not-allowed' : 'pointer', justifyContent: 'center' }} disabled={disableControls} onClick={() => handleAction("call")}>
                      <Coins size={16} /> 跟注 ({Math.min(gameState.current_highest_bet - me.current_bet, me.chips)})
                    </button>
                  )}
                </div>

                {/* Row 4: 预设加注 + 自定义输入 + 加注按钮 + ALL-IN */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0.6vh 2vw', flexWrap: 'wrap', opacity: disableControls ? 0.3 : 1, pointerEvents: disableControls ? 'none' : 'auto' }}>
                  <button onClick={() => setRaiseAmount(minRaiseTotal)} style={presetBtnStyle}>最小</button>
                  <button onClick={() => setRaiseAmount(Math.min(gameState.current_highest_bet * 2, maxRaiseTotal))} style={presetBtnStyle}>2x</button>
                  <button onClick={() => setRaiseAmount(Math.min(gameState.current_highest_bet * 3, maxRaiseTotal))} style={presetBtnStyle}>3x</button>
                  <button onClick={() => setRaiseAmount(Math.min(Math.floor(gameState.pot / 2) + gameState.current_highest_bet, maxRaiseTotal))} style={presetBtnStyle}>½底池</button>
                  <button onClick={() => setRaiseAmount(Math.min(gameState.pot + gameState.current_highest_bet, maxRaiseTotal))} style={presetBtnStyle}>满底池</button>
                  <input 
                     type="number" min={minRaiseTotal} max={maxRaiseTotal} value={effectiveRaiseAmount}

                    onChange={(e) => { const v = Number(e.target.value); if (!isNaN(v)) setRaiseAmount(v); }} 
                    style={{ width: '70px', padding: '4px 6px', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '6px', fontSize: 'clamp(0.7rem, 1.1vw, 0.9rem)', textAlign: 'center', outline: 'none' }} 
                  />
                   <button className="btn-bet" onClick={() => handleAction("raise", effectiveRaiseAmount - me.current_bet)} disabled={effectiveRaiseAmount > maxRaiseTotal || effectiveRaiseAmount < minRaiseTotal} style={{ fontSize: 'clamp(0.7rem, 1.1vw, 0.9rem)' }}>
                     <ArrowUpCircle size={14} /> 加注到 {effectiveRaiseAmount}

                  </button>
                  <button style={{ background: 'linear-gradient(135deg, #7b1fa2, #4a148c)', color: 'white', opacity: disableControls ? 0.3 : 1, cursor: disableControls ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: 'clamp(0.7rem, 1.1vw, 0.9rem)' }} disabled={disableControls} onClick={() => handleAction("all-in")}>
                    🔥 ALL-IN
                  </button>
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
};
