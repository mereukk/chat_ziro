require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const db = require('./database');
const telegram = require('./telegram');

// Resend는 선택 사항 (비밀번호 찾기용)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Supabase Storage 클라이언트
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(express.json());
app.use(express.static('public'));

// 프로필 이미지 업로드 설정 (메모리 스토리지 - Supabase로 전송)
const upload = multer({ 
  storage: multer.memoryStorage(),
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

// Supabase Storage에 이미지 업로드
async function uploadToSupabase(file) {
  const ext = path.extname(file.originalname);
  const filename = `${uuidv4()}${ext}`;
  
  const { data, error } = await supabase.storage
    .from('abatars')
    .upload(filename, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });
  
  if (error) throw error;
  
  // Public URL 가져오기
  const { data: urlData } = supabase.storage
    .from('abatars')
    .getPublicUrl(filename);
  
  return urlData.publicUrl;
}

// ===== 계정 API =====

// 회원가입
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, nickname } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: '아이디, 이메일, 비밀번호를 모두 입력하세요.' });
    }
    
    // 중복 체크
    if (await db.getAccountByUsername(username)) {
      return res.status(400).json({ error: '이미 사용 중인 아이디입니다.' });
    }
    if (await db.getAccountByEmail(email)) {
      return res.status(400).json({ error: '이미 사용 중인 이메일입니다.' });
    }
    
    // 비밀번호 해싱
    const passwordHash = await bcrypt.hash(password, 10);
    
    // 계정 생성
    const account = await db.createAccount(username, email, passwordHash, nickname || username);
    
    res.json({ 
      id: account.id, 
      username: account.username, 
      nickname: account.nickname,
      email: account.email
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 로그인
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요.' });
    }
    
    const account = await db.getAccountByUsername(username);
    if (!account) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 틀립니다.' });
    }
    
    const isMatch = await bcrypt.compare(password, account.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 틀립니다.' });
    }
    
    res.json({ 
      id: account.id, 
      username: account.username, 
      nickname: account.nickname,
      email: account.email,
      profile_image: account.profile_image,
      telegram_chat_id: account.telegram_chat_id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 비밀번호 찾기 (이메일 발송)
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: '이메일을 입력하세요.' });
    }
    
    const account = await db.getAccountByEmail(email);
    if (!account) {
      // 보안상 계정 존재 여부를 알려주지 않음
      return res.json({ message: '이메일이 발송되었습니다.' });
    }
    
    // 토큰 생성
    const token = uuidv4();
    const expires = new Date(Date.now() + 3600000).toISOString(); // 1시간
    await db.setResetToken(email, token, expires);
    
    // 이메일 발송
    if (!resend) {
      return res.status(500).json({ error: '이메일 발송 기능이 설정되지 않았습니다.' });
    }
    
    const resetUrl = `${req.protocol}://${req.get('host')}/reset-password.html?token=${token}`;
    
    await resend.emails.send({
      from: 'Chat Ziro <onboarding@resend.dev>',
      to: email,
      subject: '[Chat Ziro] 비밀번호 재설정',
      html: `
        <h2>비밀번호 재설정</h2>
        <p>아래 링크를 클릭하여 비밀번호를 재설정하세요.</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>이 링크는 1시간 후 만료됩니다.</p>
        <p>본인이 요청하지 않았다면 이 이메일을 무시하세요.</p>
      `
    });
    
    res.json({ message: '이메일이 발송되었습니다.' });
  } catch (error) {
    console.error('이메일 발송 에러:', error);
    res.status(500).json({ error: '이메일 발송에 실패했습니다.' });
  }
});

// 비밀번호 재설정
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ error: '토큰과 새 비밀번호를 입력하세요.' });
    }
    
    const account = await db.getAccountByResetToken(token);
    if (!account) {
      return res.status(400).json({ error: '유효하지 않거나 만료된 토큰입니다.' });
    }
    
    const passwordHash = await bcrypt.hash(password, 10);
    await db.updatePassword(account.id, passwordHash);
    
    res.json({ message: '비밀번호가 변경되었습니다.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 계정 정보 수정
app.patch('/api/accounts/:id', async (req, res) => {
  try {
    const { nickname, telegramChatId } = req.body;
    const account = await db.updateAccount(req.params.id, { nickname, telegramChatId });
    res.json(account);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 계정 프로필 이미지 업로드
app.post('/api/accounts/:id/profile-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '이미지가 없습니다.' });
    }
    // Supabase Storage에 업로드
    const profileImage = await uploadToSupabase(req.file);
    const account = await db.updateAccount(req.params.id, { profileImage });
    res.json(account);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 내 채팅방 목록
app.get('/api/accounts/:id/sessions', async (req, res) => {
  try {
    const sessions = await db.getSessionsByAccount(req.params.id);
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== REST API =====

// 새 세션 생성
app.post('/api/sessions', async (req, res) => {
  try {
    const session = await db.createSession();
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 세션 정보 조회
app.get('/api/sessions/:id', async (req, res) => {
  try {
    const session = await db.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: '세션을 찾을 수 없습니다.' });
    }
    const rooms = await db.getRoomsBySession(req.params.id);
    const users = await db.getUsersBySession(req.params.id);
    res.json({ ...session, rooms, users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 사용자 생성
app.post('/api/sessions/:sessionId/users', async (req, res) => {
  try {
    const { nickname, accountId } = req.body;
    const user = await db.createUser(req.params.sessionId, nickname || '익명', accountId);
    
    // 계정이 있으면 세션과 연결
    if (accountId) {
      await db.addAccountToSession(accountId, req.params.sessionId);
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 사용자 정보 수정
app.patch('/api/users/:id', async (req, res) => {
  try {
    const { nickname, telegramChatId } = req.body;
    const user = await db.updateUser(req.params.id, { nickname, telegramChatId });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 프로필 이미지 업로드
app.post('/api/users/:id/profile-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '이미지가 없습니다.' });
    }
    // Supabase Storage에 업로드
    const profileImage = await uploadToSupabase(req.file);
    const user = await db.updateUser(req.params.id, { profileImage });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 채팅방 생성
app.post('/api/sessions/:sessionId/rooms', async (req, res) => {
  try {
    const { name } = req.body;
    const room = await db.createRoom(req.params.sessionId, name || '새 채팅방');
    io.to(req.params.sessionId).emit('room:created', room);
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 채팅방 수정 (이름 변경, 보관)
app.patch('/api/rooms/:id', async (req, res) => {
  try {
    const { name, isArchived } = req.body;
    const room = await db.updateRoom(req.params.id, { name, isArchived });
    
    // 방 정보 변경 알림
    const fullRoom = await db.getRoom(req.params.id);
    if (fullRoom) {
      io.to(fullRoom.session_id).emit('room:updated', room);
    }
    
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 채팅방 메시지 조회
app.get('/api/rooms/:id/messages', async (req, res) => {
  try {
    const messages = await db.getMessagesByRoom(req.params.id);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 채팅방 백업 (JSON 다운로드)
app.get('/api/rooms/:id/export', async (req, res) => {
  try {
    const data = await db.exportRoom(req.params.id);
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
app.patch('/api/messages/:id', async (req, res) => {
  try {
    const { content } = req.body;
    const message = await db.updateMessage(req.params.id, content);
    
    // 메시지가 속한 방 찾기
    const room = await db.getRoom(message.room_id);
    if (room) {
      io.to(room.session_id).emit('message:updated', message);
    }
    
    res.json(message);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 메시지 삭제
app.delete('/api/messages/:id', async (req, res) => {
  try {
    const message = await db.deleteMessage(req.params.id);
    if (!message) {
      return res.status(404).json({ error: '메시지를 찾을 수 없습니다.' });
    }
    
    // 메시지가 속한 방 찾기
    const room = await db.getRoom(message.room_id);
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
      const message = await db.createMessage(roomId, userId, content);
      const room = await db.getRoom(roomId);
      const sender = await db.getUser(userId);
      
      if (room) {
        // 같은 세션의 모든 사용자에게 메시지 전송
        io.to(room.session_id).emit('message:new', message);
        
        // 텔레그램 알림 (본인 제외, 중복 Chat ID 제거)
        const users = await db.getUsersBySession(room.session_id);
        const chatUrl = `https://chat-mereu.onrender.com/chat/${room.session_id}`;
        const notifiedChatIds = new Set(); // 중복 알림 방지
        const senderChatId = sender.telegram_chat_id; // 발신자 Chat ID
        
        for (const user of users) {
          if (user.id !== userId && user.telegram_chat_id) {
            // 발신자 Chat ID와 같으면 건너뛰기 (본인 알림 방지)
            if (user.telegram_chat_id === senderChatId) continue;
            // 이미 알림 보낸 Chat ID는 건너뛰기
            if (notifiedChatIds.has(user.telegram_chat_id)) continue;
            notifiedChatIds.add(user.telegram_chat_id);
            
            await telegram.notifyNewMessage(
              user.telegram_chat_id,
              sender.nickname,
              room.name,
              content,
              chatUrl
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

