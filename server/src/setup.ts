import bcrypt from 'bcrypt';
import { createInterface } from 'readline';

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(q: string): Promise<string> {
  return new Promise(resolve => rl.question(q, resolve));
}

async function main() {
  console.log('ProjectX Server Setup\n');
  const username = await ask('Username [admin]: ') || 'admin';
  const password = await ask('Password: ');
  if (!password) {
    console.error('Password is required');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  console.log('\nAdd these to your .env file:\n');
  console.log(`AUTH_USERNAME=${username}`);
  console.log(`AUTH_PASSWORD_HASH=${hash}`);
  rl.close();
}

main();
