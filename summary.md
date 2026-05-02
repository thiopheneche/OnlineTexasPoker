# OnlineTexasPoker 项目总结文档

> **最后更新时间**: 2026-04-30  
> **部署地址**: https://texaspoker.thiopheneche.dpdns.org  
> **GitHub**: https://github.com/thiopheneche/OnlineTexasPoker (分支: `online-edition`)  
> **本文档用途**: 记录项目全部需求、代码结构、接口定义、部署流程和实现细节，方便与新 Agent 交付

---

## 协作约束（长期）

- 后续修改默认保持当前项目的代码结构、目录分层、命名习惯和实现风格不变，除非用户明确要求重构或调整风格。
- 后续对项目提出的新需求、新约束和新的协作要求，需要持续同步记录到 `summary.md` 中，作为长期上下文的一部分。
- 后续实现需求时，需要同时参考 `summary.md` 与代码现状，优先延续现有组织方式，避免无必要的结构性改动。
- 后续每次新增功能时，需要同步在 `README.md` 中体现，保证 README 与当前项目能力保持一致。
- 后续每次任何代码、文档、部署流程相关修改，都必须同步记录到 `summary.md` 的对应章节与“修改记录”中。
- 后续所有执行步骤（开发、验证、提交、推送、服务器更新）都必须优先遵循 `summary.md` 中记录的最新流程；若发现流程变化，应先更新 `summary.md` 再执行。

---

## 一、项目概述

一个在线多人德州扑克游戏，基于 FastAPI + React + WebSocket 实现。支持多牌桌、实时对战、聊天、全局筹码经济系统。

---

## 二、技术栈

| 层级 | 技术 | 版本/说明 |
|------|------|-----------|
| 后端 | Python / FastAPI | 通过 uvicorn 启动，运行在 VPS 上 |
| 实时通信 | WebSocket | WSS 协议（`wss://texaspoker.thiopheneche.dpdns.org`） |
| 前端 | React + TypeScript | Vite 构建，单页应用 |
| 样式 | 原生 CSS | 使用 CSS 变量 + viewport 相对单位 + clamp() 响应式 |
| 图标 | lucide-react | 按钮图标库 |
| 代理 | Cloudflare + Nginx | 二级域名反向代理 |
| 协议 | HTTPS / WSS | 全站加密 |

---

## 三、项目目录结构

```
AntigravityTest/
├── README.md                   # 项目说明（含部署链接）
├── implementation_plan.md      # 本次持久化账号与断线重连实现方案
├── summary.md                  # 本文件：全量总结文档
├── backend/
│   ├── main.py                 # FastAPI 主入口（HTTP API + WebSocket + 持久化/重连逻辑）
│   ├── requirements.txt        # Python 依赖（fastapi, uvicorn, pydantic）
│   ├── data/
│   │   └── users.json          # 本地账号与全局筹码持久化数据（运行时自动生成）
│   └── poker_logic/
│       ├── __init__.py
│       ├── card.py             # Card 类：花色(Suit) + 点数(Rank)
│       ├── deck.py             # Deck 类：洗牌、发牌
│       ├── evaluator.py        # 牌型评估器：判断牌型、比较大小
│       ├── game.py             # PokerEngine：游戏核心逻辑引擎
│       └── game_state.py       # Pydantic 数据模型：Player, GameState, GamePhase
└── frontend/
    ├── index.html              # HTML 入口（标题: TexasPoker，黑桃A favicon）
    ├── vite.config.ts          # Vite 配置
    └── src/
        ├── main.tsx            # React 入口
        ├── App.tsx             # 根组件（登录 / 路由 / 全局筹码状态）
        ├── App.css             # App 级别样式（登录页）
        ├── index.css           # 全局样式（响应式布局、牌桌主题）
        └── components/
            ├── Disclaimer.tsx # 反赌博免责声明模态框组件（可复用）
            ├── Lobby.tsx       # 大厅组件（牌桌列表 / 创建 / 在线人数 / 全局筹码）
            ├── PokerTable.tsx  # 牌桌组件（对局 / 操作 / 聊天 / 结算弹窗）
            └── Tutorial.tsx    # 教程模态框组件（网站引导 / 德州规则，可复用）
```

---

## 四、后端 API 接口一览

所有 HTTP 接口统一带 `/api` 前缀，方便 Nginx 反向代理。

### 4.1 HTTP 接口

| 方法 | 路径 | 功能 | 请求体 | 返回 |
|------|------|------|--------|------|
| POST | `/api/login` | 用户登录/恢复持久化账号 | `{username: string}` | `{success, error?, global_chips, reconnect_table_id?}` |
| GET | `/api/users` | 获取在线用户列表 | 无 | `{users: string[], count: number}` |
| GET | `/api/chips/{username}` | 查询全局筹码余额 | 无 | `{global_chips: number}` |
| GET | `/api/tables` | 获取所有牌桌列表 | 无 | `[{table_id, phase, player_count}]` |
| POST | `/api/tables` | 创建新牌桌（扣1筹码） | `{small_blind, big_blind, buy_in, username}` | `{success, table_id, global_chips}` |
| POST | `/api/tables/join/{table_id}` | 加入牌桌（扣1筹码） | `{username: string}` | `{success, error?, global_chips}` |

### 4.2 WebSocket 接口

| 路径 | 功能 | 说明 |
|------|------|------|
| `/ws/session/{username}` | 用户会话心跳 | 维持在线状态，断开时自动标记离线 |
| `/ws/{table_id}/{client_id}` | 游戏数据通道 | 双向：接收 GameState JSON / 发送 action JSON |

### 4.3 WebSocket 消息格式

**客户端 → 服务端（Action）：**
```json
{"action": "start|fold|check|call|raise|all-in|revive|chat|show_cards|hide_cards|run_once|run_twice|leave", "amount": 0, "message": ""}
```

**服务端 → 客户端（GameState 广播）：**
```json
{
  "table_id": "xxx",
  "phase": "WAITING|PREFLOP|FLOP|TURN|RIVER|SHOWDOWN",
  "pot": 0,
  "current_highest_bet": 0,
  "min_raise": 50,
  "showdown_results": [{"name": "", "won": 0, "reason": ""}],
  "community_cards": ["♠A", "♥K", ...],
  "players": [{
    "id": "", "name": "", "chips": 1000, "current_bet": 0,
    "total_investment": 0, "is_active": true, "is_online": true, "has_acted": false,
    "revives_used": 0, "hole_cards": ["♠A", "♥K"]
  }],
  "button_index": 0,
  "current_turn_index": 0
}
```

**服务端 → 客户端（聊天消息）：**
```json
{"type": "chat", "sender": "username", "message": "消息内容"}
```

---

## 五、核心游戏引擎（poker_logic/）

### 5.1 game_state.py - 数据模型

- **GamePhase**: `WAITING → PREFLOP → FLOP → TURN → RIVER → SHOWDOWN`
- **Player**: id, name, chips(默认买入金额，初始2000), current_bet, total_investment, is_active, has_acted, revives_used(最多3次), hole_cards
- **GameState**: table_id, phase, pot, current_highest_bet, small_blind(默认5), big_blind(默认10), buy_in(默认2000), min_raise, showdown_results, community_cards, players, button_index, current_turn_index

### 5.2 game.py - PokerEngine 引擎

核心静态方法：

| 方法 | 功能 |
|------|------|
| `process_action()` | 处理所有玩家动作（fold/check/call/raise/all-in/revive/start/show_cards/hide_cards） |
| `_start_new_hand()` | 开新一手牌：洗牌、发底牌、收盲注、设置button |
| `_execute_showdown()` | 结算：单人获胜(弃牌赢)或多人比牌 |
| `_advance_turn_or_phase()` | 推进回合：判断是否所有人已行动，决定进入下一阶段或结算 |
| `_fast_forward_to_showdown()` | 快速翻牌（所有人all-in后自动翻完公共牌） |
| `_next_phase()` | 切换到下一阶段并发公共牌 |
| `_find_next_active_player()` | 找到下一个需要行动的玩家 |

### 5.3 特殊机制

- **弃牌获胜亮牌选择**: 弃牌赢时，赢家底牌默认隐藏（`hole_cards`清空，原牌保存在`_saved_hole_cards`）。赢家可发送`show_cards`/`hide_cards`选择是否向全桌展示
- **复活系统**: 破产后可买入1000筹码复活，每人最多3次（`revives_used`）
- **未注资返还**: 当单人加注但无人跟到同等额度时，多出部分自动退回

### 5.4 evaluator.py - 牌型评估

返回 `(score, tie_breaker, hand_name)` 三元组：
- score: 牌型等级（高牌0 → 皇家同花顺9）
- tie_breaker: 同牌型时的排序元组
- hand_name: 中文牌型名称（如"一对"、"同花顺"等）

---

## 六、前端组件结构

### 6.1 App.tsx - 根组件

**状态管理**：
- `username`: 当前登录用户名
- `currentTableId`: 当前所在牌桌ID（null = 在大厅）
- `globalChips`: 全局筹码余额

**核心行为**：
- 登录后建立 `/ws/session/{username}` 常驻心跳 WebSocket
- 页面刷新或重新打开网站后不再自动读取 `localStorage` 静默登录；只有用户手动输入 ID 登录后才进入大厅
- 登录成功后仍会保留最近一次用户名到 `localStorage`，并在进入牌桌时记录最近牌桌 ID 供手动续回使用
- 每次从牌桌返回大厅时自动调用 `/api/chips/{username}` 刷新筹码
- 根据 `currentTableId` 切换渲染 `<Lobby>` 或 `<PokerTable>`
- 登录页提供网站使用教程入口

### 6.2 Lobby.tsx - 大厅组件

**功能**：
- 显示全局筹码余额（金色徽章）
- 牌桌列表（每5秒刷新）+ 创建牌桌 + 加入牌桌
- 建桌时可自定义小盲/大盲与买入金额（默认 5/10、2000）
- 筹码不足时按钮禁用并显示错误提示
- 在线玩家人数和ID列表（每5秒刷新）
- 全局筹码经济规则说明
- 如果本地保留了上次断线牌桌 ID 且该牌桌仍存在，则提供“继续刚才的牌桌”入口
- 若本地缓存的牌桌已失效，则自动清理该缓存，避免大厅卡死或错误跳转
- 首页提供网站新手教程入口

**Props**: `onJoinTable`, `username`, `globalChips`, `setGlobalChips`

### 6.3 PokerTable.tsx - 牌桌组件

**功能区块**：

| 区域 | 内容 |
|------|------|
| Header | 牌桌ID + 退出按钮 + 当前轮次指示器 |
| 对手区 | 对手信息卡片（筹码/下注/状态/底牌展示，掉线时显示 `[🔴 掉线中]` 并置灰） |
| 公共区 | 底池 + 公共牌 + 当前阶段 |
| Row 1 | 玩家底牌（默认盖牌，点击"看牌"亮3秒） |
| Row 2 | 筹码余额 + 本轮下注 + 剩余买入次数 + 等待区准备状态 |
| Row 3 | 等待阶段显示准备/取消准备/开始发牌；对局阶段显示弃牌 + 过牌/跟注 |
| Row 4 | 预设加注(最小/2x/3x/½底池/满底池) + 手动输入 + 加注确认 + ALL-IN |
| 聊天 | 右下角浮动按钮 + 滑出聊天面板（未读计数/Enter发送/100条缓存） |

**弹窗**：
- 破产弹窗（60秒倒计时 + 复活/观战/离桌选项）
- 结算弹窗（赢家信息 + 底牌揭晓 + 弃牌赢时的亮牌/藏牌按钮）
- 终极赢家弹窗（全桌淘汰后的特殊金色弹窗）

**看牌功能**: 底牌默认显示为红黑简约牌背，点击"👀 看牌"按钮亮牌3秒后自动翻回

### 6.4 Tutorial.tsx - 教程组件

**功能**：
- 提供两类教程：网站新手教程、德州扑克主要规则
- 支持 `banner` / `link` / `button` 三种触发样式
- 当前挂载位置：登录页、大厅页、牌桌页

---

## 七、全局筹码经济系统

| 事件 | 筹码变动 |
|------|---------|
| 首次登录 | +5 全局筹码 |
| 创建牌桌 | -1 全局筹码 |
| 加入牌桌 | -1 全局筹码 |
| 离开牌桌 | +floor(手中筹码 / 1000) 全局筹码 |
| 商城购买 | 预留接口（尚未实现） |

**存储方式**: 后端本地文件 `backend/data/users.json` + 运行时内存缓存 `user_accounts: Dict[str, {global_chips, last_login_at}]`

**附加机制**:
- 登录 ID 会自动创建或读取本地持久化账号
- 全局筹码在服务重启后仍可恢复
- 每个账号都会记录最近登录时间；超过 24 小时未登录且当前不在线时自动注销
- 断线 60 秒内支持原桌原状态重连，但是否回桌改为由大厅中的手动入口触发

---

## 八、响应式布局方案

- `html, body` 设置 `height: 100%` + `overflow: hidden`
- 容器 `.poker-table-container` 锁定 `height: 98vh`
- 所有 `font-size` 使用 `clamp(min, preferred, max)`
- 所有 `padding` 使用 `vh/vw` 单位
- 扑克牌大小: `clamp(45px, 7vw, 90px)` × `clamp(65px, 10vw, 130px)`
- `@media (max-height: 700px)` - 矮屏适配
- `@media (max-width: 600px)` - 手机窄屏适配

---

## 九、部署配置

- **域名**: `texaspoker.thiopheneche.dpdns.org`（二级域名，通过 Cloudflare DNS 解析）
- **前端**: Vite 构建，通过 Nginx 托管静态文件
- **后端**: uvicorn 运行在 VPS 上，Nginx 反向代理 `/api` 和 `/ws` 路径
- **协议**: 全站 HTTPS + WSS
- **GitHub**: `https://github.com/thiopheneche/OnlineTexasPoker`，分支 `online-edition`
- **VPS**: `23.128.228.89`，SSH 用户 `root`
- **服务器项目目录**: `/root/OnlineTexasPoker`
- **前端静态目录**: `/var/www/texas_poker`
- **后端服务名**: `texas-poker`

### 部署流程（用户审核通过后执行）

1. **本地提交并推送到 GitHub**
   ```bash
   git add .
   git commit -m "描述信息"
   git push origin online-edition
   ```
2. **SSH 登录 root 用户服务器并进入项目目录**
   ```bash
   ssh root@23.128.228.89
   cd /root/OnlineTexasPoker
   git pull origin online-edition
   ```
3. **重启后端服务加载新逻辑**
   ```bash
   systemctl restart texas-poker
   ```
4. **进入前端目录，重新安装依赖并打包静态文件**
   ```bash
   cd /root/OnlineTexasPoker/frontend
   npm install
   npm run build
   ```
5. **将前端构建产物覆盖到 Nginx 托管目录**
   ```bash
   cp -r dist/* /var/www/texas_poker/
   ```
6. **重启 Nginx 使静态资源与路由代理生效**
   ```bash
   systemctl restart nginx
   ```

> ⚠️ **重要约定**：每次修改经用户审核通过后，Agent 需按以上完整部署流水线执行；除非用户明确说明，否则默认服务器端项目路径为 `/root/OnlineTexasPoker`，后端服务名为 `texas-poker`，前端静态目录为 `/var/www/texas_poker/`。

---

## 十、牌桌生命周期

1. 用户通过 `/api/tables` POST 创建牌桌（扣1全局筹码）
2. 其他用户通过 `/api/tables/join/{table_id}` POST 加入（扣1全局筹码）
3. 所有用户通过 `/ws/{table_id}/{client_id}` 建立 WebSocket 连接
4. 新玩家自动添加到 `players` 列表（初始筹码1000）
5. 游戏中：通过 WebSocket 发送 action，引擎处理后广播新 GameState
6. 用户意外断线时：保留座位并标记 `is_online = false`，启动 60 秒重连保护
7. 用户在 60 秒内重连时：恢复 `is_online = true`，保留原手牌、原筹码、原座位继续游戏
8. 超时未重连或主动离桌时：结算全局筹码收益并移出牌桌
9. 只有用户显式点击离桌按钮时前端才会发送 `leave`；页面刷新/关闭仅关闭 WS 连接，不主动离桌
10. 最后一人离桌时：自动销毁牌桌（删除 `tables`、`decks`、`active_connections` 中的条目）
11. 聊天消息零持久化，仅实时转发，牌桌销毁后全部消失

---

## 十一、用户历史需求清单

以下是用户在开发过程中按时间顺序提出的所有需求：

### 基础功能
1. ✅ 将项目部署到二级域名 `texaspokers.thiopheneche.dpdns.org`
2. ✅ 修正域名拼写：`texaspokers` → `texaspoker`
3. ✅ 所有 HTTP 接口统一加 `/api` 前缀（方便 Nginx 反向代理）

### 牌桌管理
4. ✅ 当牌桌上所有人都回到大厅，则自动注销当前牌桌
5. ✅ 修改界面 UI，保证 Web 端所有按键在默认比例下正常展示
6. ✅ 默认小盲/大盲调整为 5/10，并支持建桌时自定义买入金额（默认 2000）

### 网站身份
6. ✅ 更新 README 的使用说明栏为网站超链接
7. ✅ 浏览器标签标题改为 "TexasPoker"，图标换成黑桃A SVG

### 导航功能
8. ✅ 增加随时退出到大厅的按钮（任何时间段都可交互）

### 社交功能
9. ✅ 大厅可看到当前在线玩家人数和 ID
10. ✅ 牌桌内聊天功能（浮动聊天窗口 + 实时消息广播）
11. ✅ 聊天框生命周期与牌桌绑定，牌桌销毁时聊天一并清除

### 经济系统
12. ✅ 全局筹码系统（初始5枚，进桌/建桌扣1枚，离桌按 floor(chips/1000) 奖励）
13. ✅ 全局筹码本地持久化（保存到 `backend/data/users.json`，服务重启后恢复）
14. ⬜ 商城系统（预留接口，未实现）

### 掉线保护与自动登录

15. ✅ 断线 60 秒内保留牌桌座位与游戏状态，支持同 ID 重连恢复
16. ✅ 前端 `localStorage` 自动登录与自动回桌
17. ✅ 大厅退出登录按钮与牌桌主动 `leave` 离桌指令
18. ✅ 牌桌内展示其他玩家掉线中状态

### 登录与回桌逻辑调整
19. ✅ 移除页面启动时基于浏览器缓存的自动登录；改为仅在用户手动输入 ID 登录后进入大厅
20. ✅ 大厅仅在本地缓存牌桌仍存在时提供“继续刚才的牌桌”入口；缓存牌桌失效时自动清理，避免卡死
21. ✅ 牌桌等待阶段增加准备机制，只有所有有筹码的玩家都已准备后才允许开始新一局
22. ✅ 结算后改为先回到等待/准备状态，再由玩家准备开始下一局，避免直接开局卡住

### 账号生命周期
23. ✅ 记录每个账号最近登录时间；超过 24 小时未登录且当前不在线时自动注销账号
24. ✅ 按用户要求清空服务器现有已注册账号数据
25. ✅ 修复账号生命周期上线后导致后端无法启动的两处线上兼容/初始化问题：`active_users` 定义顺序错误，以及 Python 3.9 不支持 `| None` 类型注解

### 加注优化
19. ✅ 加注增加自定义金额输入框（放在滑块旁边）
20. ✅ 增加快捷预设按钮（最小/2x/3x/½底池/满底池）
21. ✅ 移除滑块，只保留预设和自定义输入


### 响应式适配
17. ✅ 手机端无法查看底部按钮的问题修复
18. ✅ 全部内容固定在一屏内，根据浏览器窗口大小自动调整

### UI 布局重构
19. ✅ 底部操作区改为四排布局（底牌 / 筹码信息 / 弃牌跟注 / 加注ALL-IN）

### 看牌功能
20. ✅ 底牌默认盖住，点击"看牌"按钮亮出3秒后自动翻回

### 弃牌获胜亮牌
21. ✅ 全桌弃牌后赢家可选择展示或隐藏底牌

### 法律合规
22. ✅ 在登录页和大厅首页增加反赌博声明及免责声明（点击展开弹窗）

### 发两次功能
23. ✅ All-In时第一个All-In的玩家可选择发牌1次或2次，发两次时底池对半分别结算

### 协作方式
24. ✅ 后续所有修改需保持现有代码结构和风格不变；后续新增的用户要求与协作约束需持续记录到 `summary.md`

### 发两次显示与规则修正
25. ✅ 修正 All-In 后发两次的公共牌逻辑：翻前发两次应生成两排各 5 张公共牌；翻牌后只对剩余的转牌/河牌发两次；转牌后只对河牌发两次；河牌后 All-In 不再弹出发牌次数选择

### 发牌动画
26. ✅ 公共牌改为逐张翻牌动画：每新增一张牌单独翻出，发牌间隔统一为 2 秒；双跑时先完整发完第一排，再开始发第二排

### 发牌动画微调与教程文档
27. ✅ All-In 后的翻牌改为三张公共牌同时发出；同时在登录页、大厅页和游戏内新增教程文档，其中登录页/大厅页介绍网站使用方式，游戏内介绍德州扑克主要规则

### 手牌牌背样式优化
28. ✅ 将默认盖牌由旧的蓝色简易样式改为红黑简约牌背，要求牌背整张铺满显示区域，前端展示时不出现空隙或露底

### 文档同步约束
29. ✅ 后续每次新增功能时，都需要同步更新 `README.md`

### Bug修复
30. ✅ 修复2人桌大小盲注不轮换的问题（button_index改为基于state.players而非actual_players循环）

---

## 十二、已知限制和待办

### 已知限制
- 当前没有密码体系，用户名仍是轻量身份标识
- 账号与全局筹码持久化使用本地 `users.json`，尚未升级为数据库方案
- 聊天无历史记录功能

### 待办功能
- [ ] 商城系统（用全局筹码购买装扮）
- [ ] 用户认证体系（注册/登录/密码）
- [ ] 游戏历史记录/统计
- [ ] 更多牌桌配置选项（人数上限等）

---

## 修改记录

| 日期 | 修改内容 | 涉及文件 |
|------|---------|----------|
| 2026-03-22 | 項目初始部署和域名配置 | 全部 |
| 2026-03-22 | API 统一 `/api` 前缀 | `main.py`, `App.tsx`, `Lobby.tsx`, `PokerTable.tsx` |
| 2026-03-22 | 牌桌自动注销 + UI 修复 | `main.py`, `PokerTable.tsx` |
| 2026-03-22 | README 更新 + 网站标题/图标 | `README.md`, `index.html`, `favicon.svg` |
| 2026-03-22 | 退出大厅按钮 | `PokerTable.tsx` |
| 2026-03-22 | 在线玩家展示 | `main.py`, `Lobby.tsx` |
| 2026-03-22 | 全局筹码经济系统 | `main.py`, `App.tsx`, `Lobby.tsx` |
| 2026-03-22 | 加注优化（预设+自定义+移除滑块） | `PokerTable.tsx` |
| 2026-03-22 | 聊天功能 | `main.py`, `PokerTable.tsx` |
| 2026-03-22 | 聊天生命周期绑定牌桌 | `main.py` |
| 2026-03-22 | 响应式布局重构 | `index.css`, `PokerTable.tsx` |
| 2026-03-22 | 底部四排布局 | `PokerTable.tsx` |
| 2026-03-22 | 看牌功能（盖牌+3秒亮牌） | `PokerTable.tsx` |
| 2026-03-22 | 弃牌获胜亮牌/藏牌 | `game.py`, `PokerTable.tsx` |
| 2026-03-23 | 创建本总结文档 | `summary.md` |
| 2026-03-23 | 反赌博免责声明组件 | `Disclaimer.tsx`, `App.tsx`, `Lobby.tsx` |
| 2026-03-23 | 发两次(Run it Twice)功能 | `game_state.py`, `game.py`, `PokerTable.tsx` |
| 2026-03-23 | 增加长期协作约束：保持原有结构/风格，并持续记录用户要求到 `summary.md` | `summary.md` |
| 2026-03-23 | 修正发两次公共牌规则与牌桌双排展示 | `game.py`, `PokerTable.tsx`, `summary.md` |
| 2026-03-23 | 增加逐张翻牌动画，并将双跑改为第一排发完后再发第二排 | `game.py`, `PokerTable.tsx`, `index.css`, `summary.md` |
| 2026-03-23 | 调整 All-In 翻牌动画为 flop 三张同时发出，并新增网站教程/德州规则教程入口 | `game.py`, `App.tsx`, `Lobby.tsx`, `PokerTable.tsx`, `Tutorial.tsx`, `summary.md` |
| 2026-03-23 | 优化默认手牌盖牌为红黑简约牌背，并确保牌背整张铺满无空隙 | `PokerTable.tsx`, `index.css`, `summary.md` |
| 2026-03-23 | 重写 README 排版，将站点入口链接置顶，并补全当前已实现功能说明 | `README.md`, `summary.md` |
| 2026-04-29 | 修复2人桌大小盲注不轮换bug | `game.py`, `summary.md` |
| 2026-04-30 | 修正前端离桌触发时机：仅显式点击离桌按钮才发送 `leave`，刷新/关闭页面走掉线保护 | `frontend/src/components/PokerTable.tsx`, `README.md`, `summary.md` |
| 2026-04-30 | 移除自动静默登录，修复失效牌桌缓存卡死，并增加等待阶段准备机制 | `frontend/src/App.tsx`, `frontend/src/components/Lobby.tsx`, `frontend/src/components/PokerTable.tsx`, `backend/poker_logic/game.py`, `backend/poker_logic/game_state.py`, `README.md`, `summary.md` |
| 2026-04-30 | 修复结算后新一局准备流程卡住问题 | `backend/poker_logic/game.py`, `frontend/src/components/PokerTable.tsx` |
| 2026-04-30 | 增加账号24小时生命周期与最近登录时间记录，并按要求清空服务器用户数据 | `backend/main.py`, `README.md`, `summary.md` |
| 2026-04-30 | 修复账号生命周期上线后导致后端无法启动的线上故障：调整 `active_users` 初始化顺序，并将 `| None` 类型注解改为 Python 3.9 兼容写法 | `backend/main.py`, `summary.md` |
| 2026-04-30 | 调整默认盲注为 5/10，并支持建桌时自定义买入金额（默认 2000） | `backend/main.py`, `backend/poker_logic/game.py`, `backend/poker_logic/game_state.py`, `frontend/src/components/Lobby.tsx`, `frontend/src/components/PokerTable.tsx`, `README.md`, `summary.md` |
| 2026-04-30 | 补充并修正服务器部署信息：项目路径 `/root/OnlineTexasPoker`、服务 `texas-poker`、静态目录 `/var/www/texas_poker/` 与完整部署流程 | `summary.md` |
| 2026-05-02 | 修复手机端浏览器底部截断的 UI 布局问题，将 `100vh` 优化为 `100dvh` (包含兼容回退方案) | `frontend/src/index.css`, `summary.md` |
