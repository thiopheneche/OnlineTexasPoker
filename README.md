# 在线德州扑克

这是一个基于 FastAPI (Python Backend) 和 React + Vite + TypeScript (Frontend) 开发的全栈在线德州扑克项目。游戏状态将通过 WebSockets 实时同步。

## 目录结构
- `backend/`: 包含 FastAPI 服务器、WebSocket 通信路由以及扑克核心逻辑。
- `frontend/`: 包含使用 Vite 搭建的 React 客户端界面。

## 启动指南

### 1. 运行后端 (Backend)
进入 `backend/` 目录，安装依赖并启动服务：
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
API 文档将在 `http://localhost:8000/docs` 提供。WebSocket 位于 `ws://localhost:8000/ws/{client_id}`。

### 2. 运行前端 (Frontend)
打开一个新的终端，进入 `frontend/` 目录，安装依赖并启动开发服务器：
```bash
cd frontend
npm install
npm run dev
```
