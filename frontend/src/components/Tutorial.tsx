import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';

type TutorialVariant = 'site' | 'rules';
type TriggerVariant = 'banner' | 'link' | 'button';

type Props = {
  variant: TutorialVariant;
  trigger: TriggerVariant;
};

const TUTORIAL_CONTENT: Record<TutorialVariant, string> = {
  site: `
## 新手教程

### 一、如何进入网站

1. 在登录页输入一个唯一的游戏 ID。
2. 点击“进入大厅”后即可进入首页。
3. 同一时间一个 ID 只能被一个在线会话占用。

### 二、如何使用大厅

- 大厅会显示全局筹码、在线玩家和当前牌桌列表。
- 创建牌桌会消耗 1 点全局筹码。
- 加入已有牌桌同样会消耗 1 点全局筹码。
- 盲注可以在创建牌桌时手动设置。

### 三、进入牌桌后怎么操作

- 牌桌里可以开始新的一局、弃牌、过牌、跟注、加注或 ALL-IN。
- 你的底牌默认盖住，点击“看牌”后会保持显示，再点击“盖牌”即可随时盖回。
- 右下角聊天按钮可以打开当前牌桌聊天面板。

### 四、离桌与筹码

- 你可以随时返回大厅。
- 离桌时会按 floor(当前手中筹码 / 1000) 返还全局筹码。
- 如果破产，可以按提示选择复活、观战或离桌。

### 五、额外提示

- 聊天消息只在当前牌桌内实时转发，不会长期保存。
- All-In 后如果公共牌还没发完，系统可能会进入自动补牌或发两次流程。
`.trim(),
  rules: `
## 德州扑克主要规则

### 一、游戏目标

- 每位玩家有 2 张底牌。
- 牌桌上最多会发出 5 张公共牌。
- 你需要用“2 张底牌 + 5 张公共牌”组合出最强的 5 张牌。

### 二、一局的基本流程

1. PREFLOP：只看底牌行动。
2. FLOP：发出前三张公共牌。
3. TURN：发出第四张公共牌。
4. RIVER：发出第五张公共牌。
5. SHOWDOWN：剩余玩家比牌结算。

### 三、常见操作

- Fold：弃牌，直接退出当前底池争夺。
- Check：不加注，选择过牌。
- Call：跟到当前最高下注。
- Raise：在当前最高下注基础上继续加注。
- All-In：把当前剩余筹码全部压上。

### 四、什么时候赢

- 如果其他人都弃牌，最后留下的玩家直接赢得底池。
- 如果有多名玩家进入摊牌，就比较各自最佳五张牌大小。

### 五、牌型从高到低

1. 皇家同花顺
2. 同花顺
3. 四条
4. 葫芦
5. 同花
6. 顺子
7. 三条
8. 两对
9. 一对
10. 高牌

### 六、发两次说明

- 当玩家 All-In 且公共牌还没有发完时，可能会出现发一次或发两次的选择。
- 如果选择发两次，系统会跑两排公共牌，并把底池分成两半分别结算。
`.trim(),
};

const TITLE_MAP: Record<TutorialVariant, string> = {
  site: '网站新手教程',
  rules: '德州扑克规则',
};

export const TutorialModal: React.FC<Props> = ({ variant, trigger }) => {
  const [open, setOpen] = useState(false);
  const title = TITLE_MAP[variant];
  const content = TUTORIAL_CONTENT[variant];

  return (
    <>
      {trigger === 'banner' ? (
        <div
          onClick={() => setOpen(true)}
          style={{
            background: 'linear-gradient(90deg, rgba(3,218,198,0.16), rgba(3,218,198,0.06))',
            border: '1px solid rgba(3,218,198,0.3)',
            borderRadius: '10px',
            padding: '10px 18px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            transition: 'all 0.2s',
          }}
        >
          <BookOpen size={18} style={{ color: 'var(--accent, #03dac6)' }} />
          <span style={{ color: 'var(--accent, #03dac6)', fontSize: 'clamp(0.7rem, 1.2vw, 0.9rem)', fontWeight: 600 }}>
            {title}
          </span>
          <span style={{ color: 'var(--text-muted, #a0a0a0)', fontSize: 'clamp(0.6rem, 1vw, 0.75rem)' }}>
            (点击查看)
          </span>
        </div>
      ) : trigger === 'button' ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            background: 'rgba(3,218,198,0.12)',
            border: '1px solid rgba(3,218,198,0.3)',
            color: 'var(--accent, #03dac6)',
            padding: '10px 14px',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.9rem',
            fontWeight: 600,
          }}
        >
          <BookOpen size={16} />
          教程
        </button>
      ) : (
        <span
          onClick={() => setOpen(true)}
          style={{
            color: 'var(--accent, #03dac6)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          <BookOpen size={14} /> {variant === 'rules' ? '玩法规则' : '新手教程'}
        </span>
      )}

      {open && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.9)', zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1a1a1a',
              borderRadius: '16px',
              border: '2px solid var(--accent, #03dac6)',
              maxWidth: '760px',
              width: '100%',
              maxHeight: '85vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(3,218,198,0.2)',
            }}
          >
            <div style={{
              padding: '20px 25px',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0,
            }}>
              <h2 style={{ margin: 0, color: 'var(--accent, #03dac6)', fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <BookOpen size={20} />
                {title}
              </h2>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white',
                  width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer',
                  fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >×</button>
            </div>
            <div style={{
              padding: '25px',
              overflowY: 'auto',
              color: '#ddd',
              fontSize: '0.9rem',
              lineHeight: '1.8',
              flex: 1,
            }}>
              {content.split('\n').map((line, idx) => {
                if (line.startsWith('## ')) return <h2 key={idx} style={{ color: 'var(--accent, #03dac6)', fontSize: '1.2rem', margin: '10px 0' }}>{line.replace('## ', '')}</h2>;
                if (line.startsWith('### ')) return <h3 key={idx} style={{ color: 'white', fontSize: '1rem', margin: '18px 0 8px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px' }}>{line.replace('### ', '')}</h3>;
                if (line.startsWith('- ')) return <div key={idx} style={{ paddingLeft: '15px', margin: '4px 0' }}>• {line.replace('- ', '')}</div>;
                if (/^\d+\. /.test(line)) return <div key={idx} style={{ paddingLeft: '10px', margin: '4px 0' }}>{line}</div>;
                if (line.trim() === '') return <div key={idx} style={{ height: '6px' }} />;
                return <p key={idx} style={{ margin: '4px 0' }}>{line}</p>;
              })}
            </div>
            <div style={{
              padding: '15px 25px',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              textAlign: 'center',
              flexShrink: 0,
            }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  padding: '10px 40px', background: 'var(--accent, #03dac6)', color: '#000',
                  border: 'none', borderRadius: '10px', fontSize: '1rem', cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
