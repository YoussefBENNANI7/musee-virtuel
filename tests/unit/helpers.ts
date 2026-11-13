import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildLayout } from '../../src/engine/layout';
import { STYLES } from '../../src/engine/styles';
import type { MuseumConfig } from '../../src/engine/types';

const read = (path: string): MuseumConfig =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'));

/** Une copie neuve à chaque appel : les tests peuvent la modifier librement. */
export const fixture = () => read('../fixtures/museum.json');
export const demo = () => read('../../public/museums/demo/museum.json');

export const classic = STYLES.classic;
export const layoutOf = (museum: MuseumConfig, style = classic) =>
  buildLayout(museum, { wallThickness: style.wallThickness, doorHeight: style.doorHeight });
