/*
 * Campagne de stress : beaucoup de parties simulées, graines variées.
 * Usage : node tests/stress.js [nombre]
 */
'use strict';

const { playGame } = require('./helpers.js');

const count = Number(process.argv[2] || 200);
const greed = process.argv.includes('--greed') ? Number(process.argv[process.argv.indexOf('--greed') + 1]) : 0.25;
const failures = [];
for (let seed = 1; seed <= count; seed++) {
  const players = 2 + (seed % 4);
  const expansion = seed % 3 === 0 ? { tribes: true, prophecies: true, quickActions: true } : undefined;
  try {
    const state = playGame({ players, seed: seed * 7919, expansion, maxSteps: 600000, greediness: greed });
    if (state.phase !== 'finished') failures.push(`seed ${seed}: phase ${state.phase}`);
  } catch (error) {
    failures.push(`seed ${seed} (${players} joueurs${expansion ? ', extension' : ''}) : ${error.message}`);
  }
}
if (failures.length) {
  console.log(`${failures.length}/${count} échecs :`);
  for (const line of failures.slice(0, 20)) console.log(' -', line);
  process.exitCode = 1;
} else {
  console.log(`${count} parties simulées sans échec.`);
}
