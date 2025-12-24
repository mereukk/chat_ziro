// ===== 상태 관리 =====
const state = {
  sessionId: null,
  userId: null,
  user: null,
  rooms: [],
  currentRoomId: null,
  messages: [],
  onlineUsers: [],
  account: null // 로그인한 계정
};

// Socket.io 연결
let socket = null;
let pendingRoomSelect = null;
let pendingSessionId = null; // 로그인 후 이동할 세션 ID

// ===== DOM 요소 =====
const elements = {
  // 화면
  welcomeScreen: document.getElementById('welcome-screen'),
  profileScreen: document.getElementById('profile-screen'),
  chatScreen: document.getElementById('chat-screen'),
  
  // 시작 화면
  btnCreateSession: document.getElementById('btn-create-session'),
  btnMyChats: document.getElementById('btn-my-chats'),
  accountStatus: document.getElementById('account-status'),
  loggedInName: document.getElementById('logged-in-name'),
  btnLogout: document.getElementById('btn-logout'),
  authButtons: document.getElementById('auth-buttons'),
  btnShowLogin: document.getElementById('btn-show-login'),
  btnShowRegister: document.getElementById('btn-show-register'),
  
  // 로그인 화면
  loginScreen: document.getElementById('login-screen'),
  loginForm: document.getElementById('login-form'),
  loginUsername: document.getElementById('login-username'),
  loginPassword: document.getElementById('login-password'),
  btnBackLogin: document.getElementById('btn-back-login'),
  btnForgotPassword: document.getElementById('btn-forgot-password'),
  
  // 회원가입 화면
  registerScreen: document.getElementById('register-screen'),
  registerForm: document.getElementById('register-form'),
  registerUsername: document.getElementById('register-username'),
  registerEmail: document.getElementById('register-email'),
  registerPassword: document.getElementById('register-password'),
  registerNickname: document.getElementById('register-nickname'),
  registerTelegram: document.getElementById('register-telegram'),
  btnBackRegister: document.getElementById('btn-back-register'),
  
  // 비밀번호 찾기 화면
  forgotScreen: document.getElementById('forgot-screen'),
  forgotForm: document.getElementById('forgot-form'),
  forgotEmail: document.getElementById('forgot-email'),
  btnBackForgot: document.getElementById('btn-back-forgot'),
  
  // 내 채팅방 목록 화면
  myChatsScreen: document.getElementById('my-chats-screen'),
  myChatsList: document.getElementById('my-chats-list'),
  noChatsMessage: document.getElementById('no-chats-message'),
  btnBackMyChats: document.getElementById('btn-back-my-chats'),
  
  // 프로필 설정
  profilePreview: document.getElementById('profile-preview'),
  profileImageWrapper: document.getElementById('profile-image-wrapper'),
  profileImageInput: document.getElementById('profile-image-input'),
  nicknameInput: document.getElementById('nickname-input'),
  telegramInput: document.getElementById('telegram-input'),
  btnSaveProfile: document.getElementById('btn-save-profile'),
  telegramHelpLink: document.getElementById('telegram-help-link'),
  
  // 사이드바
  sidebarProfileImage: document.getElementById('sidebar-profile-image'),
  sidebarNickname: document.getElementById('sidebar-nickname'),
  btnEditProfile: document.getElementById('btn-edit-profile'),
  roomsList: document.getElementById('rooms-list'),
  archivedSection: document.getElementById('archived-section'),
  archivedHeader: document.getElementById('archived-header'),
  archivedRoomsList: document.getElementById('archived-rooms-list'),
  archivedCount: document.getElementById('archived-count'),
  btnAddRoom: document.getElementById('btn-add-room'),
  onlineCount: document.getElementById('online-count'),
  btnShareLink: document.getElementById('btn-share-link'),
  btnLogoutChat: document.getElementById('btn-logout-chat'),
  sidebar: document.querySelector('.sidebar'),
  
  // 채팅 메인
  chatMain: document.querySelector('.chat-main'),
  btnBackToSidebar: document.getElementById('btn-back-to-sidebar'),
  currentRoomName: document.getElementById('current-room-name'),
  btnEditRoom: document.getElementById('btn-edit-room'),
  btnExportRoom: document.getElementById('btn-export-room'),
  btnArchiveRoom: document.getElementById('btn-archive-room'),
  btnDeleteRoom: document.getElementById('btn-delete-room'),
  messagesContainer: document.getElementById('messages-container'),
  messagesList: document.getElementById('messages-list'),
  typingIndicator: document.getElementById('typing-indicator'),
  messageInput: document.getElementById('message-input'),
  btnSend: document.getElementById('btn-send'),
  
  // 모달
  telegramModal: document.getElementById('telegram-modal'),
  roomEditModal: document.getElementById('room-edit-modal'),
  roomNameInput: document.getElementById('room-name-input'),
  btnSaveRoomName: document.getElementById('btn-save-room-name'),
  newRoomModal: document.getElementById('new-room-modal'),
  newRoomNameInput: document.getElementById('new-room-name-input'),
  btnCreateRoom: document.getElementById('btn-create-room'),
  messageEditModal: document.getElementById('message-edit-modal'),
  editMessageInput: document.getElementById('edit-message-input'),
  btnSaveMessage: document.getElementById('btn-save-message'),
  btnDeleteMessage: document.getElementById('btn-delete-message'),
  profileEditModal: document.getElementById('profile-edit-modal'),
  editProfilePreview: document.getElementById('edit-profile-preview'),
  editProfileImageWrapper: document.getElementById('edit-profile-image-wrapper'),
  editProfileImageInput: document.getElementById('edit-profile-image-input'),
  editNicknameInput: document.getElementById('edit-nickname-input'),
  editTelegramInput: document.getElementById('edit-telegram-input'),
  btnUpdateProfile: document.getElementById('btn-update-profile'),
  
  // 토스트
  toastContainer: document.getElementById('toast-container')
};

// ===== 유틸리티 =====
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

// 모바일 화면 전환
function showChatMobile() {
  if (window.innerWidth <= 768) {
    elements.sidebar.classList.add('hidden-mobile');
    elements.chatMain.classList.add('active-mobile');
  }
}

function showSidebarMobile() {
  if (window.innerWidth <= 768) {
    elements.sidebar.classList.remove('hidden-mobile');
    elements.chatMain.classList.remove('active-mobile');
  }
}

function showModal(modalId) {
  document.getElementById(modalId).classList.remove('hidden');
}

function hideModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span> ${message}`;
  elements.toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'toastIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function formatTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function getDefaultAvatar(nickname) {
  const initial = (nickname || '?').charAt(0).toUpperCase();
  // 간단한 placeholder 이미지 URL 사용
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=7c6aef&color=fff&size=100&bold=true`;
}

function getAvatarSrc(profileImage, nickname) {
  if (profileImage && profileImage !== 'null') {
    return profileImage;
  }
  return getDefaultAvatar(nickname);
}

// ===== API 호출 =====
async function api(method, path, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`/api${path}`, options);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '요청 실패');
  }
  return response.json();
}

async function uploadProfileImage(userId, file) {
  const formData = new FormData();
  formData.append('image', file);
  
  const response = await fetch(`/api/users/${userId}/profile-image`, {
    method: 'POST',
    body: formData
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || '업로드 실패');
  }
  return response.json();
}

// ===== 세션 관리 =====
async function createSession() {
  try {
    const { sessionId, roomId } = await api('POST', '/sessions');
    state.sessionId = sessionId;
    state.currentRoomId = roomId;
    
    // URL 변경
    history.pushState({}, '', `/chat/${sessionId}`);
    
    showScreen('profile-screen');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function joinSession(sessionId) {
  try {
    // URL에서 room 파라미터 먼저 저장 (나중에 사용)
    const urlParams = new URLSearchParams(window.location.search);
    const roomIdFromUrl = urlParams.get('room');
    if (roomIdFromUrl) {
      state.pendingRoomId = roomIdFromUrl;
    }
    
    const session = await api('GET', `/sessions/${sessionId}`);
    state.sessionId = sessionId;
    state.rooms = session.rooms;
    
    // 로그인한 계정이 있으면 서버에서 기존 user 확인
    if (state.account) {
      try {
        // 서버에 요청하면 같은 계정+세션의 기존 user를 반환함
        const user = await api('POST', `/sessions/${sessionId}/users`, {
          nickname: state.account.nickname || state.account.username,
          accountId: state.account.id
        });
        state.userId = user.id;
        state.user = user;
        state.currentRoomId = session.rooms[0]?.id;
        localStorage.setItem(`user_${sessionId}`, user.id);
        history.pushState({}, '', `/chat/${state.sessionId}`);
        await initChat();
        return;
      } catch (e) {
        console.error('Error getting/creating user:', e);
      }
    }
    
    // 저장된 사용자 ID 확인 (비로그인 상태)
    const savedUserId = localStorage.getItem(`user_${sessionId}`);
    if (savedUserId) {
      // 기존 사용자
      try {
        const users = session.users;
        const existingUser = users.find(u => u.id === savedUserId);
        if (existingUser) {
          state.userId = existingUser.id;
          state.user = existingUser;
          state.currentRoomId = session.rooms[0]?.id;
          await initChat();
          return;
        }
      } catch (e) {
        // 사용자를 찾을 수 없으면 새로 생성
      }
    }
    
    // 새 사용자 - 프로필 설정 화면으로 이동
    state.currentRoomId = session.rooms[0]?.id;
    
    // URL 변경
    history.pushState({}, '', `/chat/${state.sessionId}`);
    
    // 로그인한 계정이 있으면 기본값 채우기
    if (state.account) {
      elements.nicknameInput.value = state.account.nickname || state.account.username || '';
      elements.telegramInput.value = state.account.telegram_chat_id || '';
      if (state.account.profile_image) {
        elements.profilePreview.src = state.account.profile_image;
      }
    }
    
    showScreen('profile-screen');
  } catch (error) {
    showToast('세션을 찾을 수 없습니다.', 'error');
    showScreen('welcome-screen');
  }
}

// ===== 프로필 관리 =====
async function saveProfile() {
  // 입력된 값 사용 (채팅방마다 다른 닉네임/이미지 가능)
  const nickname = elements.nicknameInput.value.trim() || '익명';
  const telegramChatId = elements.telegramInput.value.trim();
  
  try {
    // 사용자 생성 (계정 ID 포함)
    const user = await api('POST', `/sessions/${state.sessionId}/users`, { 
      nickname,
      accountId: state.account?.id
    });
    state.userId = user.id;
    state.user = user;
    
    // localStorage에 저장
    localStorage.setItem(`user_${state.sessionId}`, user.id);
    
    // 텔레그램 ID 저장
    if (telegramChatId) {
      await api('PATCH', `/users/${user.id}`, { telegramChatId });
      state.user.telegram_chat_id = telegramChatId;
    }
    
    // 프로필 이미지 업로드
    const file = elements.profileImageInput.files[0];
    if (file) {
      const updated = await uploadProfileImage(user.id, file);
      state.user = updated;
    } else if (elements.profilePreview.src && !elements.profilePreview.src.includes('ui-avatars.com')) {
      // 기존 이미지가 있으면 사용 (계정 이미지 등)
      state.user.profile_image = elements.profilePreview.src;
    }
    
    await initChat();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function updateProfile() {
  const nickname = elements.editNicknameInput.value.trim();
  const telegramChatId = elements.editTelegramInput.value.trim();
  
  try {
    await api('PATCH', `/users/${state.userId}`, { nickname, telegramChatId });
    
    // 프로필 이미지 업로드
    const file = elements.editProfileImageInput.files[0];
    if (file) {
      const updated = await uploadProfileImage(state.userId, file);
      state.user = updated;
    } else {
      state.user.nickname = nickname;
      state.user.telegram_chat_id = telegramChatId;
    }
    
    updateSidebarProfile();
    hideModal('profile-edit-modal');
    showToast('프로필이 수정되었습니다.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function updateSidebarProfile() {
  elements.sidebarProfileImage.src = getAvatarSrc(state.user?.profile_image, state.user?.nickname);
  elements.sidebarNickname.textContent = state.user?.nickname || '익명';
}

// ===== 채팅 초기화 =====
async function initChat() {
  showScreen('chat-screen');
  
  // 세션 정보 로드 (rooms가 없을 수 있으므로)
  if (!state.rooms || state.rooms.length === 0) {
    try {
      const session = await api('GET', `/sessions/${state.sessionId}`);
      state.rooms = session.rooms;
      state.currentRoomId = session.rooms[0]?.id;
    } catch (e) {
      console.error('세션 로드 실패:', e);
    }
  }
  
  updateSidebarProfile();
  renderRooms();
  
  // Socket.io 연결
  socket = io();
  
  socket.on('connect', () => {
    socket.emit('join:session', {
      sessionId: state.sessionId,
      userId: state.userId
    });
  });
  
  socket.on('users:online', (users) => {
    state.onlineUsers = users;
    elements.onlineCount.textContent = users.length;
  });
  
  socket.on('message:new', (message) => {
    if (message.room_id === state.currentRoomId) {
      appendMessage(message);
      scrollToBottom();
    }
  });
  
  socket.on('message:updated', (message) => {
    updateMessageInList(message);
  });
  
  socket.on('message:deleted', ({ id, roomId }) => {
    if (roomId === state.currentRoomId) {
      removeMessageFromList(id);
    }
  });
  
  socket.on('room:created', (room) => {
    // 중복 체크
    if (!state.rooms.find(r => r.id === room.id)) {
      state.rooms.push(room);
      renderRooms();
      
      // 본인이 만든 방이면 선택
      if (pendingRoomSelect === room.id) {
        selectRoom(room.id);
        pendingRoomSelect = null;
      }
    }
  });
  
  socket.on('room:updated', (room) => {
    const idx = state.rooms.findIndex(r => r.id === room.id);
    if (idx !== -1) {
      state.rooms[idx] = room;
      renderRooms();
      if (room.id === state.currentRoomId) {
        elements.currentRoomName.textContent = room.name;
      }
    }
  });
  
  socket.on('room:deleted', ({ roomId }) => {
    state.rooms = state.rooms.filter(r => r.id !== roomId);
    renderRooms();
    
    // 현재 보고 있던 방이 삭제된 경우 다른 방으로 이동
    if (roomId === state.currentRoomId && state.rooms.length > 0) {
      selectRoom(state.rooms[0].id);
    }
  });
  
  socket.on('typing:show', ({ roomId, userId, nickname }) => {
    if (roomId === state.currentRoomId && userId !== state.userId) {
      elements.typingIndicator.classList.remove('hidden');
      elements.typingIndicator.querySelector('.typing-name').textContent = nickname;
    }
  });
  
  socket.on('typing:hide', ({ roomId, userId }) => {
    if (roomId === state.currentRoomId) {
      elements.typingIndicator.classList.add('hidden');
    }
  });
  
  // URL 또는 저장된 room 파라미터 확인 (알림에서 온 경우)
  const urlParams = new URLSearchParams(window.location.search);
  const roomIdFromUrl = urlParams.get('room') || state.pendingRoomId;
  
  // 사용 후 초기화
  if (state.pendingRoomId) {
    delete state.pendingRoomId;
  }
  
  // 첫 번째 방 선택 (또는 URL에서 지정된 방)
  if (state.rooms.length > 0) {
    const targetRoomId = roomIdFromUrl || state.currentRoomId || state.rooms[0].id;
    selectRoom(targetRoomId);
  }
}

// ===== 채팅방 관리 =====
function renderRooms() {
  // 일반 방과 보관된 방 분리
  const activeRooms = state.rooms.filter(r => !r.is_archived);
  const archivedRooms = state.rooms.filter(r => r.is_archived);
  
  // 일반 채팅방 렌더링
  elements.roomsList.innerHTML = activeRooms.map(room => `
    <li class="room-item ${room.id === state.currentRoomId ? 'active' : ''}"
        data-room-id="${room.id}">
      <span class="room-icon">💬</span>
      <span class="room-name">${room.name}</span>
    </li>
  `).join('');
  
  // 보관된 채팅방 섹션
  if (archivedRooms.length > 0) {
    elements.archivedSection.classList.remove('hidden');
    elements.archivedCount.textContent = archivedRooms.length;
    elements.archivedRoomsList.innerHTML = archivedRooms.map(room => `
      <li class="room-item ${room.id === state.currentRoomId ? 'active' : ''}"
          data-room-id="${room.id}">
        <span class="room-icon">📁</span>
        <span class="room-name">${room.name}</span>
      </li>
    `).join('');
  } else {
    elements.archivedSection.classList.add('hidden');
  }
  
  // 클릭 이벤트 - 일반 방
  elements.roomsList.querySelectorAll('.room-item').forEach(item => {
    item.addEventListener('click', () => {
      selectRoom(item.dataset.roomId);
    });
  });
  
  // 클릭 이벤트 - 보관된 방
  elements.archivedRoomsList.querySelectorAll('.room-item').forEach(item => {
    item.addEventListener('click', () => {
      selectRoom(item.dataset.roomId);
    });
  });
}

async function selectRoom(roomId) {
  state.currentRoomId = roomId;
  
  // UI 업데이트 - 모든 방 리스트에서 active 토글
  document.querySelectorAll('.room-item').forEach(item => {
    item.classList.toggle('active', item.dataset.roomId === roomId);
  });
  
  const room = state.rooms.find(r => r.id === roomId);
  if (room) {
    elements.currentRoomName.textContent = room.name;
    updateArchiveButton();
  }
  
  // 모바일: 채팅 영역으로 전환
  showChatMobile();
  
  // 메시지 로드
  try {
    const messages = await api('GET', `/rooms/${roomId}/messages`);
    state.messages = messages;
    renderMessages();
    scrollToBottom();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function createRoom() {
  const name = elements.newRoomNameInput.value.trim();
  if (!name) {
    showToast('채팅방 이름을 입력하세요.', 'error');
    return;
  }
  
  try {
    const room = await api('POST', `/sessions/${state.sessionId}/rooms`, { name });
    // socket 이벤트로 추가되므로 여기서는 추가하지 않음
    // 대신 socket 이벤트에서 추가 후 선택하도록 room.id 저장
    pendingRoomSelect = room.id;
    hideModal('new-room-modal');
    elements.newRoomNameInput.value = '';
    showToast('채팅방이 생성되었습니다.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function updateRoomName() {
  const name = elements.roomNameInput.value.trim();
  if (!name) {
    showToast('채팅방 이름을 입력하세요.', 'error');
    return;
  }
  
  try {
    await api('PATCH', `/rooms/${state.currentRoomId}`, { name });
    const room = state.rooms.find(r => r.id === state.currentRoomId);
    if (room) {
      room.name = name;
      elements.currentRoomName.textContent = name;
      renderRooms();
    }
    hideModal('room-edit-modal');
    showToast('채팅방 이름이 변경되었습니다.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function toggleArchiveRoom() {
  const room = state.rooms.find(r => r.id === state.currentRoomId);
  if (!room) return;
  
  const isCurrentlyArchived = room.is_archived;
  const action = isCurrentlyArchived ? '보관 해제' : '보관';
  
  if (!confirm(`이 채팅방을 ${action}하시겠습니까?`)) return;
  
  try {
    await api('PATCH', `/rooms/${state.currentRoomId}`, { isArchived: !isCurrentlyArchived });
    room.is_archived = !isCurrentlyArchived;
    renderRooms();
    updateArchiveButton();
    showToast(`채팅방이 ${action}되었습니다.`, 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function updateArchiveButton() {
  const room = state.rooms.find(r => r.id === state.currentRoomId);
  if (room && room.is_archived) {
    elements.btnArchiveRoom.innerHTML = '📂 보관 해제';
  } else {
    elements.btnArchiveRoom.innerHTML = '📁 보관';
  }
}

async function exportRoom() {
  try {
    const response = await fetch(`/api/rooms/${state.currentRoomId}/export`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    showToast('백업 파일이 다운로드되었습니다.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// 채팅방 삭제 관련
let deletingRoomId = null;

function showDeleteRoomModal(roomId, roomName) {
  deletingRoomId = roomId;
  document.getElementById('delete-room-name').textContent = `"${roomName}"`;
  showModal('room-delete-modal');
}

async function deleteRoom() {
  if (!deletingRoomId) return;
  
  try {
    await api('DELETE', `/rooms/${deletingRoomId}`);
    hideModal('room-delete-modal');
    showToast('채팅방이 삭제되었습니다.', 'success');
    deletingRoomId = null;
  } catch (error) {
    showToast('채팅방 삭제에 실패했습니다.', 'error');
  }
}

// ===== 메시지 관리 =====
function renderMessages() {
  elements.messagesList.innerHTML = state.messages.map(msg => createMessageHTML(msg)).join('');
  
  // 수정 버튼 이벤트
  elements.messagesList.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditMessage(btn.dataset.messageId);
    });
  });
}

function createMessageHTML(msg) {
  // 같은 유저 또는 같은 계정이면 수정 가능
  const isMine = msg.user_id === state.userId || 
    (state.account && msg.account_id && msg.account_id === state.account.id);
  const avatarSrc = getAvatarSrc(msg.profile_image, msg.nickname);
  
  return `
    <div class="message ${isMine ? 'mine' : ''}" data-message-id="${msg.id}">
      <img class="avatar" src="${avatarSrc}" alt="${msg.nickname}">
      <div class="content">
        <span class="sender">${msg.nickname}</span>
        <div class="bubble">${escapeHTML(msg.content)}</div>
        <div class="meta">
          <span class="time">${formatTime(msg.created_at)}</span>
          ${msg.is_edited ? '<span class="edited-badge">(수정됨)</span>' : ''}
          ${isMine ? `<button class="edit-btn" data-message-id="${msg.id}">수정</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML.replace(/\n/g, '<br>');
}

function appendMessage(msg) {
  const html = createMessageHTML(msg);
  elements.messagesList.insertAdjacentHTML('beforeend', html);
  
  // 수정 버튼 이벤트
  const newMsg = elements.messagesList.lastElementChild;
  const editBtn = newMsg.querySelector('.edit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditMessage(editBtn.dataset.messageId);
    });
  }
  
  state.messages.push(msg);
}

function updateMessageInList(msg) {
  const msgEl = elements.messagesList.querySelector(`[data-message-id="${msg.id}"]`);
  if (msgEl) {
    const bubble = msgEl.querySelector('.bubble');
    bubble.innerHTML = escapeHTML(msg.content);
    
    const meta = msgEl.querySelector('.meta');
    if (!meta.querySelector('.edited-badge')) {
      meta.insertAdjacentHTML('afterbegin', '<span class="edited-badge">(수정됨)</span>');
    }
  }
  
  // state 업데이트
  const idx = state.messages.findIndex(m => m.id === msg.id);
  if (idx !== -1) {
    state.messages[idx] = msg;
  }
}

function scrollToBottom() {
  elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

async function sendMessage() {
  const content = elements.messageInput.value.trim();
  if (!content) return;
  
  socket.emit('message:send', {
    roomId: state.currentRoomId,
    userId: state.userId,
    content
  });
  
  elements.messageInput.value = '';
  elements.messageInput.style.height = 'auto';
  elements.btnSend.disabled = true;
}

let editingMessageId = null;

function openEditMessage(messageId) {
  const msg = state.messages.find(m => m.id === messageId);
  if (!msg) return;
  
  editingMessageId = messageId;
  elements.editMessageInput.value = msg.content;
  showModal('message-edit-modal');
}

async function saveEditedMessage() {
  const content = elements.editMessageInput.value.trim();
  if (!content || !editingMessageId) return;
  
  try {
    await api('PATCH', `/messages/${editingMessageId}`, { content });
    hideModal('message-edit-modal');
    editingMessageId = null;
    showToast('메시지가 수정되었습니다.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteMessageById() {
  if (!editingMessageId) return;
  
  if (!confirm('이 메시지를 삭제하시겠습니까?')) return;
  
  try {
    await api('DELETE', `/messages/${editingMessageId}`);
    hideModal('message-edit-modal');
    editingMessageId = null;
    showToast('메시지가 삭제되었습니다.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function removeMessageFromList(messageId) {
  const msgEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
  if (msgEl) {
    msgEl.remove();
  }
  state.messages = state.messages.filter(m => m.id !== messageId);
}

// ===== 타이핑 표시 =====
let typingTimeout = null;

function handleTyping() {
  if (!typingTimeout) {
    socket.emit('typing:start', {
      roomId: state.currentRoomId,
      userId: state.userId,
      nickname: state.user?.nickname
    });
  }
  
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('typing:stop', {
      roomId: state.currentRoomId,
      userId: state.userId
    });
    typingTimeout = null;
  }, 2000);
}

// ===== 링크 공유 =====
function shareLink() {
  const url = `${window.location.origin}/chat/${state.sessionId}`;
  
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('링크가 클립보드에 복사되었습니다!', 'success');
    });
  } else {
    prompt('아래 링크를 복사하세요:', url);
  }
}

// ===== 이벤트 리스너 =====
function initEventListeners() {
  // 시작 화면
  elements.btnCreateSession.addEventListener('click', createSession);
  
  // 계정 관련
  elements.btnShowLogin.addEventListener('click', () => showScreen('login-screen'));
  elements.btnShowRegister.addEventListener('click', () => showScreen('register-screen'));
  elements.btnBackLogin.addEventListener('click', () => showScreen('welcome-screen'));
  elements.btnBackRegister.addEventListener('click', () => showScreen('welcome-screen'));
  if (elements.btnBackForgot) {
    elements.btnBackForgot.addEventListener('click', () => showScreen('login-screen'));
  }
  elements.btnBackMyChats.addEventListener('click', () => showScreen('welcome-screen'));
  // 비밀번호 찾기 버튼 (있으면)
  if (elements.btnForgotPassword) {
    elements.btnForgotPassword.addEventListener('click', (e) => {
      e.preventDefault();
      showScreen('forgot-screen');
    });
  }
  elements.btnLogout.addEventListener('click', () => {
    clearAccount();
    showToast('로그아웃되었습니다.', 'success');
  });
  elements.btnMyChats.addEventListener('click', loadMyChats);
  
  // 폼 제출
  elements.loginForm.addEventListener('submit', handleLogin);
  elements.registerForm.addEventListener('submit', handleRegister);
  if (elements.forgotForm) {
    elements.forgotForm.addEventListener('submit', handleForgotPassword);
  }
  
  // 프로필 설정
  elements.profileImageWrapper.addEventListener('click', () => {
    elements.profileImageInput.click();
  });
  
  elements.profileImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        elements.profilePreview.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  });
  
  elements.btnSaveProfile.addEventListener('click', saveProfile);
  
  elements.telegramHelpLink.addEventListener('click', (e) => {
    e.preventDefault();
    showModal('telegram-modal');
  });
  
  // 사이드바
  elements.btnEditProfile.addEventListener('click', () => {
    elements.editNicknameInput.value = state.user?.nickname || '';
    elements.editTelegramInput.value = state.user?.telegram_chat_id || '';
    elements.editProfilePreview.src = getAvatarSrc(state.user?.profile_image, state.user?.nickname);
    showModal('profile-edit-modal');
  });
  
  elements.editProfileImageWrapper.addEventListener('click', () => {
    elements.editProfileImageInput.click();
  });
  
  elements.editProfileImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        elements.editProfilePreview.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  });
  
  elements.btnUpdateProfile.addEventListener('click', updateProfile);
  
  elements.btnAddRoom.addEventListener('click', () => {
    elements.newRoomNameInput.value = '';
    showModal('new-room-modal');
  });
  
  elements.btnCreateRoom.addEventListener('click', createRoom);
  
  elements.btnShareLink.addEventListener('click', shareLink);
  
  // 채팅 화면 로그아웃
  elements.btnLogoutChat.addEventListener('click', () => {
    if (confirm('로그아웃하시겠습니까?')) {
      clearAccount();
      window.location.href = '/';
    }
  });
  
  // 모바일 뒤로가기 (사이드바로 돌아가기)
  elements.btnBackToSidebar.addEventListener('click', showSidebarMobile);
  
  // 보관된 섹션 접기/펼치기
  elements.archivedHeader.addEventListener('click', () => {
    elements.archivedSection.classList.toggle('collapsed');
  });
  
  // 채팅 헤더
  elements.btnEditRoom.addEventListener('click', () => {
    const room = state.rooms.find(r => r.id === state.currentRoomId);
    elements.roomNameInput.value = room?.name || '';
    showModal('room-edit-modal');
  });
  
  elements.btnSaveRoomName.addEventListener('click', updateRoomName);
  elements.btnExportRoom.addEventListener('click', exportRoom);
  elements.btnArchiveRoom.addEventListener('click', toggleArchiveRoom);
  
  // 채팅방 삭제 버튼 (헤더)
  elements.btnDeleteRoom.addEventListener('click', () => {
    const room = state.rooms.find(r => r.id === state.currentRoomId);
    if (room) {
      showDeleteRoomModal(room.id, room.name);
    }
  });
  
  // 채팅방 삭제 확인 (모달)
  document.getElementById('btn-confirm-delete-room').addEventListener('click', deleteRoom);
  
  // 메시지 입력
  elements.messageInput.addEventListener('input', () => {
    elements.btnSend.disabled = !elements.messageInput.value.trim();
    
    // 자동 높이 조절
    elements.messageInput.style.height = 'auto';
    elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 120) + 'px';
    
    handleTyping();
  });
  
  elements.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  elements.btnSend.addEventListener('click', sendMessage);
  
  // 메시지 수정/삭제
  elements.btnSaveMessage.addEventListener('click', saveEditedMessage);
  elements.btnDeleteMessage.addEventListener('click', deleteMessageById);
  
  // 모달 닫기
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal').classList.add('hidden');
    });
  });
  
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', () => {
      backdrop.closest('.modal').classList.add('hidden');
    });
  });
  
  // Enter 키로 모달 제출
  elements.roomNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') updateRoomName();
  });
  
  elements.newRoomNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createRoom();
  });
  
  elements.nicknameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveProfile();
  });
}

// ===== 초기화 =====
// ===== 계정 관리 =====
function loadAccount() {
  const saved = localStorage.getItem('account');
  if (saved) {
    state.account = JSON.parse(saved);
    updateAccountUI();
  }
}

function saveAccount(account) {
  state.account = account;
  localStorage.setItem('account', JSON.stringify(account));
  updateAccountUI();
}

function clearAccount() {
  state.account = null;
  localStorage.removeItem('account');
  updateAccountUI();
}

function updateAccountUI() {
  if (state.account) {
    elements.accountStatus.classList.remove('hidden');
    elements.loggedInName.textContent = state.account.nickname || state.account.username;
    elements.authButtons.classList.add('hidden');
    elements.btnMyChats.classList.remove('hidden');
  } else {
    elements.accountStatus.classList.add('hidden');
    elements.authButtons.classList.remove('hidden');
    elements.btnMyChats.classList.add('hidden');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  
  const username = elements.loginUsername.value.trim();
  const password = elements.loginPassword.value;
  
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error);
    }
    
    saveAccount(data);
    showToast('로그인되었습니다!', 'success');
    elements.loginForm.reset();
    
    // 대기 중인 세션이 있으면 그 세션으로 이동
    if (pendingSessionId) {
      const sessionId = pendingSessionId;
      pendingSessionId = null;
      joinSession(sessionId);
    } else {
      showScreen('welcome-screen');
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  
  const username = elements.registerUsername.value.trim();
  const email = elements.registerEmail.value.trim();
  const password = elements.registerPassword.value;
  const nickname = elements.registerNickname.value.trim() || username;
  const telegramChatId = elements.registerTelegram?.value.trim() || '';
  
  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, nickname, telegramChatId })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error);
    }
    
    saveAccount(data);
    showToast('회원가입 완료! 환영합니다!', 'success');
    elements.registerForm.reset();
    
    // 대기 중인 세션이 있으면 그 세션으로 이동
    if (pendingSessionId) {
      const sessionId = pendingSessionId;
      pendingSessionId = null;
      joinSession(sessionId);
    } else {
      showScreen('welcome-screen');
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleForgotPassword(e) {
  e.preventDefault();
  
  const email = elements.forgotEmail.value.trim();
  
  try {
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error);
    }
    
    showToast('이메일이 발송되었습니다. 메일함을 확인하세요!', 'success');
    showScreen('welcome-screen');
    if (elements.forgotForm) elements.forgotForm.reset();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadMyChats() {
  if (!state.account) return;
  
  try {
    const sessions = await api('GET', `/accounts/${state.account.id}/sessions`);
    
    if (sessions.length === 0) {
      elements.myChatsList.innerHTML = '';
      elements.noChatsMessage.classList.remove('hidden');
    } else {
      elements.noChatsMessage.classList.add('hidden');
      elements.myChatsList.innerHTML = sessions.map(s => `
        <div class="my-chat-item" data-session-id="${s.id}">
          <span class="chat-icon">💬</span>
          <div class="chat-info">
            <div class="chat-name">${s.first_room_name || '채팅'}</div>
            <div class="chat-meta">채팅방 ${s.room_count}개 · ${formatDate(s.joined_at)}</div>
          </div>
        </div>
      `).join('');
      
      // 클릭 이벤트
      elements.myChatsList.querySelectorAll('.my-chat-item').forEach(item => {
        item.addEventListener('click', () => {
          window.location.href = `/chat/${item.dataset.sessionId}`;
        });
      });
    }
    
    showScreen('my-chats-screen');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function init() {
  initEventListeners();
  
  // 계정 로드
  loadAccount();
  
  // 기본 프로필 이미지 설정
  elements.profilePreview.src = getDefaultAvatar('?');
  elements.sidebarProfileImage.src = getDefaultAvatar('?');
  elements.editProfilePreview.src = getDefaultAvatar('?');
  
  // URL에서 세션 ID 확인
  const path = window.location.pathname;
  const match = path.match(/^\/chat\/([a-f0-9-]+)$/i);
  
  if (match) {
    const sessionId = match[1];
    // 로그인 되어있으면 바로 입장, 아니면 로그인 화면
    if (state.account) {
      joinSession(sessionId);
    } else {
      pendingSessionId = sessionId;
      showScreen('login-screen');
      showToast('채팅방에 입장하려면 로그인이 필요합니다.', 'info');
    }
  } else {
    showScreen('welcome-screen');
  }
}

// DOM 로드 후 초기화
document.addEventListener('DOMContentLoaded', init);

