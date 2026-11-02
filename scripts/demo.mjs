// One-command rehearsal: a fresh in-memory world on its own ports. It ignores the
// Twitch settings in .env and cannot touch a live server or its database.
import { spawn } from 'node:child_process';

const WEB_PORT = process.env.DEMO_WEB_PORT ?? '5180';
const PORT = process.env.DEMO_PORT ?? '3010';
const origin = `http://localhost:${WEB_PORT}`;

console.log(`\n  RIFT rehearsal\n  Landing page:  ${origin}/\n  Control room:  ${origin}/app\n`);

const child = spawn('npm run dev', {
  shell: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT,
    WEB_PORT,
    APP_ORIGIN: origin,
    DATABASE_PATH: ':memory:',
    ALLOW_REHEARSAL: 'true',
    TWITCH_CLIENT_ID: '',
    TWITCH_CLIENT_SECRET: '',
    TWITCH_REDIRECT_URI: `${origin}/api/auth/twitch/callback`,
  },
});
child.on('exit', (code) => process.exit(code ?? 0));
