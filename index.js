const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const app = express();
app.use(express.static(path.join(__dirname)));
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const chatRooms = {};        
const chatHistory = {};      
const userMap = new Map();   
const roomCreators = {};     
function broadcast(chatId, payload) {
    if (!chatRooms[chatId]) return;
    chatRooms[chatId].forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(payload));
        }
    });
}
function safeParticipants(chatId) {
    if (!chatRooms[chatId]) return [];
    return [...chatRooms[chatId]]
        .map(ws => userMap.get(ws)?.username)
        .filter(Boolean);
}
wss.on('connection', (ws) => {
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            if (msg.type === 'join') {
                const { username, chatId } = msg;
                userMap.set(ws, { username, chatId });
                if (!chatRooms[chatId]) {
                    chatRooms[chatId] = new Set();
                    chatHistory[chatId] = [];
                    roomCreators[chatId] = ws;   
                }
                chatRooms[chatId].add(ws);
                ws.send(JSON.stringify({
                    type: 'role',
                    role: roomCreators[chatId] === ws ? 'creator' : 'member'
                }));
                chatHistory[chatId]?.forEach(m => {
                    ws.send(JSON.stringify({ type: 'message', ...m }));
                });
                broadcast(chatId, { type: 'join', username });
                broadcast(chatId, {
                    type: 'participants',
                    list: safeParticipants(chatId)
                });
            }
            else if (msg.type === 'message') {
                const user = userMap.get(ws);
                if (!user) return;
                const payload = {
                    username: user.username,
                    message: msg.message,
                    date: Date.now()
                };
                if (chatHistory[user.chatId]) chatHistory[user.chatId].push(payload);
                broadcast(user.chatId, { type: 'message', ...payload });
            }
            else if (msg.type === 'typing') {
                const user = userMap.get(ws);
                if (!user) return;
                broadcast(user.chatId, {
                    type: 'typing',
                    username: user.username,
                    typing: msg.typing
                });
            }
            else if (msg.type === 'close-room') {
                const { chatId } = msg;
                if (roomCreators[chatId] !== ws) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Not creator' }));
                    return;
                }
                broadcast(chatId, { type: 'room-closed' });
                chatRooms[chatId]?.forEach(client => client.close());
                delete chatRooms[chatId];
                delete chatHistory[chatId];
                delete roomCreators[chatId];
                console.log(`Room ${chatId} closed`);
            }
        } catch (err) {
            console.error('WS error:', err);
        }
    });
    ws.on('close', () => {
        const user = userMap.get(ws);
        if (!user) return;
        const { chatId, username } = user;
        if (chatRooms[chatId]) {
            chatRooms[chatId].delete(ws);

            broadcast(chatId, { type: 'leave', username });
            broadcast(chatId, { type: 'participants', list: safeParticipants(chatId) });
            if (chatRooms[chatId].size === 0) {
                delete chatRooms[chatId];
                delete chatHistory[chatId];
                delete roomCreators[chatId];
                console.log(`Room ${chatId} deleted (empty)`);
            }
        }
        userMap.delete(ws);
    });
    ws.on('error', (err) => {
        console.error('WS client error:', err);
    });
});

server.listen(8080, () => {
    console.log('Server running on http://localhost:8080');
});


