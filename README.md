# FPS Arena - 2P 网页枪战游戏

一个基于 Web 的双人对战 FPS 游戏，使用 Three.js 进行 3D 渲染，Socket.io 实现实时通信。

## 技术栈

- **前端**: Three.js (3D渲染), 原生 JavaScript
- **后端**: Node.js, Express, Socket.io
- **通信**: WebSocket 实时同步

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动服务器

```bash
npm start
# 或
node server/index.js
```

### 3. 开始游戏

1. 打开浏览器访问 `http://localhost:3000`
2. 输入你的名字
3. 创建新房间或输入房间号加入
4. 等待另一位玩家加入

## 游戏操作

| 按键 | 功能 |
|------|------|
| W/A/S/D | 移动 |
| 鼠标 | 瞄准 |
| 左键 | 射击 |
| 1 | 切换到手枪 |
| 2 | 切换到冲锋枪 |
| R | 换弹 |
| G | 投掷手雷 |
| V | 切换第一/第三人称 |
| Shift | 冲刺 |
| C | 蹲下 |
| Space | 跳跃 |

## 游戏规则

- 击杀数先达到 10 的玩家获胜
- 死亡后 3 秒自动复活
- 复活后 3 秒无敌时间
- 手雷造成范围伤害

## 项目结构

```
fps-game/
├── server/
│   ├── index.js        # Express + Socket.io 服务器入口
│   ├── RoomManager.js  # 房间管理系统
│   └── GameLogic.js    # 游戏逻辑（伤害计算、击杀判定）
├── client/
│   ├── index.html      # 游戏主页面
│   ├── game.js         # Three.js 主游戏循环
│   ├── player.js       # 玩家控制器和远程玩家
│   ├── network.js      # Socket.io 客户端
│   └── styles.css      # 游戏界面样式
├── shared/
│   └── mapConfig.json  # 地图和武器配置
└── package.json
```

## 部署到 Railway

1. 将代码推送到 GitHub
2. 在 Railway 上创建新项目，连接 GitHub 仓库
3. Railway 会自动检测 `package.json` 并安装依赖
4. 设置启动命令：`npm start`

Railway 会自动分配公网域名，可以直接和朋友对战。

## 房间匹配

- 房间号由 4 位字母数字组成（如 "ABCD"）
- 创建房间后分享房间号给朋友
- 2 人即可开始游戏
- 断线会自动清理房间

## 网络同步

- 采用服务端权威模式
- 客户端本地预测移动
- 服务端验证并广播权威状态
- 防止作弊：移动速度验证、伤害服务端计算
