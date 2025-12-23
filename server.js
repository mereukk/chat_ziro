require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');
const telegram = require('./telegram');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// 프로필 이미지 업로드 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('이미지 파일만 업로드 가능합니다.'));
    }
  }
});

// uploads 폴더 생성
const fs = require('fs');
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// ===== REST API =====

// 새 세션 생성
app.post('/api/sessions', (req, res) => {
  try {
    const session = db.createSession();
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 세션 정보 조회
app.get('/api/sessions/:id', (req, res) => {
  try {
    const session = db.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: '세션을 찾을 수 없습니다.' });
    }
    const rooms = db.getRoomsBySession(req.params.id);
    const users = db.getUsersBySession(req.params.id);
    res.json({ ...session, rooms, users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 사용자 생성
app.post('/api/sessions/:sessionId/users', (req, res) => {
  try {
    const { nickname } = req.body;
    const user = db.createUser(req.params.sessionId, nickname || '익명');
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 사용자 정보 수정
app.patch('/api/users/:id', (req, res) => {
  try {
    const { nickname, telegramChatId } = req.body;
    const user = db.updateUser(req.params.id, { nickname, telegramChatId });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 프로필 이미지 업로드
app.post('/api/users/:id/profile-image', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '이미지가 없습니다.' });
    }
    const profileImage = `/uploads/${req.file.filename}`;
    const user = db.updateUser(req.params.id, { profileImage });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 채팅방 생성
app.post('/api/sessions/:sessionId/rooms', (req, res) => {
  try {
    const { name } = req.body;
    const room = db.createRoom(req.params.sessionId, name || '새 채팅방');
    io.to(req.params.sessionId).emit('room:created', room);
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 채팅방 수정 (이름 변경, 보관)
app.patch('/api/rooms/:id', (req, res) => {
  try {
    const { name, isArchived } = req.body;
    const room = db.updateRoom(req.params.id, { name, isArchived });
    
    // 방 정보 변경 알림
    const fullRoom = db.getRoom(req.params.id);
    if (fullRoom) {
      io.to(fullRoom.session_id).emit('room:updated', room);
    }
    
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 채팅방 메시지 조회
app.get('/api/rooms/:id/messages', (req, res) => {
  try {
    const messages = db.getMessagesByRoom(req.params.id);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 채팅방 백업 (JSON 다운로드)
app.get('/api/rooms/:id/export', (req, res) => {
  try {
    const data = db.exportRoom(req.params.id);
    if (!data) {
      return res.status(404).json({ error: '채팅방을 찾을 수 없습니다.' });
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="chat_${data.roomName}_${new Date().toISOString().split('T')[0]}.json"`);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 메시지 수정
app.patch('/api/messages/:id', (req, res) => {
  try {
    const { content } = req.body;
    const message = db.updateMessage(req.params.id, content);
    
    // 메시지가 속한 방 찾기
    const room = db.getRoom(message.room_id);
    if (room) {
      io.to(room.session_id).emit('message:updated', message);
    }
    
    res.json(message);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 메시지 삭제
app.delete('/api/messages/:id', (req, res) => {
  try {
    const message = db.deleteMessage(req.params.id);
    if (!message) {
      return res.status(404).json({ error: '메시지를 찾을 수 없습니다.' });
    }
    
    // 메시지가 속한 방 찾기
    const room = db.getRoom(message.room_id);
    if (room) {
      io.to(room.session_id).emit('message:deleted', { id: req.params.id, roomId: message.room_id });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 메인 페이지
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 세션 페이지
app.get('/chat/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== Socket.IO =====

// 온라인 사용자 추적
const onlineUsers = new Map(); // sessionId -> Set of { odId, socketId }

io.on('connection', (socket) => {
  console.log('사용자 연결:', socket.id);
  
  let currentSessionId = null;
  let currentUserId = null;
  
  // 세션 참가
  socket.on('join:session', ({ sessionId, userId }) => {
    currentSessionId = sessionId;
    currentUserId = userId;
    
    socket.join(sessionId);
    
    // 온라인 사용자 목록에 추가
    if (!onlineUsers.has(sessionId)) {
      onlineUsers.set(sessionId, new Set());
    }
    onlineUsers.get(sessionId).add(userId);
    
    // 다른 사용자들에게 알림
    const users = Array.from(onlineUsers.get(sessionId));
    io.to(sessionId).emit('users:online', users);
    
    console.log(`사용자 ${userId}가 세션 ${sessionId}에 참가`);
  });
  
  // 메시지 전송
  socket.on('message:send', async ({ roomId, userId, content }) => {
    try {
      const message = db.createMessage(roomId, userId, content);
      const room = db.getRoom(roomId);
      const sender = db.getUser(userId);
      
      if (room) {
        // 같은 세션의 모든 사용자에게 메시지 전송
        io.to(room.session_id).emit('message:new', message);
        
        // 텔레그램 알림 (본인 제외)
        const users = db.getUsersBySession(room.session_id);
        for (const user of users) {
          if (user.id !== userId && user.telegram_chat_id) {
            await telegram.notifyNewMessage(
              user.telegram_chat_id,
              sender.nickname,
              room.name,
              content
            );
          }
        }
      }
    } catch (error) {
      console.error('메시지 전송 에러:', error);
      socket.emit('error', { message: error.message });
    }
  });
  
  // 타이핑 표시
  socket.on('typing:start', ({ roomId, userId, nickname }) => {
    socket.to(currentSessionId).emit('typing:show', { roomId, userId, nickname });
  });
  
  socket.on('typing:stop', ({ roomId, userId }) => {
    socket.to(currentSessionId).emit('typing:hide', { roomId, userId });
  });
  
  // 연결 해제
  socket.on('disconnect', () => {
    if (currentSessionId && currentUserId) {
      const sessionUsers = onlineUsers.get(currentSessionId);
      if (sessionUsers) {
        sessionUsers.delete(currentUserId);
        const users = Array.from(sessionUsers);
        io.to(currentSessionId).emit('users:online', users);
      }
    }
    console.log('사용자 연결 해제:', socket.id);
  });
});

// 서버 시작
async function startServer() {
  await db.initDatabase();
  server.listen(PORT, () => {
    console.log(`🚀 서버가 http://localhost:${PORT} 에서 실행 중`);
  });
}

startServer();

