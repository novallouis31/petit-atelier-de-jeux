/**
 * Hauteur du terrain en un point quelconque.
 *
 * Le maillage du terrain (`trackMesh.js`) et le placement du décor
 * (`scenery.js`) doivent utiliser **la même formule** : sinon les arbres,
 * rochers et tribunes flottent au-dessus du sol ou s'y enfoncent.
 */

/**
 * @param {object} p       point de piste le plus proche (axe, avec
 *                         `rx, ry, rz` — l'axe latéral incluant le dévers —
 *                         quand il est disponible)
 * @param {number} distance distance horizontale à ce point
 * @param {number} half    demi-largeur de la piste en ce point
 * @param {number} x       coordonnée monde X du point
 * @param {number} z       coordonnée monde Z du point
 */
export function hauteurTerrain(p, distance, half, x, z) {
  const ecart = Math.max(0, distance - half);
  const bruit = Math.sin(x * 0.021) * Math.cos(z * 0.017) * 2.4;
  const liberte = Math.min(1, Math.max(0, (ecart - 12) / 40));

  // Base : l'altitude de la chaussée **prolongée par son plan tangent** au
  // niveau du point, pas celle de l'axe. Le dévers abaisse un côté de p.ry
  // par mètre, la pente longitudinale fait monter ou descendre de p.ty par
  // mètre : partir de l'axe seul laisse le terrain au-dessus de la chaussée
  // inclinée, qui la perce d'un escalier de triangles.
  //
  // Mais le plan tangent ne vaut que près de la piste : prolongé au loin, il
  // ferait grimper le terrain en murée du côté surélevé du dévers (et le
  // versant d'en face passerait à l'ombre). On fond donc vers la formule
  // libre au-delà du run-off.
  let base = p.y;
  if (p.ry && p.rx !== undefined) {
    const dx = x - p.x;
    const dz = z - p.z;
    const lateral = dx * p.rx + dz * p.rz;
    const leLong = p.tx !== undefined ? dx * p.tx + dz * p.tz : 0;
    const plan = p.y + p.ry * lateral + p.ty * leLong;
    // 1 jusqu'à 8 m du bord de chaussée, 0 au-delà de 30 m (courbe en S).
    const t = Math.min(1, Math.max(0, (ecart - 8) / 22));
    const pond = 1 - t * t * (3 - 2 * t);
    base = p.y + pond * (plan - p.y);
  }
  return base - 0.08 - ecart * 0.08 + bruit * liberte;
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