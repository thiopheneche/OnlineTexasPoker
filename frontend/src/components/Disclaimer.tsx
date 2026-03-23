import React, { useState } from 'react';

type Props = {
  trigger: 'banner' | 'link';
};

const DISCLAIMER_CONTENT = `
## ⚠️ 反赌博声明及免责声明

### 一、网站性质声明

本网站（TexasPoker）是一个**纯技术研究与休闲娱乐平台**，所有筹码、积分均为虚拟道具，**不具备任何真实货币价值，不可兑换、转让或变现**。本网站不提供任何形式的充值、提现、兑换功能，也不存在任何真实资金流转渠道。

### 二、严禁赌博声明

根据《中华人民共和国刑法》第三百零三条之规定，**以营利为目的，聚众赌博或者以赌博为业的，构成赌博罪；开设赌场的，构成开设赌场罪。**

**本平台严正声明并严禁以下行为：**

1. **严禁利用本平台进行任何形式的赌博活动**，包括但不限于：以本平台作为"虚拟牌桌"在线下通过微信、支付宝或其他渠道进行真实资金结算。
2. **严禁任何形式的虚拟筹码/积分买卖和双向兑换行为**（即"银商"活动）。
3. **严禁通过本平台的聊天功能发布涉赌信息**，包括但不限于：组织赌局、发布收款二维码、发布"上分""下分"等涉赌暗语。
4. **严禁以任何形式组织、介绍他人通过本平台参与赌博活动**。

### 三、违规后果

**一经发现上述任何违规行为，本平台将：**

- 立即永久封禁相关账号
- 保留并向公安机关移交所有相关证据和数据
- 积极配合司法机关的调查取证工作

### 四、用户责任

用户使用本平台即表示知悉并同意以下内容：

1. 用户应自行确保其行为符合所在地区的法律法规。
2. 用户不得利用本平台从事任何违法违规活动。
3. 因用户自身违法违规行为导致的一切法律后果，由用户自行承担，与本平台无关。
4. 本平台为开源技术项目，仅供学习和娱乐，不承担因使用本平台产生的任何直接或间接损失。

### 五、特别提示

- 本平台的虚拟筹码仅供游戏体验使用，**没有任何现实价值**。
- 本平台不设长期排行榜、不提供战绩导出，不开发俱乐部/房卡等功能。
- 赌博害人害己，如您或身边的人深陷赌博困境，请拨打 **全国戒赌热线** 或联系当地公安机关寻求帮助。

### 六、法律声明

本声明的解释权归本平台运营者所有。本平台保留在法律允许范围内修改本声明的权利。本分析基于中国大陆法律常识，不能替代专业律师的法律意见。

---

> 🚨 **如您不同意上述条款，请立即关闭本网站。继续使用本平台即视为已阅读、理解并同意本声明的全部内容。**
`.trim();

export const DisclaimerModal: React.FC<Props> = ({ trigger }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      {trigger === 'banner' ? (
        <div
          onClick={() => setOpen(true)}
          style={{
            background: 'linear-gradient(90deg, rgba(207,102,121,0.15), rgba(207,102,121,0.05))',
            border: '1px solid rgba(207,102,121,0.3)',
            borderRadius: '10px',
            padding: '10px 18px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            transition: 'all 0.2s',
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>⚖️</span>
          <span style={{ color: 'var(--danger, #cf6679)', fontSize: 'clamp(0.7rem, 1.2vw, 0.9rem)', fontWeight: 600 }}>
            反赌博声明及免责声明
          </span>
          <span style={{ color: 'var(--text-muted, #a0a0a0)', fontSize: 'clamp(0.6rem, 1vw, 0.75rem)' }}>
            (点击查看)
          </span>
        </div>
      ) : (
        <span
          onClick={() => setOpen(true)}
          style={{
            color: 'var(--danger, #cf6679)',
            cursor: 'pointer',
            textDecoration: 'underline',
            fontSize: '0.85rem',
          }}
        >
          ⚖️ 反赌博声明及免责声明
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
              border: '2px solid var(--danger, #cf6679)',
              maxWidth: '700px',
              width: '100%',
              maxHeight: '85vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(207,102,121,0.3)',
            }}
          >
            {/* 头部 */}
            <div style={{
              padding: '20px 25px',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0,
            }}>
              <h2 style={{ margin: 0, color: 'var(--danger, #cf6679)', fontSize: '1.3rem' }}>⚖️ 反赌博声明及免责声明</h2>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white',
                  width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer',
                  fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >✕</button>
            </div>
            {/* 内容 */}
            <div style={{
              padding: '25px',
              overflowY: 'auto',
              color: '#ddd',
              fontSize: '0.9rem',
              lineHeight: '1.8',
              flex: 1,
            }}>
              {DISCLAIMER_CONTENT.split('\n').map((line, idx) => {
                if (line.startsWith('## ')) return <h2 key={idx} style={{ color: 'var(--danger, #cf6679)', fontSize: '1.2rem', margin: '10px 0' }}>{line.replace('## ', '').replace('⚠️ ', '')}</h2>;
                if (line.startsWith('### ')) return <h3 key={idx} style={{ color: 'var(--accent, #03dac6)', fontSize: '1rem', margin: '18px 0 8px 0', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px' }}>{line.replace('### ', '')}</h3>;
                if (line.startsWith('> ')) return <div key={idx} style={{ background: 'rgba(207,102,121,0.15)', border: '1px solid rgba(207,102,121,0.3)', borderRadius: '8px', padding: '12px 16px', margin: '10px 0', fontWeight: 'bold', color: 'var(--danger, #cf6679)' }}>{line.replace('> ', '').replace('🚨 ', '🚨 ')}</div>;
                if (line.startsWith('---')) return <hr key={idx} style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '15px 0' }} />;
                if (line.startsWith('- ')) return <div key={idx} style={{ paddingLeft: '15px', margin: '4px 0' }}>• {line.replace('- ', '').replace(/\*\*(.*?)\*\*/g, '$1')}</div>;
                if (/^\d+\. /.test(line)) return <div key={idx} style={{ paddingLeft: '10px', margin: '4px 0' }}>{line.replace(/\*\*(.*?)\*\*/g, '$1')}</div>;
                if (line.trim() === '') return <div key={idx} style={{ height: '6px' }} />;
                return <p key={idx} style={{ margin: '4px 0' }}>{line.replace(/\*\*(.*?)\*\*/g, '$1')}</p>;
              })}
            </div>
            {/* 底部 */}
            <div style={{
              padding: '15px 25px',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              textAlign: 'center',
              flexShrink: 0,
            }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  padding: '10px 40px', background: 'var(--danger, #cf6679)', color: 'white',
                  border: 'none', borderRadius: '10px', fontSize: '1rem', cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                我已阅读并知悉
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
