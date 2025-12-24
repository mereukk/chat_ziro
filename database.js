const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase = null;

// 데이터베이스 초기화
async function initDatabase() {
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL과 SUPABASE_KEY 환경변수를 설정하세요!');
    process.exit(1);
  }
  
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('📦 Supabase 연결 완료');
  return supabase;
}

// ===== 세션 관련 =====
async function createSession() {
  const { data: session, error } = await supabase
    .from('sessions')
    .insert({})
    .select()
    .single();
  
  if (error) throw error;
  
  // 기본 채팅방 생성
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .insert({ session_id: session.id, name: '일반' })
    .select()
    .single();
  
  if (roomError) throw roomError;
  
  return { sessionId: session.id, roomId: room.id };
}

async function getSession(id) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function deleteSession(id) {
  // 관련 데이터 삭제 (순서 중요: 외래키 제약)
  // 1. 메시지 삭제 (rooms를 통해)
  const rooms = await getRoomsBySession(id);
  for (const room of rooms) {
    await supabase.from('messages').delete().eq('room_id', room.id);
  }
  
  // 2. 채팅방 삭제
  await supabase.from('rooms').delete().eq('session_id', id);
  
  // 3. 사용자 삭제
  await supabase.from('users').delete().eq('session_id', id);
  
  // 4. 계정-세션 연결 삭제
  await supabase.from('account_sessions').delete().eq('session_id', id);
  
  // 5. 세션 삭제
  const { error } = await supabase.from('sessions').delete().eq('id', id);
  if (error) throw error;
  
  return true;
}

// ===== 사용자 관련 =====
async function createUser(sessionId, nickname = '익명', accountId = null, telegramChatId = null) {
  const insertData = { 
    session_id: sessionId, 
    nickname,
    account_id: accountId
  };
  if (telegramChatId) {
    insertData.telegram_chat_id = telegramChatId;
  }
  
  const { data, error } = await supabase
    .from('users')
    .insert(insertData)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function getUser(id) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function getUsersBySession(sessionId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('session_id', sessionId);
  
  if (error) throw error;
  return data || [];
}

// 같은 세션에서 같은 계정으로 만든 user 찾기 (텔레그램 ID가 있는 것 우선)
async function getUserByAccountAndSession(accountId, sessionId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('account_id', accountId)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true }); // 가장 처음 만든 user
  
  if (error) throw error;
  if (!data || data.length === 0) return null;
  
  // 텔레그램 ID가 있는 user 우선 반환
  const userWithTelegram = data.find(u => u.telegram_chat_id);
  return userWithTelegram || data[0];
}

async function updateUser(id, { nickname, profileImage, telegramChatId }) {
  const updates = {};
  if (nickname !== undefined) updates.nickname = nickname;
  if (profileImage !== undefined) updates.profile_image = profileImage;
  if (telegramChatId !== undefined) updates.telegram_chat_id = telegramChatId;
  
  if (Object.keys(updates).length === 0) return getUser(id);
  
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// ===== 채팅방 관련 =====
async function createRoom(sessionId, name) {
  const { data, error } = await supabase
    .from('rooms')
    .insert({ session_id: sessionId, name })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function getRoomsBySession(sessionId) {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at');
  
  if (error) throw error;
  return data || [];
}

async function getRoom(id) {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function updateRoom(id, { name, isArchived }) {
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (isArchived !== undefined) updates.is_archived = isArchived;
  
  if (Object.keys(updates).length === 0) return getRoom(id);
  
  const { data, error } = await supabase
    .from('rooms')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function deleteRoom(id) {
  const room = await getRoom(id);
  if (!room) return null;
  
  // 먼저 해당 채팅방의 모든 메시지 삭제
  const { error: msgError } = await supabase
    .from('messages')
    .delete()
    .eq('room_id', id);
  
  if (msgError) throw msgError;
  
  // 채팅방 삭제
  const { error } = await supabase
    .from('rooms')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
  return room;
}

// 채팅방 목록을 마지막 메시지 시간 기준으로 정렬해서 가져오기
async function getRoomsBySessionSorted(sessionId) {
  // 모든 채팅방 가져오기
  const { data: rooms, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('session_id', sessionId);
  
  if (error) throw error;
  if (!rooms || rooms.length === 0) return [];
  
  // 각 채팅방의 마지막 메시지 시간 가져오기
  const roomsWithLastMessage = await Promise.all(rooms.map(async (room) => {
    const { data: messages } = await supabase
      .from('messages')
      .select('created_at')
      .eq('room_id', room.id)
      .order('created_at', { ascending: false })
      .limit(1);
    
    return {
      ...room,
      last_message_at: messages?.[0]?.created_at || room.created_at
    };
  }));
  
  // 마지막 메시지 시간 기준 내림차순 정렬 (최신이 첫 번째)
  return roomsWithLastMessage.sort((a, b) => 
    new Date(b.last_message_at) - new Date(a.last_message_at)
  );
}

// ===== 메시지 관련 =====
async function createMessage(roomId, userId, content) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ room_id: roomId, user_id: userId, content })
    .select()
    .single();
  
  if (error) throw error;
  return getMessage(data.id);
}

async function getMessage(id) {
  const { data, error } = await supabase
    .from('messages')
    .select(`
      *,
      users (nickname, profile_image, account_id)
    `)
    .eq('id', id)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  
  if (data) {
    return {
      ...data,
      nickname: data.users?.nickname,
      profile_image: data.users?.profile_image,
      account_id: data.users?.account_id
    };
  }
  return data;
}

async function getMessagesByRoom(roomId) {
  const { data, error } = await supabase
    .from('messages')
    .select(`
      *,
      users (nickname, profile_image, account_id)
    `)
    .eq('room_id', roomId)
    .order('created_at');
  
  if (error) throw error;
  
  return (data || []).map(m => ({
    ...m,
    nickname: m.users?.nickname,
    profile_image: m.users?.profile_image,
    account_id: m.users?.account_id
  }));
}

async function updateMessage(id, content) {
  const { data, error } = await supabase
    .from('messages')
    .update({ content, is_edited: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return getMessage(id);
}

async function deleteMessage(id) {
  const message = await getMessage(id);
  if (!message) return null;
  
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
  return message;
}

// ===== 계정 관련 =====
async function createAccount(username, email, passwordHash, nickname, telegramChatId) {
  const insertData = { username, email, password_hash: passwordHash, nickname };
  if (telegramChatId) {
    insertData.telegram_chat_id = telegramChatId;
  }
  
  const { data, error } = await supabase
    .from('accounts')
    .insert(insertData)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function getAccount(id) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function getAccountByUsername(username) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('username', username)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function getAccountByEmail(email) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('email', email)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function updateAccount(id, { nickname, profileImage, telegramChatId }) {
  const updates = {};
  if (nickname !== undefined) updates.nickname = nickname;
  if (profileImage !== undefined) updates.profile_image = profileImage;
  if (telegramChatId !== undefined) updates.telegram_chat_id = telegramChatId;
  
  if (Object.keys(updates).length === 0) return getAccount(id);
  
  const { data, error } = await supabase
    .from('accounts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function setResetToken(email, token, expires) {
  const { error } = await supabase
    .from('accounts')
    .update({ reset_token: token, reset_token_expires: expires })
    .eq('email', email);
  
  if (error) throw error;
}

async function getAccountByResetToken(token) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('reset_token', token)
    .gt('reset_token_expires', new Date().toISOString())
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function updatePassword(id, passwordHash) {
  const { error } = await supabase
    .from('accounts')
    .update({ 
      password_hash: passwordHash, 
      reset_token: null, 
      reset_token_expires: null 
    })
    .eq('id', id);
  
  if (error) throw error;
}

// ===== 계정-세션 연결 =====
async function addAccountToSession(accountId, sessionId) {
  const { error } = await supabase
    .from('account_sessions')
    .upsert({ account_id: accountId, session_id: sessionId })
    .select();
  
  if (error && error.code !== '23505') throw error; // 중복 무시
}

async function getSessionsByAccount(accountId) {
  const { data, error } = await supabase
    .from('account_sessions')
    .select(`
      *,
      sessions (*)
    `)
    .eq('account_id', accountId)
    .order('joined_at', { ascending: false });
  
  if (error) throw error;
  
  // 각 세션의 첫 번째 방 이름과 방 개수 가져오기
  const results = [];
  for (const as of (data || [])) {
    const { data: rooms } = await supabase
      .from('rooms')
      .select('name')
      .eq('session_id', as.session_id)
      .order('created_at')
      .limit(1);
    
    const { count } = await supabase
      .from('rooms')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', as.session_id);
    
    results.push({
      ...as.sessions,
      first_room_name: rooms?.[0]?.name || '채팅',
      room_count: count || 0,
      joined_at: as.joined_at
    });
  }
  
  return results;
}

// ===== 백업용 =====
async function exportRoom(roomId) {
  const room = await getRoom(roomId);
  if (!room) return null;
  
  const messages = await getMessagesByRoom(roomId);
  const userIds = [...new Set(messages.map(m => m.user_id))];
  
  const users = [];
  for (const id of userIds) {
    const user = await getUser(id);
    if (user) users.push(user);
  }
  
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
      isEdited: m.is_edited === true
    }))
  };
}

module.exports = {
  initDatabase,
  createSession,
  getSession,
  deleteSession,
  createUser,
  getUser,
  getUsersBySession,
  getUserByAccountAndSession,
  updateUser,
  createRoom,
  getRoomsBySession,
  getRoomsBySessionSorted,
  getRoom,
  updateRoom,
  deleteRoom,
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
