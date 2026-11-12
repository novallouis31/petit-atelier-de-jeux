/**
 * Hauteur du terrain en un point quelconque.
 *
 * Le maillage du terrain (`trackMesh.js`) et le placement du décor
 * (`scenery.js`) doivent utiliser **la même formule** : sinon les arbres,
 * rochers et tribunes flottent au-dessus du sol ou s'y enfoncent.
 */

/**
 * @param {object} p       point de piste le plus proche
 * @param {number} distance distance horizontale à ce point
 * @param {number} half    demi-largeur de la piste en ce point
 * @param {number} x       coordonnée monde X du point
 * @param {number} z       coordonnée monde Z du point
 */
export function hauteurTerrain(p, distance, half, x, z) {
  const ecart = Math.max(0, distance - half);
  const bruit = Math.sin(x * 0.021) * Math.cos(z * 0.017) * 2.4;
  const liberte = Math.min(1, Math.max(0, (ecart - 12) / 40));
  return p.y - 0.08 - ecart * 0.08 + bruit * liberte;
}