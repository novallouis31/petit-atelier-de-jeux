/**
 * Hauteur du terrain en un point quelconque.
 *
 * Le maillage du terrain (`trackMesh.js`) et le placement du décor
 * (`scenery.js`) doivent utiliser **la même formule** : sinon les arbres,
 * rochers et tribunes flottent au-dessus du sol ou s'y enfoncent.
 */

/**
 * @param {object} p       projection du point sur la piste : `x, y, z` du
 *                         point projeté et axe latéral interpolé
 *                         `rx, ry, rz` (le dévers est dans `ry`)
 * @param {number} distance distance perpendiculaire à la piste
 * @param {number} half    demi-largeur de la piste en ce point
 * @param {number} x       coordonnée monde X du point
 * @param {number} z       coordonnée monde Z du point
 */
export function hauteurTerrain(p, distance, half, x, z) {
  const ecart = Math.max(0, distance - half);
  const bruit = Math.sin(x * 0.021) * Math.cos(z * 0.017) * 2.4;
  const liberte = Math.min(1, Math.max(0, (ecart - 12) / 40));

  // Base : la chaussée **prolongée par son dévers**, au droit de la
  // projection. La chaussée est inclinée sur le côté (dévers) : partir de
  // l'axe seul laissait le terrain au-dessus d'elle, et il la perçait d'un
  // escalier de triangles (spectacle très visible sur la neige).
  let base = p.y;
  if (p.ry && p.rx !== undefined) {
    const lateral = (x - p.x) * p.rx + (z - p.z) * p.rz;
    const plan = p.y + p.ry * lateral;
    // Le plan de la chaussée ne vaut que près de la piste : prolongé au
    // loin, il ferait grimper le terrain en murée du côté surélevé du
    // dévers (et le versant d'en face passerait à l'ombre). On fond donc
    // vers le profil libre au-delà du run-off.
    const t = Math.min(1, Math.max(0, (ecart - 8) / 22));
    const pond = 1 - t * t * (3 - 2 * t);
    base = p.y + pond * (plan - p.y);
  }
  // Marge sous la chaussée : 18 cm. Assez pour que la grille de terrain
  // (4 m de côté) ne perce jamais la route, même là où la coupe locale et
  // la projection diffèrent de quelques centimètres (courbes serrées).
  return base - 0.18 - ecart * 0.08 + bruit * liberte;
}

/**
 * Niveau du plan d'eau pour les circuits « lake », sinon `null`.
 *
 * Partagé par le maillage (`trackMesh.js`) et le décor (`scenery.js`) :
 * le décor doit refuser tout objet dont le pied serait sous ce niveau,
 * sinon arbres et buissons poussent au milieu du lac.
 */
export function niveauEau(track, theme) {
  if (theme?.env !== 'lake') return null;
  let plusBas = Infinity;
  for (const p of track.pts) if (p.y < plusBas) plusBas = p.y;
  return plusBas - 5.0;
}