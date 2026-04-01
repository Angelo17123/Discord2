require('dotenv').config();
const WebSocket = require('ws');

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;

let ws;
let heartbeatInterval = null;
let sequence = null;
let sessionId = null;
let userId = null;
let currentVoiceChannel = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 10;

function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function startHeartbeat(interval) {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    send({ op: 1, d: sequence });
  }, interval);
}

function identify() {
  send({
    op: 2,
    d: {
      token: TOKEN,
      properties: {
        os: 'windows',
        browser: 'chrome',
        device: 'chrome',
      },
      intents: 0,
    },
  });
}

function joinVoiceChannel(guildId, channelId) {
  send({
    op: 4,
    d: {
      guild_id: guildId,
      channel_id: channelId,
      self_mute: true,
      self_deaf: true,
    },
  });
  currentVoiceChannel = channelId;
  if (channelId) {
    console.log(`[VOICE] Joined channel ${channelId} (muted + deafened)`);
  } else {
    console.log('[VOICE] Disconnected from voice');
  }
}

function connect() {
  if (reconnectAttempts >= MAX_RECONNECT) {
    console.log('[GATEWAY] Max reconnect attempts reached. Stopping.');
    process.exit(1);
  }

  ws = new WebSocket('wss://gateway.discord.gg/?v=9&encoding=json');

  ws.on('open', () => {
    console.log('[GATEWAY] Connected');
    reconnectAttempts = 0;
  });

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    const { op, d, t, s } = message;

    if (s !== null && s !== undefined) {
      sequence = s;
    }

    switch (op) {
      case 10: {
        console.log(`[GATEWAY] HELLO - heartbeat: ${d.heartbeat_interval}ms`);
        startHeartbeat(d.heartbeat_interval);
        identify();
        break;
      }

      case 11: {
        break;
      }

      case 0: {
        if (t === 'READY') {
          userId = d.user.id;
          sessionId = d.session_id;
          console.log(`[READY] ${d.user.username}#${d.user.discriminator} (${d.user.id})`);
          console.log(`[VOICE] Joining channel ${TARGET_CHANNEL_ID}...`);
          joinVoiceChannel(GUILD_ID, TARGET_CHANNEL_ID);
          console.log('[BOT] Bot is now deafened and will stay permanently in the target channel.');
          console.log('[BOT] Commands: !move <channel_id>, !leave');
        }

        if (t === 'VOICE_STATE_UPDATE' && d.user_id === userId) {
          if (d.channel_id !== currentVoiceChannel) {
            console.log(`[VOICE_STATE] Channel changed to: ${d.channel_id || 'disconnected'}`);
          }
        }

        if (t === 'VOICE_SERVER_UPDATE') {
          console.log(`[VOICE_SERVER] Connected to: ${d.endpoint}`);
        }

        break;
      }

      case 7: {
        console.log('[GATEWAY] Reconnect requested');
        ws.close();
        setTimeout(connect, 1000);
        break;
      }

      case 9: {
        console.log('[GATEWAY] Invalid session, re-identifying...');
        setTimeout(identify, 5000);
        break;
      }
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[GATEWAY] Closed - Code: ${code}`);
    if (heartbeatInterval) clearInterval(heartbeatInterval);

    if (code !== 1000 && code !== 4004) {
      reconnectAttempts++;
      const delay = Math.min(5000 * reconnectAttempts, 30000);
      console.log(`[GATEWAY] Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT})...`);
      setTimeout(connect, delay);
    } else if (code === 4004) {
      console.log('[GATEWAY] Authentication failed. Check your token.');
      process.exit(1);
    }
  });

  ws.on('error', (err) => {
    console.error('[GATEWAY] Error:', err.message);
  });
}

process.stdin.on('data', (data) => {
  const input = data.toString().trim();
  const parts = input.split(/\s+/);

  if (parts[0] === '!move' && parts[1]) {
    console.log(`[CMD] Moving to ${parts[1]}`);
    joinVoiceChannel(GUILD_ID, parts[1]);
  }

  if (parts[0] === '!leave') {
    console.log('[CMD] Disconnecting from voice');
    joinVoiceChannel(GUILD_ID, null);
  }

  if (parts[0] === '!status') {
    console.log(`[STATUS] Voice channel: ${currentVoiceChannel || 'none'}`);
  }
});

process.on('SIGINT', () => {
  console.log('\n[BOT] Shutting down...');
  if (currentVoiceChannel) {
    joinVoiceChannel(GUILD_ID, null);
  }
  if (ws) ws.close();
  process.exit(0);
});

connect();
