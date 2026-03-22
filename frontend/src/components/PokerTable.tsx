import React, { useEffect, useState, useRef } from 'react';
import { Coins, Play, UserCircle, LogOut, Check, ArrowUpCircle, XCircle } from 'lucide-react';

export type Player = {
  id: string;
  name: string;
  chips: number;
  current_bet: number;
  total_investment: number;
  is_active: boolean;
  has_acted: boolean;
  revives_used: number;
  hole_cards: string[];
};

export type ShowdownResult = {
  name: string;
  won: number;
  reason: string;
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
  const [hasWonGale, setHasWonGale] = useState<boolean>(false);
  const [victoryDismissed, setVictoryDismissed] = useState<boolean>(false);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    ws.current = new WebSocket(`wss://texaspoker.thiopheneche.dpdns.org/ws/${tableId}/${clientId}`);
    ws.current.onmessage = (event) => {
      try {
        const data: GameState = JSON.parse(event.data);
        setGameState(data);
      } catch (e) { console.error("Failed to parse", e); }
    };
    return () => ws.current?.close();
  }, [tableId, clientId]);

  useEffect(() => {
     if(gameState) setRaiseAmount(gameState.current_highest_bet + gameState.min_raise);
  }, [gameState?.current_highest_bet, gameState?.min_raise, gameState?.phase]);

  const handleAction = (action: string, amount: number = 0) => {
      ws.current?.send(JSON.stringify({ action, amount }));
  };

  const getCardColorClass = (card: string) => (card.includes('♥') || card.includes('♦')) ? 'red' : '';

  const me = gameState?.players.find(p => p.id === clientId);
  const currentTurnPlayer = gameState?.players[gameState.current_turn_index] || null;
  
  const isBankrupt = me && me.chips === 0 && (gameState?.phase === "WAITING" || gameState?.phase === "SHOWDOWN");

  useEffect(() => {
    if (isBankrupt && !isSpectating) {
        if (bankruptTimer === null) setBankruptTimer(60);
    } else {
        setBankruptTimer(null);
    }
  }, [isBankrupt, isSpectating]);

  useEffect(() => {
      if (bankruptTimer === null) return;
      if (bankruptTimer <= 0) {
          onLeave();
          return;
      }
      const interval = setInterval(() => {
          setBankruptTimer(prev => prev !== null ? prev - 1 : null);
      }, 1000);
      return () => clearInterval(interval);
  }, [bankruptTimer, onLeave]);

  // 终极赢家检测逻辑
  useEffect(() => {
    if (gameState && me) {
      const isPhaseSafe = gameState.phase === "WAITING" || gameState.phase === "SHOWDOWN";
      
      const allOthersBusted = gameState.players.length >= 2 && gameState.players.filter(p => p.id !== clientId).every(p => {
          return p.chips === 0 && p.revives_used >= 3 && (isPhaseSafe || !p.is_active);
      });

      if (allOthersBusted && !hasWonGale) {
         setHasWonGale(true);
      }
      
      if (hasWonGale) {
         const activeOpponents = gameState.players.filter(p => p.id !== clientId && p.chips > 0);
         if (activeOpponents.length > 0) {
             setHasWonGale(false);
             setVictoryDismissed(false);
         }
      }
    }
  }, [gameState, me, clientId, hasWonGale]);

  if (!gameState) {
    return <div className="flex-center"><h2>🌀 正在接入牌桌 #{tableId}...</h2></div>;
  }

  const isMyTurn = currentTurnPlayer?.id === clientId;
  const isWaitingOrShowdown = gameState.phase === "WAITING" || gameState.phase === "SHOWDOWN";
  
  const canCheck = me && (me.current_bet === gameState.current_highest_bet);
  const disableControls = !isMyTurn || isWaitingOrShowdown;

  const showSettlement = gameState.phase === "SHOWDOWN" && gameState.showdown_results && gameState.showdown_results.length > 0;

  // 加注辅助计算
  const minRaiseTotal = gameState.current_highest_bet + gameState.min_raise;
  const maxRaiseTotal = me ? me.chips + me.current_bet : 0;

  // 快捷预设按钮样式
  const presetBtnStyle: React.CSSProperties = {
    padding: '3px 8px', fontSize: '0.75rem', background: 'rgba(255,255,255,0.15)',
    color: '#ccc', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px',
    cursor: 'pointer', whiteSpace: 'nowrap'
  };

  return (
    <div className="poker-table-container">
      
      {/* 破产复活弹窗 */}
      {isBankrupt && !isSpectating && me && (
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
            <button onClick={onLeave} style={{ width: '100%', padding: '15px', background: 'transparent', border: '1px solid gray', color: 'gray', borderRadius: '10px', fontSize: '1rem', cursor: 'pointer'}}>
              逃离牌局并返回大厅
            </button>
          </div>
        </div>
      )}

      {/* 结算弹窗 */}
      {showSettlement && (!isBankrupt || isSpectating) && !hasWonGale && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#111', padding: '40px', borderRadius: '20px', border: '2px solid gold', textAlign: 'center', minWidth: '500px', boxShadow: '0 10px 40px rgba(255, 215, 0, 0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h1 style={{ color: 'gold', margin: '0 0 30px 0', fontSize: '2.5rem', textShadow: '0 2px 10px rgba(255, 215, 0, 0.3)' }}>🏆 巅峰决战 🏆</h1>
            
            {gameState.community_cards.length > 0 && (
              <div style={{ marginBottom: '30px', padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: '15px' }}>
                <h4 style={{ color: 'var(--text-muted)', margin: '0 0 15px 0', fontSize: '1.1rem' }}>🌍 公共牌面 🌍</h4>
                <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
                  {gameState.community_cards.map((card, idx) => (
                    <div key={idx} className={`card community ${getCardColorClass(card)}`} style={{ transform: 'none', width: '60px', height: '84px', fontSize: '1.5rem', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
                      {card}
                    </div>
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

            <div style={{ marginBottom: '30px', padding: '20px', background: 'rgba(0,0,0,0.4)', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.1)' }}>
               <h4 style={{ color: 'var(--text-muted)', margin: '0 0 20px 0', fontSize: '1.1rem' }}>🃏 最终拼杀底牌揭晓 🃏</h4>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                 {gameState.players.filter(p => p.is_active && p.hole_cards && p.hole_cards.length > 0).map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 30px' }}>
                       <span style={{ color: 'white', fontWeight: 'bold', fontSize: '1.3rem' }}>{p.name}</span>
                       <div style={{ display: 'flex', gap: '10px' }}>
                         {p.hole_cards.map((card, idx) => (
                           <span key={idx} style={{ background: 'white', border: '1px solid #ccc', borderRadius: '8px', padding: '8px 15px', fontSize: '1.5rem', color: getCardColorClass(card) === 'red' ? '#e53935' : '#333', fontWeight: 'bold', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
                             {card}
                           </span>
                         ))}
                       </div>
                    </div>
                 ))}
               </div>
            </div>

            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '10px' }}>
              {me && me.chips > 0 && (
                <button className="btn-start" style={{ padding: '15px 40px', fontSize: '1.2rem', letterSpacing: '2px', boxShadow: '0 5px 15px rgba(76, 175, 80, 0.4)' }} onClick={() => handleAction("start")}>
                  <Play size={20} /> 新的一局
                </button>
              )}
              <button onClick={onLeave} style={{ padding: '15px 40px', fontSize: '1.2rem', background: 'transparent', border: '1px solid gray', color: 'gray', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LogOut size={20} /> 返回大厅
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 终极大赢家 交互式弹窗 */}
      {hasWonGale && !victoryDismissed && me && me.chips > 0 && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,215,0,0.2)', backdropFilter: 'blur(5px)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
           <div style={{ background: 'linear-gradient(135deg, #2a2a2a, #111)', padding: '50px', borderRadius: '20px', border: '3px solid gold', textAlign: 'center', boxShadow: '0px 0px 50px rgba(255,215,0,0.4)', maxWidth: '500px' }}>
             <h1 style={{ fontSize: '3.5rem', color: 'gold', textShadow: '0px 0px 15px gold', margin: '0 0 20px 0' }}>
               👑 绝对征服 👑
             </h1>
             <p style={{ fontSize: '1.2rem', color: 'white', lineHeight: '1.6', marginBottom: '30px' }}>
               全桌对手已悉数破产！您的统治已经确立，当前筹码堆积如山：<br/>
               <span style={{ fontSize: '2rem', color: '#4caf50', fontWeight: 'bold', display: 'block', margin: '15px 0' }}>💰 {me.chips}</span>
             </p>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <button onClick={onLeave} style={{ padding: '15px', background: 'linear-gradient(to right, #e65c00, #F9D423)', color: 'white', border: 'none', borderRadius: '10px', fontSize: '1.2rem', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0px 5px 15px rgba(230, 92, 0, 0.4)'}}>
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
           <button onClick={onLeave} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--text-main)', padding: '10px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap:'5px' }}>
             <LogOut size={16} /> 退大厅
           </button>
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

      <main className="game-board" style={{ paddingBottom: '140px' }}>

        <div className="opponents">
          {gameState.players.map((p) => {
             if (p.id === clientId) return null;
             return (
               <div key={p.id} className="opponent-card" style={{opacity: p.is_active ? 1 : 0.4}}>
                 <UserCircle size={20} className="icon" />
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                   <span>{p.name} {p.chips === 0 && p.is_active && "(All-In)"}</span>
                   <span>💰 {p.chips} | 注: {p.current_bet}</span>
                   <span style={{fontSize: '0.8rem', color:'var(--text-muted)'}}>❤️ 剩余买入: {3 - p.revives_used}</span>
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
          <div className="cards-row">
            {gameState.community_cards.length > 0 
             ? gameState.community_cards.map((card, i) => <div key={i} className={`card community ${getCardColorClass(card)}`}>{card}</div>)
             : <div className="card empty">等待发牌...</div>}
          </div>
          <div className="phase-badge">当前阶段: {gameState.phase}</div>
        </section>

        {me && (
          <section className="my-area">
            <div className="my-info">
              <h3>我的底牌 ({me.name}) {isSpectating && " - 👁️观战中"}</h3>
              <p className="my-chips">筹码: 💰 {me.chips} | 本轮下注: 💰 {me.current_bet}</p>
               <span style={{fontSize: '0.8rem', color:'var(--text-muted)'}}>❤️ 剩余买入: {3 - me.revives_used}</span>
            </div>
            <div className="my-hole-cards">
               {me.hole_cards.length > 0 
                ? me.hole_cards.map((card, idx) => <div key={idx} className={`card private ${getCardColorClass(card)}`}>{card}</div>)
                : <div className="card private empty">暂无手牌</div>}
            </div>
            
            <div className="actions" style={{position: 'absolute', bottom: 0, left: 0, right: 0, padding: '15px 20px', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', zIndex: 10}}>
               {gameState.phase === "WAITING" ? (
                 <button 
                   className="btn-start" 
                   style={{padding: '12px 40px', fontSize: '1.2rem', opacity: (gameState.players.filter(p => p.chips > 0).length < 2 || isSpectating || me.chips === 0) ? 0.5 : 1}} 
                   onClick={() => handleAction("start")}
                   disabled={gameState.players.filter(p => p.chips > 0).length < 2 || isSpectating || me.chips === 0}
                 >
                   <Play size={20} /> {gameState.players.filter(p => p.chips > 0).length < 2 ? "等待筹码充足的玩家..." : "新的一局"}
                 </button>
               ) : (
                 <>
                   <button style={{background: 'var(--danger)', color: 'white', opacity: disableControls ? 0.3 : 1, cursor: disableControls ? 'not-allowed' : 'pointer'}} disabled={disableControls} onClick={() => handleAction("fold")}>
                     <XCircle size={18} /> 弃牌 
                   </button>
                   {canCheck ? (
                     <button style={{background: '#4caf50', color: 'white', opacity: disableControls ? 0.3 : 1, cursor: disableControls ? 'not-allowed' : 'pointer'}} disabled={disableControls} onClick={() => handleAction("check")}>
                       <Check size={18} /> 过牌 
                     </button>
                   ) : (
                     <button style={{background: '#2196f3', color: 'white', opacity: disableControls ? 0.3 : 1, cursor: disableControls ? 'not-allowed' : 'pointer'}} disabled={disableControls} onClick={() => handleAction("call")}>
                       <Coins size={18} /> 跟注 ({Math.min(gameState.current_highest_bet - me.current_bet, me.chips)})
                     </button>
                   )}
                   
                   {/* 增强版加注控制面板 */}
                   <div style={{display: 'flex', gap: '8px', alignItems: 'center', background: 'rgba(255,255,255,0.1)', padding: '8px 12px', borderRadius: '10px', opacity: disableControls ? 0.3 : 1, pointerEvents: disableControls ? 'none' : 'auto', flexWrap: 'wrap'}}>
                     {/* 快捷预设按钮 */}
                     <div style={{display: 'flex', gap: '4px', flexWrap: 'wrap'}}>
                       <button onClick={() => setRaiseAmount(minRaiseTotal)} style={presetBtnStyle}>最小</button>
                       <button onClick={() => setRaiseAmount(Math.min(gameState.current_highest_bet * 2, maxRaiseTotal))} style={presetBtnStyle}>2x</button>
                       <button onClick={() => setRaiseAmount(Math.min(gameState.current_highest_bet * 3, maxRaiseTotal))} style={presetBtnStyle}>3x</button>
                       <button onClick={() => setRaiseAmount(Math.min(Math.floor(gameState.pot / 2) + gameState.current_highest_bet, maxRaiseTotal))} style={presetBtnStyle}>½底池</button>
                       <button onClick={() => setRaiseAmount(Math.min(gameState.pot + gameState.current_highest_bet, maxRaiseTotal))} style={presetBtnStyle}>满底池</button>
                     </div>
                     {/* 滑块 */}
                     <input type="range" min={minRaiseTotal} max={maxRaiseTotal} value={Math.min(raiseAmount, maxRaiseTotal)} onChange={(e) => setRaiseAmount(Number(e.target.value))} style={{cursor:'pointer', flex: '1', minWidth: '80px'}} />
                     {/* 手动输入框 */}
                     <input 
                       type="number" 
                       min={minRaiseTotal} 
                       max={maxRaiseTotal} 
                       value={raiseAmount} 
                       onChange={(e) => { const v = Number(e.target.value); if (!isNaN(v)) setRaiseAmount(v); }} 
                       style={{width: '75px', padding: '5px 8px', background: 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '6px', fontSize: '0.95rem', textAlign: 'center', outline: 'none'}} 
                     />
                     {/* 加注确认 */}
                     <button className="btn-bet" onClick={() => handleAction("raise", raiseAmount - me.current_bet)} disabled={raiseAmount > maxRaiseTotal || raiseAmount < minRaiseTotal}>
                       <ArrowUpCircle size={18} /> 加注
                     </button>
                   </div>

                   <button style={{background: 'purple', color: 'white', opacity: disableControls ? 0.3 : 1, cursor: disableControls ? 'not-allowed' : 'pointer'}} disabled={disableControls} onClick={() => handleAction("all-in")}>
                     ALL-IN
                   </button>
                 </>
               )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};
