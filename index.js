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
  socket.on('disconnect', () => console.log('Socket disconnected', socket.id));
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
