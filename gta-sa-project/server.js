const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

let rooms = {};

wss.on('connection', (ws) => {
    let currentRoom = null;
    let myRole = null;

    // Ping-pong reaalajas mänguviivituse (pingi) mõõtmiseks
    const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong' }));
        }
    }, 2000);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // 1. Toa loomine (Host)
            if (data.type === 'create_room') {
                const code = Math.random().toString(36).substring(2, 8).toUpperCase();
                rooms[code] = { 
                    host: ws, 
                    guest: null, 
                    seed: Math.floor(Math.random() * 100000),
                    hostKills: 0,
                    guestKills: 0
                };
                currentRoom = code;
                myRole = 'host';
                ws.send(JSON.stringify({ type: 'room_created', code: code }));
            } 
            
            // 2. Toaga liitumine (Guest)
            else if (data.type === 'join_room') {
                const room = rooms[data.code];
                if (room && !room.guest) {
                    room.guest = ws;
                    currentRoom = data.code;
                    myRole = 'guest';
                    
                    // Saadetakse mõlemale mängijale signaal mängu alustamiseks
                    room.host.send(JSON.stringify({ type: 'start_game', role: 'host', seed: room.seed }));
                    room.guest.send(JSON.stringify({ type: 'start_game', role: 'guest', seed: room.seed }));
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Tuba ei leitud või on täis!' }));
                }
            } 
            
            // 3. Tapmiste ja skoori sünkroniseerimine
            else if (data.type === 'kill') {
                const room = rooms[currentRoom];
                if (room) {
                    if (myRole === 'host') room.guestKills++;
                    else room.hostKills++;

                    const syncKill = {
                        type: 'kill',
                        killer: data.killer,
                        victim: data.victim,
                        weapon: data.weapon,
                        myKills: myRole === 'host' ? room.hostKills : room.guestKills,
                        oppKills: myRole === 'host' ? room.guestKills : room.hostKills
                    };
                    
                    if (room.host && room.host.readyState === WebSocket.OPEN) room.host.send(JSON.stringify(syncKill));
                    if (room.guest && room.guest.readyState === WebSocket.OPEN) room.guest.send(JSON.stringify(syncKill));
                }
            }
            
            // 4. Kõik muud reaalajas andmed (asukohad, tulistamine, chat jne)
            else {
                const room = rooms[currentRoom];
                if (room) {
                    const target = (myRole === 'host') ? room.guest : room.host;
                    if (target && target.readyState === WebSocket.OPEN) {
                        target.send(message);
                    }
                }
            }
        } catch (e) {
            console.error("Viga andmete töötlemisel:", e);
        }
    });

    ws.on('close', () => {
        clearInterval(pingInterval);
        if (currentRoom && rooms[currentRoom]) {
            const room = rooms[currentRoom];
            const opponent = (myRole === 'host') ? room.guest : room.host;
            if (opponent && opponent.readyState === WebSocket.OPEN) {
                opponent.send(JSON.stringify({ type: 'chat', name: 'Süsteem', message: 'Vastane lahkus mängust.', color: '#ff0000' }));
            }
            delete rooms[currentRoom];
        }
    });
});

console.log(`GTA:SA server on käivitatud pordil ${PORT}`);