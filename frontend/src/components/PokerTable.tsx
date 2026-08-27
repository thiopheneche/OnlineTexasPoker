import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Coins, Play, LogOut, Check, ArrowUpCircle, XCircle, MessageSquare, Send,
  Eye, EyeOff, MoreHorizontal, Clock, Info, Users
} from 'lucide-react';
import { TutorialModal } from './Tutorial';
import { tableWsUrl } from '../config';

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
  position: string;
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
  small_blind: number;
  big_blind: number;
  buy_in: number;
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

const AVATAR_PALETTE = ['#7c5cbf', '#2f8f7a', '#8f6b2f', '#5c7cbf', '#bf5c7c', '#4f9e68', '#9e7a4f'];

const avatarColor = (name: string) => {
  let idx = 0;
  for (let i = 0; i < name.length; i++) idx = (idx + name.charCodeAt(i)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx];
};

const SeatAvatar: React.FC<{ name: string; size: number }> = ({ name, size }) => (
  <span
    className="a-avatar"
    style={{ width: size, height: size, background: avatarColor(name), fontSize: Math.round(size * 0.42) }}
  >
    {name.charAt(0)}
  </span>
);

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
  const [settlementDismissed, setSettlementDismissed] = useState<boolean>(false);
  const [raiseOpen, setRaiseOpen] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [isNarrow, setIsNarrow] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth <= 640);
  const ws = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const leavingRef = useRef(false);
  const chatOpenRef = useRef(false);
  const lastRaiseTurnKeyRef = useRef('');
  const previousPhaseRef = useRef('');

  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const onChange = () => setIsNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    localStorage.setItem('poker_table_id', tableId);
    leavingRef.current = false;
    ws.current = new WebSocket(tableWsUrl(tableId, clientId));
    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat') {
          const msg: ChatMessage = { sender: data.sender, message: data.message, timestamp: Date.now() };
          setChatMessages(prev => [...prev.slice(-99), msg]);
          if (!chatOpenRef.current) {
            setUnreadCount(prev => prev + 1);
          }
        } else {
          const nextState = data as GameState;
          const nextTurnPlayer = nextState.players[nextState.current_turn_index];
          const nextTurnKey = `${nextState.phase}:${nextTurnPlayer?.id || ''}`;
          if (nextTurnKey !== lastRaiseTurnKeyRef.current) {
            lastRaiseTurnKeyRef.current = nextTurnKey;
            if (nextTurnPlayer?.id === clientId) {
              const nextMe = nextState.players.find(player => player.id === clientId);
              const nextMinRaise = nextState.current_highest_bet + nextState.min_raise;
              const nextMaxRaise = nextMe ? nextMe.chips + nextMe.current_bet : 0;
              setRaiseAmount(Math.min(nextMinRaise, nextMaxRaise));
            }
          }
          if (nextState.phase === "SHOWDOWN" && previousPhaseRef.current !== "SHOWDOWN") {
            setSettlementDismissed(false);
          }
          previousPhaseRef.current = nextState.phase;
          setGameState(nextState);
        }
      } catch (e) { console.error("Failed to parse", e); }
    };
    return () => {
      const socket = ws.current;
      ws.current = null;
      if (!leavingRef.current) {
        socket?.close();
        return;
      }
      socket?.close();
    };
  }, [tableId, clientId]);

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

  const renderCommunityCard = (card: string, key: string | number) => (
    <div key={key} className={`card dealing ${getCardColorClass(card)}`}>{card}</div>
  );

  const renderSlot = (key: string | number) => <div key={key} className="card slot" />;

  const renderBoard = (cards: string[]) => (
    <div className="a-community">
      {cards.map((card, i) => renderCommunityCard(card, i))}
      {Array.from({ length: Math.max(0, 5 - cards.length) }).map((_, i) => renderSlot(`s${i}`))}
    </div>
  );

  const me = gameState?.players.find(p => p.id === clientId);
  const currentTurnPlayer = gameState?.players[gameState.current_turn_index] || null;
  const minRaiseTotal = gameState ? gameState.current_highest_bet + gameState.min_raise : 0;
  const maxRaiseTotal = me ? me.chips + me.current_bet : 0;
  const sliderMin = Math.min(minRaiseTotal, maxRaiseTotal);
  const effectiveRaiseAmount = Math.min(Math.max(raiseAmount || sliderMin, sliderMin), maxRaiseTotal);
  const isAllInSelected = maxRaiseTotal > 0 && effectiveRaiseAmount >= maxRaiseTotal;
  const raiseProgress = maxRaiseTotal > sliderMin
    ? ((effectiveRaiseAmount - sliderMin) / (maxRaiseTotal - sliderMin)) * 100
    : 100;

  const hasSettlement = Boolean(gameState?.phase === "SHOWDOWN" && gameState.showdown_results?.length > 0);
  const isBankrupt = me && me.chips === 0 && (gameState?.phase === "WAITING" || gameState?.phase === "SHOWDOWN");
  const shouldShowBankruptModal = Boolean(
    isBankrupt && !isSpectating && (!hasSettlement || settlementDismissed)
  );
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

  const isMyTurnNow = Boolean(
    gameState &&
    currentTurnPlayer?.id === clientId &&
    gameState.phase !== "WAITING" &&
    gameState.phase !== "SHOWDOWN"
  );

  // 不再轮到我时，收起加注面板，避免残留在非法状态
  useEffect(() => {
    if (!isMyTurnNow) setRaiseOpen(false);
  }, [isMyTurnNow]);

  if (!gameState) {
    return (
      <div className="a-table-page">
        <div className="loading-screen">
          <Clock size={24} />
          <span>正在接入牌桌 #{tableId}…</span>
        </div>
      </div>
    );
  }

  const isMyTurn = currentTurnPlayer?.id === clientId;
  const isWaitingOrShowdown = gameState.phase === "WAITING" || gameState.phase === "SHOWDOWN";
  const readyPlayers = gameState.players.filter(p => p.chips > 0);
  const allReady = readyPlayers.length >= 2 && readyPlayers.every(p => p.is_ready);
  const canCheck = me && (me.current_bet === gameState.current_highest_bet);
  const disableControls = !isMyTurn || isWaitingOrShowdown;
  const showSettlement = hasSettlement && !settlementDismissed;
  const showRunTwiceBoards = gameState.run_it_twice === 2 && gameState.run_twice_boards.length === 2 && gameState.run_twice_boards.some(board => board.length > 0);
  const runTwiceBaseCount = gameState.community_cards.length;
  const callAmount = me ? Math.min(gameState.current_highest_bet - me.current_bet, me.chips) : 0;

  /* ---- 座位：按人数沿椭圆桌沿分布，本人固定正下方 ---- */
  const myIndex = gameState.players.findIndex(p => p.id === clientId);
  const opponents = myIndex >= 0
    ? [...gameState.players.slice(myIndex + 1), ...gameState.players.slice(0, myIndex)]
    : gameState.players;

  const rx = isNarrow ? 46 : 44;
  const ry = isNarrow ? 44 : 42;
  const xMin = isNarrow ? 6 : 12;
  const xMax = isNarrow ? 94 : 88;
  const seatPos = (i: number, n: number): React.CSSProperties => {
    const deg = n === 1 ? 270 : 150 + i * (240 / (n - 1));
    const rad = deg * Math.PI / 180;
    const x = Math.min(xMax, Math.max(xMin, 50 + rx * Math.cos(rad)));
    const y = Math.min(90, Math.max(6, 50 + ry * Math.sin(rad)));
    return { left: `${x.toFixed(1)}%`, top: `${y.toFixed(1)}%` };
  };

  const seatStatus = (p: Player) => {
    if (!p.is_online) return <span className="st">掉线</span>;
    if (!p.is_active) return <span className="st">已弃牌</span>;
    if (p.chips === 0) return <span className="st allin">ALL-IN</span>;
    if (isWaitingOrShowdown) return <span className={`st${p.is_ready ? ' ready' : ''}`}>{p.is_ready ? '已准备' : '未准备'}</span>;
    return null;
  };

  const closeRaise = () => setRaiseOpen(false);
  const confirmRaise = () => {
    if (!me) return;
    if (isAllInSelected) handleAction("all-in");
    else handleAction("raise", effectiveRaiseAmount - me.current_bet);
    setRaiseOpen(false);
  };
  const setQuickRaise = (target: number) => {
    setRaiseAmount(Math.min(Math.max(target, sliderMin), maxRaiseTotal));
  };

  return (
    <div className={`a-table-page${raiseOpen ? ' raising' : ''}`}>

      {/* ===== 极顶栏：返回 + 当前行动 + 菜单 ===== */}
      <div className="a-table-chrome">
        <button className="a-icon-btn" onClick={handleLeaveTable} aria-label="返回大厅">
          <LogOut size={18} />
        </button>

        {currentTurnPlayer && !isWaitingOrShowdown ? (
          <span className="a-turn-hint">
            {isMyTurn ? '轮到你行动' : `等待 ${currentTurnPlayer.name} 行动`}
          </span>
        ) : (
          <span className="a-turn-hint muted">
            {gameState.phase === "SHOWDOWN" ? '本局结算' : '等待开局'}
          </span>
        )}

        <button className="a-icon-btn" onClick={() => setMenuOpen(true)} aria-label="菜单">
          <MoreHorizontal size={20} />
        </button>
      </div>

      {/* ===== 牌桌 ===== */}
      <div className="a-felt">
        {opponents.map((p, i) => (
          <div
            key={p.id}
            className={`a-seat${!p.is_active ? ' folded' : ''}${!p.is_online ? ' offline' : ''}`}
            style={seatPos(i, opponents.length)}
          >
            {currentTurnPlayer?.id === p.id && !isWaitingOrShowdown && <div className="turn-ring" />}
            <div className="a-seat-pill">
              <SeatAvatar name={p.name} size={isNarrow ? 24 : 30} />
              <div className="info">
                <span className="nm">
                  {p.name}
                  {p.position && <span className="position-badge">{p.position}</span>}
                </span>
                <span className="ch">{p.chips}</span>
              </div>
            </div>
            <div className="a-seat-tags">
              {p.current_bet > 0 && p.is_active && <span className="a-bet-chip">{p.current_bet}</span>}
              {seatStatus(p)}
            </div>
            {p.is_active && p.hole_cards && p.hole_cards.length > 0 && gameState.phase === "SHOWDOWN" && (
              <div className="a-seat-cards">
                {p.hole_cards.map((c, ci) => (
                  <div key={ci} className={`card ${getCardColorClass(c)}`}>{c}</div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="a-felt-center">
          <div className="a-pot">
            <Coins size={16} /> 底池 <span className="chip-num">{gameState.pot}</span>
          </div>

          {showRunTwiceBoards ? (
            gameState.run_twice_boards.map((board, rowIdx) => (
              (rowIdx === 0 || gameState.phase === "SHOWDOWN" || board.length > runTwiceBaseCount) ? (
                <div key={rowIdx} className="a-board-row">
                  <span className="a-board-label" style={{ color: rowIdx === 0 ? 'var(--accent)' : 'var(--primary)' }}>
                    {rowIdx === 0 ? '第 1 排' : '第 2 排'}
                  </span>
                  {renderBoard(board)}
                </div>
              ) : null
            ))
          ) : (
            renderBoard(gameState.community_cards)
          )}

          <div className="a-phase-hint">{gameState.phase}</div>
        </div>
      </div>

      {/* ===== 我的底牌 ===== */}
      {me && (
        <div className="a-me">
          <div className="a-me-cards">
            {me.hole_cards.length > 0 ? (
              cardsRevealed ? (
                me.hole_cards.map((card, idx) => (
                  <div key={idx} className={`card ${getCardColorClass(card)}`}>{card}</div>
                ))
              ) : (
                me.hole_cards.map((_, idx) => (
                  <div key={idx} className="card-back-shell">
                    <div className="card-back-face">
                      <div className="card-back-core"><span className="card-back-glyph">♠</span></div>
                    </div>
                  </div>
                ))
              )
            ) : (
              <>
                <div className="card slot" />
                <div className="card slot" />
              </>
            )}
          </div>

          <div className="a-me-row">
            <span className="nm">
              {me.name}
              {me.position && <span className="position-badge">{me.position}</span>}
            </span>
            <span className="chip-num">{me.chips}</span>
            {me.current_bet > 0 && <span>本轮 <span className="chip-num">{me.current_bet}</span></span>}
            {isSpectating && <span>观战中</span>}
            {me.hole_cards.length > 0 && (
              <button
                type="button"
                className={`a-peek${cardsRevealed ? ' on' : ''}`}
                onClick={() => setCardsRevealed(revealed => !revealed)}
                aria-pressed={cardsRevealed}
              >
                {cardsRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
                {cardsRevealed ? '盖牌' : '看牌'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===== 行动区：只显示当前状态需要的控件 ===== */}
      {me && (isWaitingOrShowdown ? (
        <div className="a-dock-wait">
          {me.chips === 0 || isSpectating ? (
            <span className="waiting-text">
              <Clock size={15} />
              {isSpectating ? '观战中，等待本局结束' : '等待处理买入'}
            </span>
          ) : !me.is_ready ? (
            <div className="a-dock">
              <button className="ready" onClick={() => handleAction("ready")}>
                <Play size={17} /> 准备
              </button>
            </div>
          ) : allReady ? (
            <div className="a-dock">
              <button className="ghost" onClick={() => handleAction("unready")}>取消准备</button>
              <button className="ready" onClick={() => handleAction("start")}>
                <Play size={17} /> 开始发牌
              </button>
            </div>
          ) : (
            <>
              <span className="waiting-text">
                <Clock size={15} />
                等待其他玩家准备（{readyPlayers.filter(p => p.is_ready).length}/{readyPlayers.length}）
              </span>
              <div className="a-dock" style={{ padding: 0 }}>
                <button className="ghost" onClick={() => handleAction("unready")}>取消准备</button>
              </div>
            </>
          )}
        </div>
      ) : isMyTurn ? (
        <div className="a-dock">
          <button className="fold" onClick={() => handleAction("fold")}>
            <XCircle size={17} /> 弃牌
          </button>
          {canCheck ? (
            <button className="call" onClick={() => handleAction("check")}>
              <Check size={17} /> 过牌
            </button>
          ) : (
            <button className="call" onClick={() => handleAction("call")}>
              <Coins size={17} /> 跟注 {callAmount}
            </button>
          )}
          <button className="raise" onClick={() => setRaiseOpen(true)} disabled={maxRaiseTotal <= sliderMin}>
            <ArrowUpCircle size={17} /> 加注
          </button>
        </div>
      ) : (
        <div className="a-dock-wait">
          <span className="waiting-text">
            <Clock size={15} />
            {currentTurnPlayer ? `等待 ${currentTurnPlayer.name} 行动…` : '等待其他玩家行动…'}
          </span>
        </div>
      ))}

      {/* ===== 加注面板：点「加注」才展开 ===== */}
      {raiseOpen && me && (
        <>
          <div className="a-raise-scrim" onClick={closeRaise} />
          <div className={`a-raise${isAllInSelected ? ' all-in' : ''}`}>
            <div className="a-raise-head">
              <span className="t">{isAllInSelected ? '全押' : '加注到'}</span>
              <span className="v">{isAllInSelected ? 'ALL-IN' : effectiveRaiseAmount}</span>
            </div>

            <input
              type="range"
              min={sliderMin}
              max={maxRaiseTotal}
              step={1}
              value={effectiveRaiseAmount}
              aria-label={`加注金额，最小 ${sliderMin}，全押 ${maxRaiseTotal}`}
              onChange={(event) => setRaiseAmount(Number(event.target.value))}
              style={{ '--raise-progress': `${raiseProgress}%` } as React.CSSProperties}
            />
            <div className="a-raise-marks">
              <span>最小 {sliderMin}</span>
              <span>ALL-IN {maxRaiseTotal}</span>
            </div>

            <div className="a-raise-quick">
              <button onClick={() => setQuickRaise(sliderMin)}>最小</button>
              <button onClick={() => setQuickRaise(gameState.current_highest_bet + Math.floor(gameState.pot / 2))}>1/2 池</button>
              <button onClick={() => setQuickRaise(gameState.current_highest_bet + gameState.pot)}>底池</button>
              <button onClick={() => setQuickRaise(maxRaiseTotal)}>ALL-IN</button>
            </div>

            <div className="a-raise-btns">
              <button className="cancel" onClick={closeRaise}>取消</button>
              <button className="ok" onClick={confirmRaise} disabled={disableControls || maxRaiseTotal <= 0}>
                {isAllInSelected ? `确认 ALL-IN · ${maxRaiseTotal}` : `确认加注到 ${effectiveRaiseAmount}`}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ===== 聊天：默认收起 ===== */}
      <button
        className={`a-chat-fab${chatOpen ? ' on' : ''}`}
        onClick={handleChatToggle}
        aria-label="聊天"
      >
        <MessageSquare size={20} />
        {unreadCount > 0 && !chatOpen && (
          <span className="a-chat-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {chatOpen && (
        <div className="a-chat-panel">
          <div className="a-chat-head">
            牌桌聊天 <span className="n">{chatMessages.length} 条</span>
          </div>
          <div className="a-chat-list">
            {chatMessages.length === 0 ? (
              <div className="a-chat-empty">还没有人说话</div>
            ) : (
              chatMessages.map((msg, idx) => {
                const isMe = msg.sender === clientId;
                return (
                  <div key={idx} className={`a-chat-msg${isMe ? ' mine' : ''}`}>
                    <div className="who">{isMe ? '你' : msg.sender}</div>
                    <span className="body">{msg.message}</span>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="a-chat-input">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleChatKeyDown}
              placeholder="说点什么..."
              maxLength={200}
            />
            <button onClick={sendChat} disabled={!chatInput.trim()} aria-label="发送">
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ===== 菜单：低频操作 ===== */}
      {menuOpen && (
        <div className="a-menu-mask" onClick={(e) => { if (e.target === e.currentTarget) setMenuOpen(false); }}>
          <div className="a-menu">
            <div className="a-menu-item">
              <Info size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span style={{ color: 'var(--text-main)' }}>
                盲注 {gameState.small_blind}/{gameState.big_blind} · 买入 {gameState.buy_in}
              </span>
            </div>
            {me && (
              <div className="a-menu-item">
                <Users size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <span style={{ color: 'var(--text-main)' }}>剩余买入次数 {3 - me.revives_used}</span>
              </div>
            )}
            <div className="a-menu-item"><TutorialModal variant="rules" trigger="link" /></div>
            <button className="danger" onClick={() => { setMenuOpen(false); handleLeaveTable(); }}>
              <LogOut size={16} /> 离开牌桌
            </button>
            <div className="menu-note">牌桌 #{tableId} · 主动离桌会立即结算并返还全局筹码。</div>
          </div>
        </div>
      )}

      {/* ===== 破产复活弹窗 ===== */}
      {shouldShowBankruptModal && me && (
        <div className="modal-overlay" style={{ zIndex: 10002 }}>
          <div className="modal-card danger">
            <h1>你已破产</h1>
            <p className="modal-sub">
              距离自动退出还有 <strong style={{ color: '#fff' }}>{bankruptTimer}</strong> 秒
            </p>
            {me.revives_used < 3 ? (
              <div className="modal-actions" style={{ flexDirection: 'column', marginBottom: 12 }}>
                <button className="accent" onClick={() => handleAction("revive")}>
                  立刻买入复活（{gameState.buy_in}） · 剩余 {3 - me.revives_used}/3
                </button>
              </div>
            ) : (
              <>
                <p className="modal-note">复活次数已耗尽，你已被淘汰。</p>
                <div className="modal-actions" style={{ flexDirection: 'column', marginBottom: 12 }}>
                  <button className="ghost" onClick={() => setIsSpectating(true)}>留在本桌观战</button>
                </div>
              </>
            )}
            <div className="modal-actions">
              <button className="ghost" onClick={handleLeaveTable}>
                <LogOut size={17} /> 返回大厅
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 发两次决定弹窗 ===== */}
      {gameState.awaiting_run_twice && (
        <div className="modal-overlay" style={{ zIndex: 60 }}>
          <div className="modal-card accent">
            <h1>发牌次数选择</h1>
            <p className="modal-sub">当前底池 <span className="chip-num">{gameState.pot}</span></p>
            {gameState.first_allin_player_id === clientId ? (
              <>
                <p className="modal-note">你是第一个 All-In 的玩家，请选择剩余公共牌的发牌次数。</p>
                <div className="run-choice">
                  <button className="once" onClick={() => handleAction("run_once")}>
                    发一次<span className="s">正常结算</span>
                  </button>
                  <button className="twice" onClick={() => handleAction("run_twice")}>
                    发两次<span className="s">底池对半结算</span>
                  </button>
                </div>
              </>
            ) : (
              <p className="modal-note">
                等待 <strong style={{ color: 'var(--accent)' }}>
                  {gameState.players.find(p => p.id === gameState.first_allin_player_id)?.name || 'All-In 玩家'}
                </strong> 选择发牌次数…
              </p>
            )}
          </div>
        </div>
      )}

      {/* ===== 结算弹窗 ===== */}
      {showSettlement && !shouldShowVictory && (
        <div className="modal-overlay" style={{ zIndex: 10001 }}>
          <div className="modal-card gold">
            <h1>本局结算</h1>

            {gameState.run_it_twice === 2 && gameState.run_twice_boards && gameState.run_twice_boards.length === 2 ? (
              [0, 1].map(runIdx => (
                <div key={runIdx} className={`modal-section run-${runIdx + 1}`}>
                  <h4>
                    {runIdx === 0 ? '第一次发牌' : '第二次发牌'} · 底池{' '}
                    {runIdx === 0 ? Math.floor(gameState.pot / 2) : gameState.pot - Math.floor(gameState.pot / 2)}
                  </h4>
                  <div className="modal-cards-row">
                    {gameState.run_twice_boards[runIdx].map((card, cidx) => (
                      <div key={cidx} className={`card ${getCardColorClass(card)}`}>{card}</div>
                    ))}
                  </div>
                  {gameState.showdown_results.filter(r => r.run === runIdx + 1).map((r, idx) => (
                    <div key={idx} className="modal-win-line" style={{ marginTop: 10 }}>
                      <span className="who">{r.name}</span> 依靠 <span className="why">{r.reason}</span> 赢得{' '}
                      <span className="won">{r.won}</span>
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <>
                {gameState.community_cards.length > 0 && (
                  <div className="modal-section">
                    <h4>公共牌</h4>
                    <div className="modal-cards-row">
                      {gameState.community_cards.map((card, idx) => (
                        <div key={idx} className={`card ${getCardColorClass(card)}`}>{card}</div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="modal-section">
                  {gameState.showdown_results.map((r, idx) => (
                    <div key={idx} className="modal-win-line">
                      <span className="who">{r.name}</span> 依靠 <span className="why">{r.reason}</span> 通吃{' '}
                      <span className="won">{r.won}</span>
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
                  <div className="modal-section">
                    {myCardsShown ? (
                      <>
                        <div className="modal-cards-row" style={{ marginBottom: 12 }}>
                          {me!.hole_cards.map((card, idx) => (
                            <div key={idx} className={`card ${getCardColorClass(card)}`}>{card}</div>
                          ))}
                        </div>
                        <div className="modal-actions">
                          <button className="ghost" onClick={() => handleAction("hide_cards")}>隐藏底牌</button>
                        </div>
                      </>
                    ) : (
                      <div className="modal-actions">
                        <button className="gold" onClick={() => handleAction("show_cards")}>向对手展示底牌</button>
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })()}

            {/* 正常摊牌的底牌揭晓 */}
            {gameState.players.filter(p => p.is_active && p.hole_cards && p.hole_cards.length > 0).length > 0 && (
              <div className="modal-section">
                <h4>底牌揭晓</h4>
                {gameState.players.filter(p => p.is_active && p.hole_cards && p.hole_cards.length > 0).map(p => (
                  <div key={p.id} className="modal-show-row">
                    <span className="nm">{p.name}</span>
                    <div className="modal-cards-row">
                      {p.hole_cards.map((card, idx) => (
                        <div key={idx} className={`card ${getCardColorClass(card)}`}>{card}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="modal-actions">
              {isBankrupt ? (
                <button
                  className="primary"
                  onClick={() => {
                    setSettlementDismissed(true);
                    setBankruptTimer(60);
                  }}
                >
                  <Play size={18} /> 查看完毕，处理破产
                </button>
              ) : me && me.chips > 0 && (
                <button
                  className="primary"
                  onClick={() => {
                    if (!me.is_ready) handleAction("ready");
                    setSettlementDismissed(true);
                  }}
                >
                  <Play size={18} /> {me.is_ready ? '继续等待下一局' : '准备下一局'}
                </button>
              )}
              <button className="ghost" onClick={handleLeaveTable}>
                <LogOut size={18} /> 返回大厅
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 终极大赢家弹窗 ===== */}
      {shouldShowVictory && me && (
        <div className="modal-overlay" style={{ zIndex: 999 }}>
          <div className="modal-card gold">
            <h1>全桌通吃</h1>
            <p className="modal-sub">
              桌上对手已全部出局，当前筹码
              <span className="chip-num" style={{ display: 'block', fontSize: '2rem', margin: '14px 0' }}>{me.chips}</span>
            </p>
            <div className="modal-actions" style={{ flexDirection: 'column' }}>
              <button className="gold" onClick={handleLeaveTable}>带着筹码返回大厅</button>
              <button className="ghost" onClick={() => setVictoryDismissed(true)}>留桌等待挑战者</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
