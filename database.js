const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'chat.db');

let db = null;

// 데이터베이스 초기화
async function initDatabase() {
  const SQL = await initSqlJs();
  
  // 기존 DB 파일이 있으면 로드
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  // 테이블 생성
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      nickname TEXT DEFAULT '익명',
      profile_image TEXT DEFAULT NULL,
      telegram_chat_id TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      is_archived INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      is_edited INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 계정 테이블
  db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nickname TEXT DEFAULT '익명',
      profile_image TEXT DEFAULT NULL,
      telegram_chat_id TEXT DEFAULT NULL,
      reset_token TEXT DEFAULT NULL,
      reset_token_expires DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 계정-세션 연결 테이블 (어떤 계정이 어떤 세션에 참여했는지)
  db.run(`
    CREATE TABLE IF NOT EXISTS account_sessions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(account_id, session_id)
    )
  `);
  
  saveDatabase();
  console.log('📦 데이터베이스 초기화 완료');
  return db;
}

// DB 파일로 저장
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// 헬퍼 함수: 단일 행 조회
function getOne(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

// 헬퍼 함수: 여러 행 조회
function getAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// 헬퍼 함수: 실행
function run(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
}

// ===== 세션 관련 =====
function createSession() {
  const id = uuidv4();
  run('INSERT INTO sessions (id, created_at) VALUES (?, datetime("now"))', [id]);
  
  // 기본 채팅방 생성
  const roomId = uuidv4();
  run('INSERT INTO rooms (id, session_id, name, created_at) VALUES (?, ?, ?, datetime("now"))', [roomId, id, '일반']);
  
  return { sessionId: id, roomId };
}

function getSession(id) {
  return getOne('SELECT * FROM sessions WHERE id = ?', [id]);
}

// ===== 사용자 관련 =====
function createUser(sessionId, nickname = '익명') {
  const id = uuidv4();
  run('INSERT INTO users (id, session_id, nickname, created_at) VALUES (?, ?, ?, datetime("now"))', [id, sessionId, nickname]);
  return { id, session_id: sessionId, nickname, profile_image: null, telegram_chat_id: null };
}

function getUser(id) {
  return getOne('SELECT * FROM users WHERE id = ?', [id]);
}

function getUsersBySession(sessionId) {
  return getAll('SELECT * FROM users WHERE session_id = ?', [sessionId]);
}

function updateUser(id, { nickname, profileImage, telegramChatId }) {
  const updates = [];
  const values = [];
  
  if (nickname !== undefined) {
    updates.push('nickname = ?');
    values.push(nickname);
  }
  if (profileImage !== undefined) {
    updates.push('profile_image = ?');
    values.push(profileImage);
  }
  if (telegramChatId !== undefined) {
    updates.push('telegram_chat_id = ?');
    values.push(telegramChatId);
  }
  
  if (updates.length > 0) {
    values.push(id);
    run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
  }
  
  return getUser(id);
}

// ===== 채팅방 관련 =====
function createRoom(sessionId, name) {
  const id = uuidv4();
  run('INSERT INTO rooms (id, session_id, name, created_at) VALUES (?, ?, ?, datetime("now"))', [id, sessionId, name]);
  return { id, session_id: sessionId, name, is_archived: 0 };
}

function getRoomsBySession(sessionId) {
  return getAll('SELECT * FROM rooms WHERE session_id = ? ORDER BY created_at', [sessionId]);
}

function getRoom(id) {
  return getOne('SELECT * FROM rooms WHERE id = ?', [id]);
}

function updateRoom(id, { name, isArchived }) {
  const updates = [];
  const values = [];
  
  if (name !== undefined) {
    updates.push('name = ?');
    values.push(name);
  }
  if (isArchived !== undefined) {
    updates.push('is_archived = ?');
    values.push(isArchived ? 1 : 0);
  }
  
  if (updates.length > 0) {
    values.push(id);
    run(`UPDATE rooms SET ${updates.join(', ')} WHERE id = ?`, values);
  }
  
  return getRoom(id);
}

// ===== 메시지 관련 =====
function createMessage(roomId, userId, content) {
  const id = uuidv4();
  run('INSERT INTO messages (id, room_id, user_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, datetime("now"), datetime("now"))', [id, roomId, userId, content]);
  return getMessage(id);
}

function getMessage(id) {
  return getOne(`
    SELECT m.*, u.nickname, u.profile_image 
    FROM messages m 
    JOIN users u ON m.user_id = u.id 
    WHERE m.id = ?
  `, [id]);
}

function getMessagesByRoom(roomId) {
  return getAll(`
    SELECT m.*, u.nickname, u.profile_image 
    FROM messages m 
    JOIN users u ON m.user_id = u.id 
    WHERE m.room_id = ?
    ORDER BY m.created_at
  `, [roomId]);
}

function updateMessage(id, content) {
  run(`
    UPDATE messages 
    SET content = ?, is_edited = 1, updated_at = datetime("now")
    WHERE id = ?
  `, [content, id]);
  return getMessage(id);
}

function deleteMessage(id) {
  const message = getMessage(id);
  if (message) {
    run('DELETE FROM messages WHERE id = ?', [id]);
  }
  return message;
}

// ===== 계정 관련 =====
function createAccount(username, email, passwordHash, nickname) {
  const id = uuidv4();
  run('INSERT INTO accounts (id, username, email, password_hash, nickname, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))', 
    [id, username, email, passwordHash, nickname]);
  return getAccount(id);
}

function getAccount(id) {
  return getOne('SELECT * FROM accounts WHERE id = ?', [id]);
}

function getAccountByUsername(username) {
  return getOne('SELECT * FROM accounts WHERE username = ?', [username]);
}

function getAccountByEmail(email) {
  return getOne('SELECT * FROM accounts WHERE email = ?', [email]);
}

function updateAccount(id, { nickname, profileImage, telegramChatId }) {
  const updates = [];
  const values = [];
  
  if (nickname !== undefined) {
    updates.push('nickname = ?');
    values.push(nickname);
  }
  if (profileImage !== undefined) {
    updates.push('profile_image = ?');
    values.push(profileImage);
  }
  if (telegramChatId !== undefined) {
    updates.push('telegram_chat_id = ?');
    values.push(telegramChatId);
  }
  
  if (updates.length > 0) {
    values.push(id);
    run(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`, values);
  }
  
  return getAccount(id);
}

function setResetToken(email, token, expires) {
  run('UPDATE accounts SET reset_token = ?, reset_token_expires = ? WHERE email = ?', [token, expires, email]);
}

function getAccountByResetToken(token) {
  return getOne('SELECT * FROM accounts WHERE reset_token = ? AND reset_token_expires > datetime("now")', [token]);
}

function updatePassword(id, passwordHash) {
  run('UPDATE accounts SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?', [passwordHash, id]);
}

// ===== 계정-세션 연결 =====
function addAccountToSession(accountId, sessionId) {
  const existing = getOne('SELECT * FROM account_sessions WHERE account_id = ? AND session_id = ?', [accountId, sessionId]);
  if (!existing) {
    const id = uuidv4();
    run('INSERT INTO account_sessions (id, account_id, session_id, joined_at) VALUES (?, ?, ?, datetime("now"))', [id, accountId, sessionId]);
  }
}

function getSessionsByAccount(accountId) {
  return getAll(`
    SELECT s.*, 
      (SELECT name FROM rooms WHERE session_id = s.id ORDER BY created_at LIMIT 1) as first_room_name,
      (SELECT COUNT(*) FROM rooms WHERE session_id = s.id) as room_count,
      acs.joined_at
    FROM sessions s
    JOIN account_sessions acs ON s.id = acs.session_id
    WHERE acs.account_id = ?
    ORDER BY acs.joined_at DESC
  `, [accountId]);
}

// ===== 백업용 =====
function exportRoom(roomId) {
  const room = getRoom(roomId);
  if (!room) return null;
  
  const messages = getMessagesByRoom(roomId);
  const userIds = [...new Set(messages.map(m => m.user_id))];
  const users = userIds.map(id => getUser(id));
  
  return {
    roomName: room.name,
    createdAt: room.created_at,
    archivedAt: room.is_archived ? new Date().toISOString() : null,
    participants: users.map(u => ({
      nickname: u.nickname,
      profileImage: u.profile_image
    })),
    messages: messages.map(m => ({
      id: m.id,
      sender: m.nickname,
      senderProfileImage: m.profile_image,
      text: m.content,
      time: m.created_at,
      isEdited: m.is_edited === 1
    }))
  };
}

module.exports = {
  initDatabase,
  createSession,
  getSession,
  createUser,
  getUser,
  getUsersBySession,
  updateUser,
  createRoom,
  getRoomsBySession,
  getRoom,
  updateRoom,
  createMessage,
  getMessage,
  getMessagesByRoom,
  updateMessage,
  deleteMessage,
  exportRoom,
  // 계정 관련
  createAccount,
  getAccount,
  getAccountByUsername,
  getAccountByEmail,
  updateAccount,
  setResetToken,
  getAccountByResetToken,
  updatePassword,
  addAccountToSession,
  getSessionsByAccount
};
