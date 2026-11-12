/*
 * Tzolk'in : données de jeu.
 *
 * Toutes les valeurs proviennent des règles officielles (rulebook CGE, "Tzolk'in:
 * The Mayan Calendar", 2012) et de l'extension "Tribes & Prophecies" (2015).
 *
 * Repères vérifiés dans le rulebook :
 *   - les engrenages ont 10 dents (13 pour Chichen Itza) mais seules les cases
 *     0 à 7 (0 à 10 pour Chichen Itza) portent une action ;
 *   - les temples (valeurs de points et récompenses) sont recoupés avec
 *     l'exemple de la page 13 du rulebook ;
 *   - chaque joueur commence à l'indice 1 de chaque temple (le marcheur blanc).
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TzolkinData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Engrenages (lieux)                                                  */
  /* ------------------------------------------------------------------ */

  // Une action est décrite par un objet `kind` :
  //   wait            case vide (simple emplacement de travailleur)
  //   harvest         récolte de la jungle (maïs et/ou bois)
  //   fish            pêche
  //   gain            ressources fixes (Yaxchilan)
  //   tech            avancée technologique
  //   build           construction de bâtiment(s) / monument
  //   temple          montée sur un ou plusieurs temples
  //   trade           marché d'Uxmal
  //   worker          prendre un travailleur dans la banque
  //   anyAction       case "au choix" (actions 6-7, 10 pour Chichen Itza)
  //   skull           action de Chichen Itza (crâne de cristal)

  const GEARS = {
    palenque: {
      id: 'palenque',
      name: 'Palenque',
      color: '#7cb342',
      dark: '#558b2f',
      teeth: 10,
      spaces: 8,
      position: { x: 215, y: 235 },
      radius: 96,
      actions: [
        { kind: 'wait' },
        { kind: 'fish', corn: 3 },
        { kind: 'harvest', jungle: 0, corn: 4, wood: null },
        { kind: 'harvest', jungle: 1, corn: 5, wood: 2 },
        { kind: 'harvest', jungle: 2, corn: 7, wood: 3 },
        { kind: 'harvest', jungle: 3, corn: 9, wood: 4 },
        { kind: 'anyAction', from: 1, to: 5 },
        { kind: 'anyAction', from: 1, to: 5 },
      ],
    },
    yaxchilan: {
      id: 'yaxchilan',
      name: 'Yaxchilan',
      color: '#8d6e63',
      dark: '#5d4037',
      teeth: 10,
      spaces: 8,
      position: { x: 785, y: 150 },
      radius: 96,
      actions: [
        { kind: 'wait' },
        { kind: 'gain', resources: { wood: 1 }, source: 'yaxchilan' },
        { kind: 'gain', resources: { stone: 1, corn: 1 }, source: 'yaxchilan' },
        { kind: 'gain', resources: { gold: 1, corn: 2 }, source: 'yaxchilan' },
        { kind: 'gain', resources: { skull: 1 }, source: 'yaxchilan' },
        { kind: 'gain', resources: { gold: 1, stone: 1, corn: 2 }, source: 'yaxchilan' },
        { kind: 'anyAction', from: 1, to: 5 },
        { kind: 'anyAction', from: 1, to: 5 },
      ],
    },
    tikal: {
      id: 'tikal',
      name: 'Tikal',
      color: '#e64a19',
      dark: '#bf360c',
      teeth: 10,
      spaces: 8,
      position: { x: 855, y: 430 },
      radius: 96,
      actions: [
        { kind: 'wait' },
        { kind: 'tech', steps: 1 },
        { kind: 'build', count: 1, allowMonument: false },
        { kind: 'tech', steps: 2 },
        { kind: 'build', count: 2, allowMonument: true },
        { kind: 'temple', cost: { anyResource: 1 }, distinct: 2 },
        { kind: 'anyAction', from: 1, to: 5 },
        { kind: 'anyAction', from: 1, to: 5 },
      ],
    },
    uxmal: {
      id: 'uxmal',
      name: 'Uxmal',
      color: '#fbc02d',
      dark: '#f9a825',
      teeth: 10,
      spaces: 8,
      position: { x: 690, y: 690 },
      radius: 96,
      actions: [
        { kind: 'wait' },
        { kind: 'temple', cost: { corn: 3 }, distinct: 1 },
        { kind: 'trade' },
        { kind: 'worker' },
        { kind: 'build', count: 1, allowMonument: false, withCorn: true },
        { kind: 'anyAction', cost: { corn: 1 }, gears: ['palenque', 'yaxchilan', 'tikal', 'uxmal'], from: 1, to: 7 },
        { kind: 'anyAction', from: 1, to: 5 },
        { kind: 'anyAction', from: 1, to: 5 },
      ],
    },
    chichenItza: {
      id: 'chichenItza',
      name: 'Chichen Itza',
      color: '#1e88e5',
      dark: '#1565c0',
      teeth: 13,
      spaces: 11,
      position: { x: 300, y: 660 },
      radius: 108,
      actions: [
        { kind: 'wait' },
        { kind: 'skull', points: 4, temple: 'chaac', resource: false },
        { kind: 'skull', points: 5, temple: 'chaac', resource: false },
        { kind: 'skull', points: 6, temple: 'chaac', resource: false },
        { kind: 'skull', points: 7, temple: 'kukulkan', resource: false },
        { kind: 'skull', points: 8, temple: 'kukulkan', resource: false },
        { kind: 'skull', points: 8, temple: 'kukulkan', resource: true },
        { kind: 'skull', points: 10, temple: 'quetzalcoatl', resource: false },
        { kind: 'skull', points: 11, temple: 'quetzalcoatl', resource: true },
        { kind: 'skull', points: 13, temple: 'quetzalcoatl', resource: true },
        { kind: 'anyAction', from: 1, to: 9 },
      ],
    },
  };

  const GEAR_ORDER = ['palenque', 'yaxchilan', 'tikal', 'uxmal', 'chichenItza'];

  /* ------------------------------------------------------------------ */
  /* Temples                                                            */
  /* ------------------------------------------------------------------ */

  // `steps[i]` : points gagnés à la fin d'un âge en étant sur la marche i.
  // `resources` : récompense (ressource ou crâne) obtenue au milieu d'un âge.
  // La marche 0 est le bas (points négatifs), la marche 1 est le départ.

  const TEMPLES = {
    chaac: {
      id: 'chaac',
      name: 'Chaac',
      color: '#8d6e63',
      steps: [-1, 0, 2, 4, 6, 7, 8],
      resources: [null, null, 'stone', null, 'stone', null, null],
      ageBonus: { 1: 6, 2: 2 },
    },
    quetzalcoatl: {
      id: 'quetzalcoatl',
      name: 'Quetzalcoatl',
      color: '#fbc02d',
      steps: [-2, 0, 1, 2, 4, 6, 9, 12, 13],
      resources: [null, null, null, 'gold', null, 'gold', null, null, null],
      ageBonus: { 1: 2, 2: 6 },
    },
    kukulkan: {
      id: 'kukulkan',
      name: 'Kukulcan',
      color: '#43a047',
      steps: [-3, 0, 1, 3, 5, 7, 9, 10],
      resources: [null, null, 'wood', null, 'wood', 'skull', null, null],
      ageBonus: { 1: 4, 2: 4 },
    },
  };

  const TEMPLE_ORDER = ['chaac', 'quetzalcoatl', 'kukulkan'];

  /* ------------------------------------------------------------------ */
  /* Technologies                                                       */
  /* ------------------------------------------------------------------ */

  // Chaque piste : 3 niveaux puis une case bonus (obtenue en utilisant une
  // action d'avancée alors que le niveau 3 est atteint).

  const TECHNOLOGIES = {
    agriculture: {
      id: 'agriculture',
      name: 'Agriculture',
      color: '#8bc34a',
      levels: [
        { text: 'Prenez 1 maïs de plus chaque fois que vous récoltez du maïs dans la jungle (Palenque 2, 3, 4 ou 5, mais pas 1).' },
        { text: 'Si aucune tuile de récolte de maïs n’est visible sur la case de Palenque utilisée, vous pouvez tout de même l’utiliser pour obtenir du maïs (sans prendre de tuile). Prenez 1 maïs de plus chaque fois que vous pêchez (Palenque 1).' },
        { text: 'Prenez 2 maïs de plus chaque fois que vous récoltez du maïs dans la jungle (Palenque 2, 3, 4 ou 5).' },
      ],
      bonus: { text: 'Montez immédiatement 1 marche sur le temple de votre choix.' },
    },
    extraction: {
      id: 'extraction',
      name: 'Extraction de ressources',
      color: '#ffb300',
      levels: [
        { text: 'Prenez 1 bois de plus chaque fois que vous obtenez du bois à Yaxchilan (1) ou Palenque (3, 4 ou 5).' },
        { text: 'Prenez 1 pierre de plus chaque fois que vous obtenez de la pierre à Yaxchilan (2 ou 5).' },
        { text: 'Prenez 1 or de plus chaque fois que vous obtenez de l’or à Yaxchilan (3 ou 5).' },
      ],
      bonus: { text: 'Prenez immédiatement 2 blocs de ressources de votre choix.' },
    },
    architecture: {
      id: 'architecture',
      name: 'Architecture',
      color: '#e64a19',
      levels: [
        { text: 'Prenez 1 maïs chaque fois que vous construisez un bâtiment (Tikal 2 ou 4, Uxmal 4).' },
        { text: 'Gagnez 2 points de victoire chaque fois que vous construisez un bâtiment (Tikal 2 ou 4, Uxmal 4).' },
        { text: 'En construisant un bâtiment à Tikal (2 ou 4), vous pouvez payer comme si 1 des blocs de ressources de son coût n’était pas requis. En construisant un bâtiment à Uxmal (4), vous payez 2 maïs de moins.' },
      ],
      bonus: { text: 'Gagnez immédiatement 3 points de victoire.' },
    },
    theology: {
      id: 'theology',
      name: 'Théologie',
      color: '#1e88e5',
      levels: [
        { text: 'Sur l’engrenage de Chichen Itza, lorsque vous reprenez votre travailleur, vous pouvez choisir d’effectuer l’action située 1 case plus loin, sans aucun maïs supplémentaire.' },
        { text: 'Après avoir effectué une action sur l’engrenage de Chichen Itza, vous pouvez dépenser 1 bloc de ressource pour monter 1 marche sur le temple de votre choix.' },
        { text: 'Prenez 1 crâne de cristal de plus chaque fois que vous obtenez un crâne de cristal à Yaxchilan (4).' },
      ],
      bonus: { text: 'Prenez immédiatement 1 crâne de cristal dans la banque.' },
    },
  };

  const TECHNOLOGY_ORDER = ['agriculture', 'extraction', 'architecture', 'theology'];

  /* ------------------------------------------------------------------ */
  /* Bâtiments (32 de base + 8 de l'extension)                          */
  /* ------------------------------------------------------------------ */

  const BUILDINGS = [
    // --- âge 1 -------------------------------------------------------
    { id: 'b01', name: 'Petite ferme I', age: 1, category: 'farm', cost: { wood: 1 }, effects: [{ type: 'feed', workers: 1 }] },
    { id: 'b02', name: 'Petite ferme II', age: 1, category: 'farm', cost: { wood: 1 }, effects: [{ type: 'feed', workers: 1 }] },
    { id: 'b03', name: 'Petite ferme III', age: 1, category: 'farm', cost: { wood: 1 }, effects: [{ type: 'feed', workers: 1 }] },
    { id: 'b04', name: 'Ferme commune I', age: 1, category: 'farm', cost: { wood: 4 }, effects: [{ type: 'feedDiscount', amount: 1 }] },
    { id: 'b05', name: 'Ferme commune II', age: 1, category: 'farm', cost: { wood: 4 }, effects: [{ type: 'feedDiscount', amount: 1 }] },
    { id: 'b06', name: 'Tombeau de la pluie et du soleil', age: 1, category: 'graveyard', cost: { wood: 2, stone: 1 }, effects: [{ type: 'temple', temple: 'chaac', steps: 1 }, { type: 'temple', temple: 'quetzalcoatl', steps: 1 }] },
    { id: 'b07', name: 'Tombeau de la pluie et du vent', age: 1, category: 'graveyard', cost: { wood: 1, stone: 2 }, effects: [{ type: 'temple', temple: 'chaac', steps: 1 }, { type: 'temple', temple: 'kukulkan', steps: 1 }] },
    { id: 'b08', name: 'Tombeau du bâtisseur', age: 1, category: 'graveyard', cost: { wood: 1, gold: 1 }, effects: [{ type: 'temple', temple: 'any', steps: 1 }, { type: 'build' }] },
    { id: 'b09', name: 'École agricole', age: 1, category: 'municipal', cost: { wood: 2 }, effects: [{ type: 'technology', technology: 'agriculture', steps: 1 }] },
    { id: 'b10', name: 'Atelier agricole', age: 1, category: 'municipal', cost: { wood: 3 }, effects: [{ type: 'technology', technology: 'agriculture', steps: 1 }, { type: 'resources', resources: { stone: 1 } }] },
    { id: 'b11', name: 'École des mines', age: 1, category: 'municipal', cost: { wood: 1, stone: 1 }, effects: [{ type: 'technology', technology: 'extraction', steps: 1 }, { type: 'resources', resources: { corn: 1 } }] },
    { id: 'b12', name: 'Atelier des mines', age: 1, category: 'municipal', cost: { wood: 2, stone: 1 }, effects: [{ type: 'technology', technology: 'extraction', steps: 1 }, { type: 'resources', resources: { gold: 1 } }] },
    { id: 'b13', name: 'Sanctuaire de l’architecture', age: 1, category: 'shrine', cost: { gold: 1 }, effects: [{ type: 'technology', technology: 'architecture', steps: 1 }] },
    { id: 'b14', name: 'Sanctuaire de la foi', age: 1, category: 'shrine', cost: { stone: 1, gold: 1 }, effects: [{ type: 'technology', technology: 'theology', steps: 1 }, { type: 'temple', temple: 'kukulkan', steps: 1 }] },
    // --- âge 2 -------------------------------------------------------
    { id: 'b15', name: 'Grande ferme I', age: 2, category: 'farm', cost: { wood: 2 }, effects: [{ type: 'feed', workers: 3 }] },
    { id: 'b16', name: 'Grande ferme II', age: 2, category: 'farm', cost: { wood: 2 }, effects: [{ type: 'feed', workers: 3 }] },
    { id: 'b17', name: 'Grande ferme III', age: 2, category: 'farm', cost: { wood: 2 }, effects: [{ type: 'feed', workers: 3 }] },
    { id: 'b18', name: 'Tombeau du marchand', age: 2, category: 'graveyard', cost: { stone: 3 }, effects: [{ type: 'points', amount: 6 }, { type: 'trade' }] },
    { id: 'b19', name: 'Tombeau du travailleur', age: 2, category: 'graveyard', cost: { wood: 1, stone: 1, gold: 1 }, effects: [{ type: 'worker' }, { type: 'points', amount: 6 }] },
    { id: 'b20', name: 'Tombeau du guide', age: 2, category: 'graveyard', cost: { wood: 1, gold: 2 }, effects: [{ type: 'points', amount: 8 }] },
    { id: 'b21', name: 'Tombeau de l.actor', age: 2, category: 'graveyard', cost: { wood: 2, stone: 1, gold: 1 }, effects: [{ type: 'points', amount: 2 }, { type: 'action' }] },
    { id: 'b22', name: 'Tombeau des trois dieux', age: 2, category: 'graveyard', cost: { wood: 1, stone: 2, gold: 1 }, effects: [{ type: 'temple', temple: 'chaac', steps: 1 }, { type: 'temple', temple: 'quetzalcoatl', steps: 1 }, { type: 'temple', temple: 'kukulkan', steps: 1 }, { type: 'points', amount: 3 }] },
    { id: 'b23', name: 'École de la pierre', age: 2, category: 'municipal', cost: { wood: 3 }, effects: [{ type: 'technologyAny', steps: 1 }, { type: 'resources', resources: { stone: 1 } }] },
    { id: 'b24', name: 'École de l’or', age: 2, category: 'municipal', cost: { wood: 2, stone: 1 }, effects: [{ type: 'technologyAny', steps: 1 }, { type: 'resources', resources: { gold: 1 } }] },
    { id: 'b25', name: 'École de l’abondance', age: 2, category: 'municipal', cost: { wood: 3, stone: 1 }, effects: [{ type: 'technologyAny', steps: 1 }, { type: 'resources', resources: { corn: 6 } }] },
    { id: 'b26', name: 'École des crânes', age: 2, category: 'municipal', cost: { wood: 2, stone: 2 }, effects: [{ type: 'technologyAny', steps: 1 }, { type: 'resources', resources: { skull: 1 } }] },
    { id: 'b27', name: 'Sanctuaire de Chaac', age: 2, category: 'shrine', cost: { stone: 2 }, effects: [{ type: 'temple', temple: 'chaac', steps: 2 }, { type: 'points', amount: 2 }] },
    { id: 'b28', name: 'Sanctuaire de l’architecte', age: 2, category: 'shrine', cost: { stone: 1, gold: 1 }, effects: [{ type: 'technology', technology: 'architecture', steps: 1 }, { type: 'points', amount: 3 }] },
    { id: 'b29', name: 'Sanctuaire de Kukulcan', age: 2, category: 'shrine', cost: { gold: 2 }, effects: [{ type: 'temple', temple: 'kukulkan', steps: 2 }, { type: 'points', amount: 3 }] },
    { id: 'b30', name: 'Sanctuaire du fidèle', age: 2, category: 'shrine', cost: { stone: 2, gold: 1 }, effects: [{ type: 'technology', technology: 'theology', steps: 1 }, { type: 'temple', temple: 'chaac', steps: 1 }, { type: 'temple', temple: 'kukulkan', steps: 1 }] },
    { id: 'b31', name: 'Sanctuaire de la sagesse', age: 2, category: 'shrine', cost: { stone: 1, gold: 2 }, effects: [{ type: 'technologyAny', steps: 2 }] },
    { id: 'b32', name: 'Sanctuaire de Quetzalcoatl', age: 2, category: 'shrine', cost: { gold: 3 }, effects: [{ type: 'temple', temple: 'quetzalcoatl', steps: 2 }, { type: 'points', amount: 4 }] },
  ];

  const EXPANSION_BUILDINGS = [
    { id: 'b33', name: 'Grenier à maïs', age: 1, category: 'farm', cost: { wood: 3 }, effects: [{ type: 'renovation' }, { type: 'foodReward', resources: { corn: 3 } }] },
    { id: 'b34', name: 'Tombeau des saisons', age: 1, category: 'graveyard', cost: { wood: 2, gold: 1 }, effects: [{ type: 'renovation' }, { type: 'foodRewardSwitch' }] },
    { id: 'b35', name: 'Atelier de l’or', age: 1, category: 'municipal', cost: { wood: 1, stone: 2 }, effects: [{ type: 'renovation' }, { type: 'foodReward', resources: { gold: 1 } }] },
    { id: 'b36', name: 'Sanctuaire de la pierre', age: 1, category: 'shrine', cost: { gold: 2 }, effects: [{ type: 'renovation' }, { type: 'foodReward', resources: { stone: 1 } }] },
    { id: 'b37', name: 'Ferme de l’abondance', age: 2, category: 'farm', cost: { wood: 2 }, effects: [{ type: 'resources', resources: { corn: 8 } }] },
    { id: 'b38', name: 'Tombeau des monuments', age: 2, category: 'graveyard', cost: { wood: 1, gold: 1 }, effects: [{ type: 'buildMonument' }, { type: 'points', amount: 1 }] },
    { id: 'b39', name: 'Bureau d’échange de savoirs', age: 2, category: 'municipal', cost: { wood: 1, stone: 1 }, effects: [{ type: 'technologyExchange' }] },
    { id: 'b40', name: 'Sanctuaire des crânes', age: 2, category: 'shrine', cost: { gold: 1, skull: 1 }, effects: [{ type: 'skullBuilding', points: 7, temple: 'any' }] },
  ];

  const BUILDING_CATEGORIES = {
    farm: { id: 'farm', name: 'Ferme', color: '#c0ca33' },
    graveyard: { id: 'graveyard', name: 'Tombeau', color: '#9e9e9e' },
    municipal: { id: 'municipal', name: 'Civique', color: '#43a047' },
    shrine: { id: 'shrine', name: 'Sanctuaire', color: '#1e88e5' },
  };

  /* ------------------------------------------------------------------ */
  /* Monuments (13)                                                     */
  /* ------------------------------------------------------------------ */

  const MONUMENTS = [
    { id: 'm01', name: 'Monument funéraire', category: 'graveyard', cost: { wood: 3, stone: 2, gold: 1 }, scoreKey: 'graveyards' },
    { id: 'm02', name: 'Monument de la construction', category: 'graveyard', cost: { wood: 1, stone: 3, gold: 2 }, scoreKey: 'constructions' },
    { id: 'm03', name: 'Monument du maïs', category: 'graveyard', cost: { wood: 1, stone: 1, gold: 4 }, scoreKey: 'cornTiles' },
    { id: 'm04', name: 'Monument de la forêt', category: 'graveyard', cost: { wood: 1, gold: 4 }, scoreKey: 'woodTiles' },
    { id: 'm05', name: 'Monument de la civilisation', category: 'graveyard', cost: { wood: 2, stone: 2, gold: 2 }, scoreKey: 'allMonuments' },
    { id: 'm06', name: 'Monument des citoyens', category: 'municipal', cost: { wood: 2, stone: 3, gold: 1 }, scoreKey: 'municipals' },
    { id: 'm07', name: 'Monument du sommet technologique', category: 'municipal', cost: { wood: 1, stone: 1, gold: 3 }, scoreKey: 'maxTechnologies' },
    { id: 'm08', name: 'Monument des technologies', category: 'municipal', cost: { wood: 2, stone: 1, gold: 3 }, scoreKey: 'technologyLevels' },
    { id: 'm09', name: 'Monument des travailleurs', category: 'municipal', cost: { wood: 3, gold: 3 }, scoreKey: 'workers' },
    { id: 'm10', name: 'Monument des sanctuaires', category: 'shrine', cost: { stone: 2, gold: 3 }, scoreKey: 'shrines' },
    { id: 'm11', name: 'Monument des trois dieux', category: 'shrine', cost: { stone: 4, gold: 3 }, scoreKey: 'templePoints' },
    { id: 'm12', name: 'Monument du sommet de la foi', category: 'shrine', cost: { stone: 3, gold: 3 }, scoreKey: 'highestTemple' },
    { id: 'm13', name: 'Monument des crânes', category: 'shrine', cost: { gold: 4, skull: 1 }, scoreKey: 'allSkulls' },
  ];

  /* ------------------------------------------------------------------ */
  /* Tuiles de richesse initiale (21)                                   */
  /* ------------------------------------------------------------------ */

  // Chaque tuile indique une case d'engrenage (pour poser les travailleurs
  // factices) et un effet immédiat.

  const STARTING_WEALTH = [
    { id: 'w01', name: 'Palenque 1', gear: 'palenque', position: 1, resources: { corn: 3 }, effects: [{ type: 'temple', temple: 'quetzalcoatl', steps: 1 }, { type: 'technology', technology: 'agriculture', steps: 1 }] },
    { id: 'w02', name: 'Palenque 3', gear: 'palenque', position: 3, resources: { corn: 5, gold: 1 }, effects: [{ type: 'temple', temple: 'quetzalcoatl', steps: 1 }] },
    { id: 'w03', name: 'Palenque 5', gear: 'palenque', position: 5, resources: { stone: 1, gold: 1 }, effects: [{ type: 'technology', technology: 'agriculture', steps: 1 }] },
    { id: 'w04', name: 'Palenque 7', gear: 'palenque', position: 7, resources: { corn: 9, stone: 1 }, effects: [] },
    { id: 'w05', name: 'Yaxchilan 1', gear: 'yaxchilan', position: 1, resources: { wood: 1 }, effects: [{ type: 'temple', temple: 'kukulkan', steps: 1 }, { type: 'technology', technology: 'extraction', steps: 1 }] },
    { id: 'w06', name: 'Yaxchilan 3', gear: 'yaxchilan', position: 3, resources: { corn: 2, wood: 2 }, effects: [{ type: 'temple', temple: 'kukulkan', steps: 1 }] },
    { id: 'w07', name: 'Yaxchilan 5', gear: 'yaxchilan', position: 5, resources: { corn: 4, wood: 1 }, effects: [{ type: 'technology', technology: 'extraction', steps: 1 }] },
    { id: 'w08', name: 'Yaxchilan 7', gear: 'yaxchilan', position: 7, resources: { corn: 3, wood: 2, stone: 1 }, effects: [] },
    { id: 'w09', name: 'Tikal 1', gear: 'tikal', position: 1, resources: { corn: 2 }, effects: [{ type: 'temple', temple: 'chaac', steps: 1 }, { type: 'technology', technology: 'architecture', steps: 1 }] },
    { id: 'w10', name: 'Tikal 3', gear: 'tikal', position: 3, resources: { corn: 6, stone: 2 }, effects: [] },
    { id: 'w11', name: 'Tikal 5', gear: 'tikal', position: 5, resources: { corn: 3, gold: 1 }, effects: [{ type: 'technology', technology: 'architecture', steps: 1 }] },
    { id: 'w12', name: 'Tikal 7', gear: 'tikal', position: 7, resources: { corn: 6, wood: 1, stone: 1 }, effects: [] },
    { id: 'w13', name: 'Uxmal 1', gear: 'uxmal', position: 1, resources: { corn: 5, stone: 1 }, effects: [{ type: 'temple', temple: 'chaac', steps: 1 }] },
    { id: 'w14', name: 'Uxmal 3', gear: 'uxmal', position: 3, resources: { corn: 3, wood: 1 }, effects: [{ type: 'feed', workers: 1 }] },
    { id: 'w15', name: 'Uxmal 5', gear: 'uxmal', position: 5, resources: {}, effects: [{ type: 'worker' }] },
    { id: 'w16', name: 'Uxmal 7', gear: 'uxmal', position: 7, resources: { corn: 8, gold: 1 }, effects: [] },
    { id: 'w17', name: 'Chichen Itza 0', gear: 'chichenItza', position: 0, resources: { corn: 4, wood: 1, skull: 1 }, effects: [] },
    { id: 'w18', name: 'Chichen Itza 3', gear: 'chichenItza', position: 3, resources: { corn: 5, stone: 1 }, effects: [{ type: 'technology', technology: 'theology', steps: 1 }] },
    { id: 'w19', name: 'Chichen Itza 5', gear: 'chichenItza', position: 5, resources: { corn: 4, wood: 3 }, effects: [] },
    { id: 'w20', name: 'Chichen Itza 7', gear: 'chichenItza', position: 7, resources: { corn: 2, wood: 2 }, effects: [{ type: 'technology', technology: 'theology', steps: 1 }] },
    { id: 'w21', name: 'Chichen Itza 10', gear: 'chichenItza', position: 10, resources: { corn: 7, wood: 2 }, effects: [] },
  ];

  /* ------------------------------------------------------------------ */
  /* Divers constantes                                                  */
  /* ------------------------------------------------------------------ */

  const RATES = { wood: 2, stone: 3, gold: 4 }; // maïs par bloc de ressource (marché d'Uxmal)
  const FEED_COST = 2; // maïs par travailleur lors d'un jour de famine
  const UNFED_PENALTY = 3; // points perdus par travailleur non nourri
  const CORN_PER_POINT = 0.25; // points de victoire par maïs au score final
  const SKULL_POINTS = 3; // points par crâne de cristal conservé
  const MONUMENT_RATE = { 2: 6, 3: 5, 4: 4 }; // points par monument construit (tous joueurs)
  const PLAYER_COLORS = [
    { id: 'red', name: 'Rouge', color: '#e53935' },
    { id: 'yellow', name: 'Jaune', color: '#fdd835' },
    { id: 'blue', name: 'Bleu', color: '#1e88e5' },
    { id: 'green', name: 'Vert', color: '#43a047' },
    { id: 'purple', name: 'Violet', color: '#8e24aa' },
  ];

  // Le calendrier compte 26 dents. Les dents 7, 13, 20 et 26 sont des jours de
  // famine : 7 et 20 au milieu d'un âge (récompenses en ressources), 13 et 26
  // à la fin d'un âge (récompenses en points). La partie démarre sur la dent 26.
  const CALENDAR_DAYS = 26;
  const FOOD_DAYS = { 7: 'materials', 13: 'points', 20: 'materials', 26: 'points' };
  const AGE_START_DAY = { 1: 1, 2: 14 };

  const JUNGLE_GROUPS = 4; // groupes de champs (Palenque 2, 3, 4 et 5)

  /* ------------------------------------------------------------------ */
  /* Extension : Tribus et Prophéties                                    */
  /* ------------------------------------------------------------------ */

  const TRIBES = [
    { id: 'ahChuyKak', name: 'AH CHUY KAK', text: 'Lors d’un tour où vous placez 2 travailleurs ou plus sur des engrenages, vous pouvez reprendre un travailleur et effectuer une action.' },
    { id: 'ahauChamahez', name: 'AHAU CHAMAHEZ', text: 'Lorsque vous reprenez un travailleur, payez 1 maïs pour utiliser l’action située 1 case plus loin. Cumule avec la théologie de niveau 1.' },
    { id: 'ahmakiq', name: 'AHMAKIQ', text: 'Vous pouvez terminer votre tour sans placer ni reprendre de travailleur.' },
    { id: 'bacab', name: 'BACAB', text: 'Vous commencez chaque tour avec au moins 2 maïs. Quémander pour commencer avec 4 maïs reste un quémandage (et coûte une marche de temple).' },
    { id: 'balam', name: 'BALAM', text: 'Lorsque vous utilisez une action de numéro inférieur, gagnez 1 maïs au lieu de le payer.' },
    { id: 'citBolonTum', name: 'CIT-BOLON-TUM', text: 'Le coût de placement d’un travailleur sur un engrenage est réduit de 2 maïs. Chaque engrenage gagne une case « au choix » supplémentaire.' },
    { id: 'huracan', name: 'HURACAN', text: 'En reprenant un travailleur, vous pouvez aussi utiliser l’action de même numéro sur l’engrenage apparié (Palenque↔Yaxchilan, Tikal↔Uxmal).' },
    { id: 'itzamna', name: 'ITZAMNÁ', text: 'Avancer aux niveaux 1 à 3 d’une technologie coûte 1 ressource de moins. Le bonus du niveau 4 peut être pris sur n’importe quelle technologie.' },
    { id: 'ixtab', name: 'IXTAB', text: 'Choisissez 3 tuiles de richesse initiale ; après leurs effets, descendez 1 marche sur un temple.' },
    { id: 'vacubCaquix', name: 'VACUB-CAQUIX', text: 'Lors d’un placement, choisissez 1 case libre d’un engrenage et traitez-la comme occupée : vous pouvez la sauter.' },
    { id: 'xamanEk', name: 'XAMAN EK', text: 'Une fois par tour, échangez 1 ressource contre du maïs au prix du marché.' },
    { id: 'yaluk', name: 'YALUK', text: 'Vous commencez avec 5 travailleurs. Chaque travailleur nourri coûte 1 maïs de plus ; chaque travailleur non nourri coûte 5 points.' },
    { id: 'yumkaax', name: 'YUMKAAX', text: 'Le coût total de placement pour 1 à 6 travailleurs est de 0, 0, 2, 5, 9, 13 maïs.' },
  ];

  const PROPHECIES = [
    { id: 'wrathfulGods', name: 'La colère des dieux', text: 'Chaque fois que vous montez 1 marche sur un temple, vous devez payer 1 maïs.', metric: 'templeSteps', bands: [0, 3, 9] },
    { id: 'angryGodChaac', name: 'La colère de Chaac', text: 'Chaque fois que vous montez 1 marche sur le temple de Chaac, vous devez payer 1 bloc de ressource.', metric: 'chaacSteps', bands: [-1, 1, 3] },
    { id: 'angryGodQuetzalcoatl', name: 'La colère de Quetzalcoatl', text: 'Chaque fois que vous montez 1 marche sur le temple de Quetzalcoatl, vous devez payer 1 bloc de ressource.', metric: 'quetzalcoatlSteps', bands: [-1, 1, 3] },
    { id: 'angryGodKukulkan', name: 'La colère de Kukulcan', text: 'Chaque fois que vous montez 1 marche sur le temple de Kukulcan, vous devez payer 1 bloc de ressource.', metric: 'kukulkanSteps', bands: [-1, 1, 3] },
    { id: 'forestFires', name: 'Les incendies de forêt', text: 'Lorsque vous récoltez du bois à Palenque, vous recevez 1 bloc de bois de moins.', metric: 'woodTiles', bands: [0, 2, 5] },
    { id: 'drought', name: 'La sécheresse', text: 'Lorsque vous récoltez du maïs à Palenque, vous recevez 1 maïs de moins (cela ne s’applique pas à la pêche).', metric: 'cornTiles', bands: [1, 3, 6] },
    { id: 'goldShortage', name: 'La pénurie d’or', text: 'Chaque fois que vous recevez un bloc d’or, vous devez payer 1 maïs (le maïs gagné simultanément peut servir au paiement).', metric: 'gold', bands: [1, 3, 5] },
    { id: 'desecration', name: 'La profanation', text: 'Chaque fois que vous recevez un crâne de cristal, vous devez descendre 1 marche sur un temple de votre choix.', metric: 'skulls', bands: [0, 2, 4] },
    { id: 'teacherShortage', name: 'La pénurie d’enseignants', text: 'Chaque fois que vous avancez d’un niveau de technologie (y compris depuis le niveau 3), vous devez payer 1 ressource supplémentaire.', metric: 'techLevels', bands: [2, 4, 6] },
    { id: 'forgottenLore', name: 'Le savoir oublié', text: 'Vous ne pouvez pas utiliser l’effet de niveau 2 d’une quelconque technologie (vous devez toutefois atteindre le niveau 2 avant le niveau 3).', metric: 'techLevel2', bands: [0, 1, 2] },
    { id: 'crowdedCities', name: 'Les villes bondées', text: 'Chaque fois que vous construisez un bâtiment (pas un monument), vous devez payer 1 bloc de ressource supplémentaire (2 maïs si vous payez en maïs).', metric: 'buildings', bands: [1, 3, 6] },
    { id: 'hunger', name: 'La famine', text: 'Au jour de famine de ce quart, chaque travailleur nécessite 1 maïs de plus.', metric: 'fedWorkers', bands: [3, 4, 5] },
    { id: 'highFloodwaters', name: 'Les hautes eaux', text: 'Chaque fois que vous placez un travailleur sur Chichen Itza, vous devez payer 2 maïs.', metric: 'chichenWorkers', bands: [0, 1, 2] },
  ];

  const PROPHECY_BAND_POINTS = [-5, 0, 6, 13];

  const QUICK_ACTIONS = {
    corn: { id: 'corn', name: 'Gain 3 maïs', text: 'Gagnez 3 maïs.' },
    woodCorn: { id: 'woodCorn', name: 'Gain 1 bois et 1 maïs', text: 'Gagnez 1 bois et 1 maïs.' },
    stone: { id: 'stone', name: 'Gain 1 pierre', text: 'Gagnez 1 pierre.' },
    gold: { id: 'gold', name: 'Gain 1 or', text: 'Gagnez 1 or.' },
    technology: { id: 'technology', name: 'Avancer une technologie', text: 'Avancez 1 niveau dans la technologie de votre choix, en payant le coût habituel.' },
    trade: { id: 'trade', name: 'Marché', text: 'Échangez du maïs et des ressources au marché, autant de fois que vous voulez.' },
    build: { id: 'build', name: 'Construire', text: 'Payez 1 maïs et construisez un bâtiment. Les technologies d’architecture ne s’appliquent pas.' },
  };

  const QUICK_ACTION_AGE1 = ['corn', 'woodCorn', 'stone', 'technology', 'technology', 'trade', 'build'];
  const QUICK_ACTION_AGE2 = ['corn', 'stone', 'gold', 'technology', 'trade', 'build'];

  return {
    GEARS,
    GEAR_ORDER,
    TEMPLES,
    TEMPLE_ORDER,
    TECHNOLOGIES,
    TECHNOLOGY_ORDER,
    BUILDINGS,
    EXPANSION_BUILDINGS,
    BUILDING_CATEGORIES,
    MONUMENTS,
    STARTING_WEALTH,
    RATES,
    FEED_COST,
    UNFED_PENALTY,
    CORN_PER_POINT,
    SKULL_POINTS,
    MONUMENT_RATE,
    PLAYER_COLORS,
    CALENDAR_DAYS,
    FOOD_DAYS,
    AGE_START_DAY,
    JUNGLE_GROUPS,
    TRIBES,
    PROPHECIES,
    PROPHECY_BAND_POINTS,
    QUICK_ACTIONS,
    QUICK_ACTION_AGE1,
    QUICK_ACTION_AGE2,
  };
});
