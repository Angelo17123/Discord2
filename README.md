# Discord Voice Bot

Bot de Discord que se une a un canal de voz, se queda permanentemente (muteado y ensordecido).

## Requisitos

- Node.js 18+
- Token de cuenta de Discord

## Instalación

1. Instala las dependencias:
   ```bash
   npm install
   ```
2. Crea un archivo `.env` basado en `.env.example`:
   ```bash
   copy .env.example .env
   ```
3. Configura las variables en `.env`.

## Uso

```bash
node index.js
```

### Comandos en consola

| Comando | Descripción |
|---------|-------------|
| `!move <channel_id>` | Mover a otro canal de voz |
| `!leave` | Desconectar del canal de voz |
| `!status` | Ver canal actual |

## Características

- Muteado y ensordecido
- Auto-reconexión si se desconecta
- Permanente en el canal
