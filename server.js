const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// Храним участников в объекте для удобства
let participants = {}; 
let availableRoles = [1, 2]; // Доступные роли

io.on('connection', (socket) => {
  console.log('Подключился:', socket.id);

  if (Object.keys(participants).length >= 2) {
    socket.emit('status', 'busy');
    socket.disconnect();
    return;
  }

  // Выдаем свободную роль (1 или 2)
  const role = availableRoles.shift();
  participants[socket.id] = { id: socket.id, role: role, isReady: false };
  socket.role = role;

  socket.emit('status', 'connected', role);

  // Клиент сообщает, что получил доступ к камере
  socket.on('media-ready', () => {
    if (participants[socket.id]) {
      participants[socket.id].isReady = true;
    }

    const users = Object.values(participants);
    // Если оба тут и оба с камерами — начинаем звонок
    if (users.length === 2 && users[0].isReady && users[1].isReady) {
      // Находим абонента 1 и говорим ему начать звонок
      const caller = users.find(u => u.role === 1) || users[0];
      io.to(caller.id).emit('start-call');
    }
  });

  // Signaling WebRTC
  socket.on('offer', (offer) => {
    socket.broadcast.emit('offer', offer);
  });

  socket.on('answer', (answer) => {
    socket.broadcast.emit('answer', answer);
  });

  socket.on('ice-candidate', (candidate) => {
    socket.broadcast.emit('ice-candidate', candidate);
  });

  // Текстовый чат
  socket.on('chat', (text) => {
    socket.broadcast.emit('chat', { from: socket.role, text });
  });

  socket.on('disconnect', () => {
    console.log('Отключился:', socket.id);
    if (participants[socket.id]) {
      // Возвращаем роль в пул свободных и сортируем (чтобы 1 всегда была первой)
      availableRoles.push(participants[socket.id].role);
      availableRoles.sort();
      delete participants[socket.id];
    }
    // Сообщаем оставшемуся собеседнику, что звонок сброшен
    socket.broadcast.emit('reset');
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));