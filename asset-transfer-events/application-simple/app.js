const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server);
const path = require('path');

const router = require('./routes');

app.set('io', io);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', router);

server.listen(3000, () => {
  console.log('The server is running with port 3000');
});

io.on('connection', () => {
  console.log('Socket connected');
});
