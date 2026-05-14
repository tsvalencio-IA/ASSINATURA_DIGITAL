import fs from 'fs';
import path from 'path';

const root = process.cwd();
const source = path.join(root, 'scripts', 'android', 'java', 'br', 'com', 'thiaguinho', 'assinadordigital');
const target = path.join(root, 'android', 'app', 'src', 'main', 'java', 'br', 'com', 'thiaguinho', 'assinadordigital');

if (!fs.existsSync(path.join(root, 'android'))) {
  throw new Error('Pasta android ainda não existe. Rode npx cap add android antes.');
}
fs.mkdirSync(target, { recursive: true });
for (const name of ['MainActivity.java', 'NativePdfBridge.java']) {
  fs.copyFileSync(path.join(source, name), path.join(target, name));
  console.log('Instalado:', path.join(target, name));
}
