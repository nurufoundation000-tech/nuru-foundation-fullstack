// lib/socket.js - Socket.IO real-time notification service (CommonJS)
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io = null;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: [
        'https://nurufoundations.com',
        'https://www.nurufoundations.com',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:5000'
      ],
      credentials: true
    },
    path: '/socket.io'
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log('[Socket] User connected:', socket.userId);
    socket.join(`user:${socket.userId}`);

    socket.on('disconnect', () => {
      console.log('[Socket] User disconnected:', socket.userId);
    });
  });

  console.log('[Socket] Socket.IO initialized');
  return io;
}

function getIO() {
  return io;
}

function emitToUser(userId, event, data) {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
}

module.exports = { initSocket, getIO, emitToUser };
