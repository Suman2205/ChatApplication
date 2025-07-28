const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const app = express();
app.use(express.static(path.join(__dirname)));
const server = http.createServer(app);
const wss = new WebSocket.Server({ server});
const chatRooms = {};         
const chatHistory = {};      
const userMap = new Map();    
wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'join') {
        const { username, chatId } = msg;
        userMap.set(ws, { username, chatId });
        if (!chatRooms[chatId]) {
          chatRooms[chatId] = new Set();
        }
        chatRooms[chatId].add(ws);
        if (chatHistory[chatId]) {
          chatHistory[chatId].forEach(message => {
            ws.send(JSON.stringify(message));
          });
        }

      } else if (msg.type === 'message') {
        const user = userMap.get(ws);
        if (user) {
          const fullMsg = {
            username: user.username,
            message: msg.message,
            chatId: user.chatId,
            date:Date.now()
          };
          if (!chatHistory[user.chatId]) {
            chatHistory[user.chatId] = [];
          }
          chatHistory[user.chatId].push(fullMsg);
          chatRooms[user.chatId]?.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(fullMsg));
            }
          });
        }
      }else if (msg.type === 'close-room') {
      const { chatId } = msg;

      // Notify all clients in the room
      chatRooms[chatId]?.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'room-closed', chatId }));
          client.close();
        }
      });

      // Clean up memory
      delete chatRooms[chatId];
      delete chatHistory[chatId];
      console.log(`🔒 Room ${chatId} was closed by its owner.`);
    }
    } catch (err) {
      console.error("Error parsing message:", err);
    }
  });

  ws.on('close', () => {
    const user = userMap.get(ws);
    if (user) {
      chatRooms[user.chatId]?.delete(ws);
      userMap.delete(ws);
    }
  });
});
server.listen(8080, () => {
  console.log(`🚀 Server running at 8080`);
});

