/**
 * Correspondance clavier → commandes de conduite.
 *
 * Module **pur** : il ne touche ni au DOM ni à Three.js, ce qui permet de le
 * tester sous Node. C'est important, car une erreur ici est **invisible** :
 * le jeu tourne, mais une touche ne répond plus.
 *
 * Les codes sont ceux de `KeyboardEvent.code` : ils désignent une **position
 * physique** sur le clavier, pas un caractère. La flèche droite est donc
 * `ArrowRight` — et non `KeyRight`, qui n'existe pas.
 */

/** Touches reconnues, associées à une commande. */
export const KEYMAP = {
  ArrowUp: 'throttle',
  KeyW: 'throttle',
  ArrowDown: 'brake',
  KeyS: 'brake',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'hand',
};

/**
 * Codes valides de `KeyboardEvent.code`.
 * Sert à valider `KEYMAP` : une faute de frappe dans un code rend la touche
 * muette sans aucune erreur.
 */
export const CODES_CLAVIER = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'Enter',
  'Escape',
  'Backspace',
  'Tab',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'KeyA',
  'KeyB',
  'KeyC',
  'KeyD',
  'KeyE',
  'KeyF',
  'KeyG',
  'KeyH',
  'KeyI',
  'KeyJ',
  'KeyK',
  'KeyL',
  'KeyM',
  'KeyN',
  'KeyO',
  'KeyP',
  'KeyQ',
  'KeyR',
  'KeyS',
  'KeyT',
  'KeyU',
  'KeyV',
  'KeyW',
  'KeyX',
  'KeyY',
  'KeyZ',
  'Digit0',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',
]);

/**
 * Lit les commandes à partir de l'ensemble des touches enfoncées.
 *
 * @param {Iterable<string>} touches  codes `KeyboardEvent.code` enfoncés
 * @returns {{throttle:number, brake:number, steer:number, hand:boolean}}
 *   `steer > 0` = vers la droite (convention du projet).
 */
export function readInput(touches) {
  const a = (code) => (touches ? touches.has(code) : false);
  return {
    throttle: a('ArrowUp') || a('KeyW') ? 1 : 0,
    brake: a('ArrowDown') || a('KeyS') ? 1 : 0,
    left: a('ArrowLeft') || a('KeyA') ? 1 : 0,
    right: a('ArrowRight') || a('KeyD') ? 1 : 0,
    hand: a('Space'),
  };
}

/**
 * Convertit les commandes en entrée physique du véhicule.
 * Séparé de `readInput` pour rester testable sans le reste du jeu.
 */
export function toCarInput(cmd) {
  return {
    throttle: cmd.throttle,
    brake: cmd.brake,
    steer: cmd.right - cmd.left,
    hand: cmd.hand,
  };
}
