# Ludo

A fun and interactive Ludo game with local and online room-code multiplayer.

## Features
- Smooth turn-based gameplay for 2-4 players (local mode)
- Online mode with room code flow:
  - Host creates room code
  - Guest joins using room code
  - Host and guest connect directly in the room
- In-game chat in online mode
- Sound effects and polished UI

## Getting Started
1. `npm install`
2. `npm run dev`
3. Open your browser and play

Build for production:
- `npm run build`

## Multiplayer Across Different Networks
For reliable join/connect between different devices on different networks, configure ICE/TURN (and optional custom PeerJS signaling) in a `.env` file:

```env
# Optional: your own PeerJS signaling server
VITE_PEERJS_HOST=
VITE_PEERJS_PORT=443
VITE_PEERJS_PATH=/
VITE_PEERJS_SECURE=true

# Recommended: include at least 1 TURN server for cross-network NAT traversal
VITE_WEBRTC_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:YOUR_TURN_HOST:3478","username":"YOUR_USERNAME","credential":"YOUR_CREDENTIAL"}]
```

Notes:
- Without TURN, some network pairs will fail to connect.
- Keep TURN credentials private (do not commit real credentials to git).
