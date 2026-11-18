// Prépare l'ordinateur pour « npm run lumiere » : Blender (comme module Python) et le navigateur de calcul.
//
// Usage :
//   npm run lumiere:installer
//
// Ce que fait la commande, une seule fois par ordinateur :
//   1. elle vérifie que l'ordinateur convient (Mac à puce Apple sous macOS 13 ou plus, ou Linux 64 bits) ;
//   2. elle cherche Python 3.13 et, s'il manque, l'installe avec Homebrew quand Homebrew est là
//      (sinon elle dit comment l'installer, et s'arrête) ;
//   3. elle installe Blender 5.3 (module « bpy ») et numpy dans ~/.cache/musee-virtuel/blender ;
//   4. elle installe le navigateur sans fenêtre qui exporte les salles (Chromium de Playwright).
// Rien n'est installé dans le projet. Relancée, la commande ne refait que ce qui manque.
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const BPY = '5.3.0';
const PYTHON = '3.13';
// LUMIERE_VENV : autre emplacement, pour les essais. « npm run lumiere » lit alors LUMIERE_PYTHON.
const venv = process.env.LUMIERE_VENV ?? join(homedir(), '.cache', 'musee-virtuel', 'blender');
const venvPython = join(venv, 'bin', 'python');

let step = 0;
const title = (text) => console.log(`\n${++step}. ${text}`);
const ok = (text) => console.log(`   ✓ ${text}`);
const stop = (text) => {
  console.error(`\n   ✗ ${text}\n`);
  process.exit(1);
};
/** Lance une commande en laissant voir ce qu'elle affiche. Vrai si elle réussit. */
const run = (command, args) => spawnSync(command, args, { stdio: 'inherit' }).status === 0;

// Sur Mac, l'ordinateur ne se met pas en veille tant que la commande travaille : la veille coupe le Wi-Fi.
if (process.platform === 'darwin') {
  const awake = spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' });
  awake.on('error', () => {});
  awake.unref();
}
/** Ce qu'affiche une commande, ou null si elle échoue ou n'existe pas. */
const read = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return result.status === 0 ? `${result.stdout}${result.stderr}`.trim() : null;
};

// 1. L'ordinateur : Blender n'est publié sous cette forme que pour certains.
title('Vérification de l’ordinateur');
if (process.platform === 'darwin') {
  // « hw.optional.arm64 » vaut 1 sur un Mac à puce Apple, même si Node tourne en mode Intel.
  if (read('sysctl', ['-n', 'hw.optional.arm64']) !== '1') {
    stop('Ce Mac a un processeur Intel. Blender 5.3 n’est publié, sous la forme utilisée ici, que pour les Mac à puce Apple (M1 et suivants).\n     Le calcul peut se faire sur un autre ordinateur : dites-le à Claude.');
  }
  const version = read('sw_vers', ['-productVersion']) ?? '';
  if (Number(version.split('.')[0]) < 13) stop(`Ce Mac est sous macOS ${version}. Il faut macOS 13 (Ventura) ou plus récent : mettez le système à jour, puis relancez la commande.`);
  ok(`Mac à puce Apple, macOS ${version}`);
} else if (process.platform === 'linux' && process.arch === 'x64') {
  ok('Linux 64 bits');
} else {
  stop(`Cet ordinateur (${process.platform}, ${process.arch}) n’est pas pris en charge : il faut un Mac à puce Apple ou un Linux 64 bits.`);
}

// 2. Python 3.13 : la version qu'exige ce module Blender.
title(`Python ${PYTHON}`);
const isWanted = (python) => read(python, ['--version'])?.startsWith(`Python ${PYTHON}.`) ?? false;
const findPython = () =>
  [
    `python${PYTHON}`,
    `/opt/homebrew/bin/python${PYTHON}`,
    `/usr/local/bin/python${PYTHON}`,
    `/Library/Frameworks/Python.framework/Versions/${PYTHON}/bin/python${PYTHON}`,
    'python3',
  ].find(isWanted);
let python = findPython();
if (!python && process.platform === 'darwin' && read('brew', ['--version'])) {
  console.log(`   Python ${PYTHON} manque : installation avec Homebrew (quelques minutes)…`);
  run('brew', ['install', `python@${PYTHON}`]);
  const prefix = read('brew', ['--prefix', `python@${PYTHON}`]);
  python = findPython() ?? (prefix ? [join(prefix, 'bin', `python${PYTHON}`)].find(isWanted) : undefined);
}
if (!python) {
  stop(
    process.platform === 'darwin'
      ? `Python ${PYTHON} n’est pas installé. Pour l’installer :\n` +
          `       a. ouvrez https://www.python.org/downloads/macos/ dans votre navigateur ;\n` +
          `       b. sous la dernière version « Python ${PYTHON}.x », cliquez sur « macOS 64-bit universal2 installer » ;\n` +
          `       c. ouvrez le fichier téléchargé et suivez les étapes (Continuer, puis Installer) ;\n` +
          `       d. fermez puis rouvrez le Terminal, revenez dans le dossier du projet, et relancez : npm run lumiere:installer`
      : `Python ${PYTHON} n’est pas installé. Installez-le (paquet python${PYTHON} et python${PYTHON}-venv), puis relancez la commande.`,
  );
}
if (process.platform === 'darwin' && read(python, ['-c', 'import platform; print(platform.machine())']) !== 'arm64') {
  stop(`Le Python ${PYTHON} trouvé (${python}) est une version pour processeur Intel. Installez celle de https://www.python.org/downloads/macos/ (« universal2 »), puis relancez la commande.`);
}
ok(`${read(python, ['--version'])} (${python})`);

// 3. Blender, comme module Python, dans un dossier à lui, hors du projet.
title(`Blender ${BPY} (module Python, environ 250 Mo à télécharger sur Mac)`);
const blenderVersion = () => (existsSync(venvPython) ? read(venvPython, ['-c', 'import bpy, numpy; print(bpy.app.version_string)']) : null);
if (blenderVersion()?.startsWith(BPY.split('.').slice(0, 2).join('.'))) {
  ok(`déjà installé (${venv})`);
} else {
  mkdirSync(dirname(venv), { recursive: true });
  if (!run(python, ['-m', 'venv', '--clear', venv])) stop(`Impossible de créer le dossier de Blender (${venv}). Copiez à Claude ce qui est affiché ci-dessus.`);
  run(venvPython, ['-m', 'pip', 'install', '--quiet', '--upgrade', 'pip']);
  console.log('   Téléchargement et installation : plusieurs minutes selon la connexion…');
  // Le téléchargement est long : une coupure de la connexion est attendue patiemment, et le
  // téléchargement reprend là où il s'était arrêté. Après trois échecs, la commande s'arrête.
  const patient = ['--retries', '20', '--timeout', '60', '--resume-retries', '50'];
  let installed = false;
  for (let attempt = 1; attempt <= 3 && !installed; attempt++) {
    if (attempt > 1) {
      console.log(`\n   La connexion a été coupée. Nouvel essai (${attempt} sur 3) dans 30 secondes…`);
      spawnSync('sleep', ['30']);
    }
    installed = run(venvPython, ['-m', 'pip', 'install', ...patient, `bpy==${BPY}`, 'numpy']);
  }
  if (!installed) {
    stop('Le téléchargement de Blender n’a pas abouti : la connexion Internet a été coupée plusieurs fois.\n     Vérifiez le Wi-Fi, puis relancez la même commande : npm run lumiere:installer');
  }
  const version = blenderVersion();
  if (!version) stop('Blender est installé mais ne démarre pas. Copiez à Claude ce qui est affiché ci-dessus.');
  ok(`Blender ${version} installé (${venv})`);
}

// 4. Le navigateur sans fenêtre : il ouvre le musée pour en exporter les salles.
title('Navigateur de calcul (Chromium)');
/** Vrai si le navigateur démarre réellement : c'est la seule preuve qu'il est installé en entier. */
const browserReady = async () => {
  try {
    const browser = await chromium.launch();
    await browser.close();
    return true;
  } catch {
    return false;
  }
};
if (await browserReady()) {
  ok('déjà installé');
} else {
  console.log('   Téléchargement du navigateur (environ 250 Mo)…');
  if (!run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['playwright', 'install', 'chromium']) || !(await browserReady())) {
    stop('L’installation du navigateur de calcul a échoué. Copiez à Claude ce qui est affiché ci-dessus.');
  }
  ok('installé');
}

console.log(`
Tout est prêt. Pour calculer la lumière d'un musée (remplacer « demo » par le nom de son dossier) :

    npm run lumiere -- demo
${process.env.LUMIERE_VENV ? `\n(Essai : lancer avec LUMIERE_PYTHON=${venvPython})\n` : ''}`);
