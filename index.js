require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const config = require('./src/config/config');
const { Server } = require('socket.io');
const PORT = process.env.PORT || 3002;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ['GET','POST','PUT','DELETE','OPTIONS']
  }
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log('Socket connected', socket.id);
  // Clients join rooms so we can target by ward/user/role
  socket.on('join', ({ ward, userId, role }) => {
    try {
      if (ward) socket.join(`ward:${ward}`);
      if (userId) socket.join(`user:${userId}`);
      if (role === 'president') socket.join('president');
      if (role === 'councillor') socket.join('councillors');
    } catch (_) {}
  });

  // Delivery and read acknowledgements
  socket.on('message:delivered', async ({ messageId, userId }) => {
    try {
      const Message = require('./src/models/Message');
      await Message.updateOne({ _id: messageId }, { $addToSet: { deliveredTo: userId } });
    } catch {}
  });
  socket.on('message:read', async ({ messageId, userId }) => {
    try {
      const Message = require('./src/models/Message');
      await Message.updateOne({ _id: messageId }, { $addToSet: { readBy: userId }, $set: { isRead: true } });
    } catch {}
  });
  socket.on('disconnect', () => console.log('Socket disconnected', socket.id));
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
