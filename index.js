// const express = require('express');
// const path = require('path');
// const http = require('http');
// const WebSocket = require('ws');
// const app = express();
// app.use(express.static(path.join(__dirname)));
// const server = http.createServer(app);
// const wss = new WebSocket.Server({ server});
// const chatRooms = {};         
// const chatHistory = {};      
// const userMap = new Map();    
// wss.on('connection', (ws) => {
//   ws.on('message', (data) => {
//     try {
//       const msg = JSON.parse(data);
//       if (msg.type === 'join') {
//         const { username, chatId } = msg;
//         userMap.set(ws, { username, chatId });
//         if (!chatRooms[chatId]) {
//           chatRooms[chatId] = new Set();
//         }
//         chatRooms[chatId].add(ws);
//         if (chatHistory[chatId]) {
//           chatHistory[chatId].forEach(message => {
//             ws.send(JSON.stringify(message));
//           });
//         }

//       } else if (msg.type === 'message') {
//         const user = userMap.get(ws);
//         if (user) {
//           const fullMsg = {
//             username: user.username,
//             message: msg.message,
//             chatId: user.chatId,
//             date:Date.now()
//           };
//           if (!chatHistory[user.chatId]) {
//             chatHistory[user.chatId] = [];
//           }
//           chatHistory[user.chatId].push(fullMsg);
//           chatRooms[user.chatId]?.forEach(client => {
//             if (client.readyState === WebSocket.OPEN) {
//               client.send(JSON.stringify(fullMsg));
//             }
//           });
//         }
//       }else if (msg.type === 'close-room') {
//       const { chatId } = msg;
//       chatRooms[chatId]?.forEach(client => {
//         if (client.readyState === WebSocket.OPEN) {
//           client.send(JSON.stringify({ type: 'room-closed', chatId }));
//           client.close();
//         }
//       });
//       delete chatRooms[chatId];
//       delete chatHistory[chatId];
//       console.log(`🔒 Room ${chatId} was closed by its owner.`);
//     }
//     } catch (err) {
//       console.error("Error parsing message:", err);
//     }
//   });

//   ws.on('close', () => {
//     const user = userMap.get(ws);
//     if (user) {
//       chatRooms[user.chatId]?.delete(ws);
//       userMap.delete(ws);
//     }
//   });
// });
// server.listen(8080, () => {
//   console.log(`Server running at 8080`);
// });


const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const app = express();
app.use(express.static(path.join(__dirname)));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ---------------- STATE ----------------
const chatRooms = {};        // chatId → Set(ws)
const chatHistory = {};      // chatId → messages[]
const userMap = new Map();   // ws → { username, chatId }
const roomCreators = {};     // chatId → ws (creator)

// ---------------- UTILS ----------------
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

// ---------------- WS CONNECTION ----------------
wss.on('connection', (ws) => {

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);

            // ---------------- JOIN ----------------
            if (msg.type === 'join') {
                const { username, chatId } = msg;
                userMap.set(ws, { username, chatId });

                // Create room if it doesn't exist
                if (!chatRooms[chatId]) {
                    chatRooms[chatId] = new Set();
                    chatHistory[chatId] = [];
                    roomCreators[chatId] = ws;   // FIRST JOINER = CREATOR
                }

                chatRooms[chatId].add(ws);

                // Send role info to this user
                ws.send(JSON.stringify({
                    type: 'role',
                    role: roomCreators[chatId] === ws ? 'creator' : 'member'
                }));

                // Send existing chat history
                chatHistory[chatId]?.forEach(m => {
                    ws.send(JSON.stringify({ type: 'message', ...m }));
                });

                // Broadcast join
                broadcast(chatId, { type: 'join', username });

                // Send updated participants list
                broadcast(chatId, {
                    type: 'participants',
                    list: safeParticipants(chatId)
                });
            }

            // ---------------- MESSAGE ----------------
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

            // ---------------- TYPING ----------------
            else if (msg.type === 'typing') {
                const user = userMap.get(ws);
                if (!user) return;

                broadcast(user.chatId, {
                    type: 'typing',
                    username: user.username,
                    typing: msg.typing
                });
            }

            // ---------------- CLOSE ROOM ----------------
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

    // ---------------- WS CLOSE ----------------
    ws.on('close', () => {
        const user = userMap.get(ws);
        if (!user) return;

        const { chatId, username } = user;

        if (chatRooms[chatId]) {
            chatRooms[chatId].delete(ws);

            // Notify participants
            broadcast(chatId, { type: 'leave', username });

            // Update participants list
            broadcast(chatId, { type: 'participants', list: safeParticipants(chatId) });

            // Delete room if empty
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

// ---------------- SERVER ----------------
server.listen(8080, () => {
    console.log('Server running on http://localhost:8080');
});


