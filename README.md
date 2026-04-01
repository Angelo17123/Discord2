# Discord Voice Bot

Bot de Discord que se une a un canal de voz, se mueve a otro canal y permanece permanentemente en ese canal (ensordecido).

## Requisitos

- Node.js 18+
- Una cuenta de bot de Discord con los siguientes permisos:
  - **Connect** (Conectar)
  - **Speak** (Hablar)
  - **Move Members** (Mover miembros)
  - **View Channels** (Ver canales)
- Intents habilitados en Discord Developer Portal:
  - **Server Members Intent**
  - **Presence Intent**
  - **Voice States Intent**

## Instalación

1. Clona o copia este proyecto
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Crea un archivo `.env` basado en `.env.example`:
   ```bash
   copy .env.example .env
   ```
4. Configura las variables en `.env`:
   - `DISCORD_TOKEN` - Token del bot desde Discord Developer Portal
   - `DISCORD_CLIENT_ID` - Client ID de la aplicación
   - `DISCORD_GUILD_ID` - ID del servidor donde operará el bot

## Uso

### Comandos Slash

| Comando | Descripción |
|---------|-------------|
| `/joinvoice source:<ID> target:<ID>` | Se une al canal source, luego se mueve al canal target y permanece allí |
| `/move channel:<ID>` | Mueve el bot directamente a un canal de voz específico |
| `/leave` | Desconecta el bot del canal de voz |

### Ejemplo

```
/joinvoice source:123456789012345678 target:987654321098765432
```

El bot:
1. Se une al canal de origen
2. Se mueve automáticamente al canal objetivo
3. Permanece conectado permanentemente (con auto-reconexión)
4. Está ensordecido (no escucha audio)

## Características

- **Auto-reconexión**: Si el bot es desconectado, intenta reconectarse automáticamente al último canal
- **Ensordecido**: El bot está configurado con `selfDeaf: true` para no procesar audio entrante
- **Comandos slash**: Interfaz limpia y fácil de usar
- **Mínimo consumo**: Sin dependencias de audio nativas (no requiere `@discordjs/opus`)

## Ejecutar

```bash
node index.js
```
