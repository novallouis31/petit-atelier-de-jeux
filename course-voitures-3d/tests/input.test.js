/**
 * Tests de la correspondance clavier.
 *
 * Le bug qui a motivé ce fichier : `KEYMAP` contenait `KeyRight` au lieu de
 * `ArrowRight`. `KeyRight` n'est pas un code `KeyboardEvent` valide, donc la
 * flèche droite n'était jamais enregistrée — le jeu tournait, sans erreur,
 * mais la direction à droite était muette.
 *
 * D'où ces tests : ils vérifient les codes, pas seulement le comportement.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KEYMAP,
  CODES_CLAVIER,
  readInput,
  toCarInput,
} from '../src/core/input.js';

test('toutes les touches mappées sont des codes KeyboardEvent valides', () => {
  for (const code of Object.keys(KEYMAP)) {
    assert.ok(
      CODES_CLAVIER.has(code),
      `« ${code} » n'est pas un code KeyboardEvent valide — ` +
        'la touche serait muette sans lever d’erreur'
    );
  }
});

test('toutes les commandes attendues sont mappées', () => {
  const commandes = new Set(Object.values(KEYMAP));
  for (const attendue of ['throttle', 'brake', 'left', 'right', 'hand']) {
    assert.ok(commandes.has(attendue), `la commande « ${attendue} » n’est mappée sur aucune touche`);
  }
});

test('chaque commande a au moins une flèche ou touche directionnelle', () => {
  // Les flèches et les touches ZQSD/WASD doivent toutes être présentes.
  for (const code of [
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
  ]) {
    assert.ok(KEYMAP[code], `la touche ${code} doit être mappée`);
  }
});

test('la flèche droite donne une direction à droite', () => {
  const cmd = readInput(new Set(['ArrowRight']));
  assert.equal(cmd.right, 1);
  assert.equal(cmd.left, 0);
  assert.equal(toCarInput(cmd).steer, 1, 'steer > 0 doit signifier « à droite »');
});

test('la flèche gauche donne une direction à gauche', () => {
  const cmd = readInput(new Set(['ArrowLeft']));
  assert.equal(cmd.left, 1);
  assert.equal(cmd.right, 0);
  assert.equal(toCarInput(cmd).steer, -1);
});

test('les équivalents ZQSD/WASD répondent aussi', () => {
  const cas = [
    [['KeyD'], 1],
    [['KeyA'], -1],
    [['KeyW'], 0],
    [['KeyS'], 0],
  ];
  for (const [touches, attendu] of cas) {
    assert.equal(toCarInput(readInput(new Set(touches))).steer, attendu);
  }
});

test('aucune direction sans touche enfoncée', () => {
  const cmd = readInput(new Set());
  assert.equal(toCarInput(cmd).steer, 0);
  assert.equal(cmd.throttle, 0);
  assert.equal(cmd.brake, 0);
  assert.equal(cmd.hand, false);
});

test('les deux directions enfoncées s’annulent', () => {
  const cmd = toCarInput(readInput(new Set(['ArrowLeft', 'ArrowRight'])));
  assert.equal(cmd.steer, 0);
});

test('accélérateur, frein et frein à main sont indépendants', () => {
  const cmd = toCarInput(readInput(new Set(['ArrowUp', 'ArrowDown', 'Space'])));
  assert.equal(cmd.throttle, 1);
  assert.equal(cmd.brake, 1);
  assert.equal(cmd.hand, true);
});

test('l’ensemble vide et null sont acceptés', () => {
  assert.equal(toCarInput(readInput(null)).steer, 0);
  assert.equal(toCarInput(readInput(new Set())).steer, 0);
});
