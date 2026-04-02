require('dotenv').config();
const WebSocket = require('ws');

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;

let ws = null;
let heartbeatInterval = null;
let sequence = null;
let sessionId = null;
let userId = null;
let currentVoiceChannel = null;
let reconnectAttempts = 0;
let resumeGatewayUrl = null;
const MAX_RECONNECT = 10;
let shuttingDown = false;
let reconnectTimer = null;
let explicitReconnect = false;

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

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

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function identify() {
  send({
    op: 2,
    d: {
      token: TOKEN,
      properties: { os: 'linux', browser: 'chrome', device: 'chrome' },
      intents: 0,
    },
  });
}

function resume() {
  send({
    op: 6,
    d: {
      token: TOKEN,
      session_id: sessionId,
      seq: sequence,
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

function disconnectVoice(guildId) {
  send({
    op: 4,
    d: {
      guild_id: guildId,
      channel_id: null,
      self_mute: false,
      self_deaf: false,
    },
  });
  currentVoiceChannel = null;
  console.log('[VOICE] Disconnected from voice');
}

function destroyWs() {
  stopHeartbeat();
  clearReconnectTimer();
  if (ws) {
    ws.removeAllListeners();
    ws.terminate();
    ws = null;
  }
}

function scheduleReconnect(delay) {
  clearReconnectTimer();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function connect() {
  if (shuttingDown) return;

  destroyWs();

  if (reconnectAttempts >= MAX_RECONNECT) {
    console.log('[GATEWAY] Max reconnect attempts reached. Stopping.');
    process.exit(1);
  }

  const gatewayUrl = resumeGatewayUrl || 'wss://gateway.discord.gg/?v=9&encoding=json';
  ws = new WebSocket(gatewayUrl);

  ws.on('open', () => {
    console.log('[GATEWAY] Connected');
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
        resumeGatewayUrl = d.resume_gateway_url;
        startHeartbeat(d.heartbeat_interval);

        if (sessionId && sequence !== null) {
          console.log('[GATEWAY] Resuming session...');
          resume();
        } else {
          console.log('[GATEWAY] Identifying...');
          identify();
        }
        break;
      }

      case 11: {
        break;
      }

      case 0: {
        if (t === 'READY') {
          userId = d.user.id;
          sessionId = d.session_id;
          reconnectAttempts = 0;
          console.log(`[READY] ${d.user.username}#${d.user.discriminator} (${d.user.id})`);
          console.log(`[VOICE] Joining channel ${TARGET_CHANNEL_ID}...`);
          joinVoiceChannel(GUILD_ID, TARGET_CHANNEL_ID);
          console.log('[BOT] Bot is now muted + deafened and will stay permanently in the target channel.');
          console.log('[BOT] Commands: !move <channel_id>, !leave');
        }

        if (t === 'RESUMED') {
          console.log('[GATEWAY] Session resumed successfully');
          reconnectAttempts = 0;
          if (currentVoiceChannel) {
            console.log(`[VOICE] Rejoining channel ${currentVoiceChannel}...`);
            joinVoiceChannel(GUILD_ID, currentVoiceChannel);
          }
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
        reconnectAttempts++;
        explicitReconnect = true;
        scheduleReconnect(1000);
        destroyWs();
        break;
      }

      case 9: {
        console.log('[GATEWAY] Invalid session. Clearing state and reconnecting...');
        sessionId = null;
        sequence = null;
        resumeGatewayUrl = null;
        currentVoiceChannel = null;
        reconnectAttempts++;
        explicitReconnect = true;
        scheduleReconnect(5000);
        destroyWs();
        break;
      }
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[GATEWAY] Closed - Code: ${code}`);
    stopHeartbeat();

    if (code === 4004) {
      console.log('[GATEWAY] Authentication failed. Check your token.');
      process.exit(1);
      return;
    }

    if (shuttingDown) return;

    if (code === 1000) {
      console.log('[GATEWAY] Clean close. Not reconnecting.');
      return;
    }

    if (explicitReconnect) {
      explicitReconnect = false;
      console.log('[GATEWAY] Reconnect already scheduled, skipping close handler.');
      return;
    }

    if (code === 1005 || code === 1006) {
      reconnectAttempts++;
      const delay = Math.min(5000 * reconnectAttempts, 30000);
      console.log(`[GATEWAY] Abnormal close. Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT})...`);
      scheduleReconnect(delay);
    }
  });

  ws.on('error', (err) => {
    console.error('[GATEWAY] Error:', err.message);
  });
}

if (process.stdin.isTTY || process.stdin.readable) {
  process.stdin.on('data', (data) => {
    const input = data.toString().trim();
    const parts = input.split(/\s+/);

    if (parts[0] === '!move' && parts[1]) {
      console.log(`[CMD] Moving to ${parts[1]}`);
      joinVoiceChannel(GUILD_ID, parts[1]);
    }

    if (parts[0] === '!leave') {
      console.log('[CMD] Disconnecting from voice');
      disconnectVoice(GUILD_ID);
    }

    if (parts[0] === '!status') {
      console.log(`[STATUS] Voice channel: ${currentVoiceChannel || 'none'}`);
    }
  });
}

function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[BOT] Received ${signal}. Shutting down gracefully...`);
  if (currentVoiceChannel) {
    disconnectVoice(GUILD_ID);
  }
  destroyWs();
  setTimeout(() => {
    console.log('[BOT] Shutdown complete.');
    process.exit(0);
  }, 2000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

connect();
