/**
 * Validation du rendu : repère les objets **sans texture**.
 *
 * Un matériau uni se voit immédiatement à l'écran — un mur blanc, un sol
 * plat, une carrosserie en plastique — et c'est le genre de défaut que l'on
 * repère trop tard, une fois le circuit terminé. Ce module sert donc deux
 * fois :
 *
 *  - au chargement d'un circuit, il signale les matériaux non texturés dans
 *    la console ;
 *  - sous Node, un test le passe sur tous les circuits pour garantir que le
 *    décor ne régresse pas.
 *
 * Règle : un matériau est valide s'il a une carte (`map`), ou s'il est
 * explicitement exonéré — les vitres (la texture n'y ferait rien) et les
 * phares (ce sont des sources de lumière, pas des surfaces).
 */

/** Nom lisible d'un objet, pour les messages de diagnostic. */
function nomObjet(obj) {
  const chemin = [];
  let courant = obj;
  while (courant) {
    if (courant.name) chemin.unshift(courant.name);
    courant = courant.parent;
  }
  return chemin.join('/') || obj.type;
}

/** Un matériau est-il texturé (ou exonéré) ? */
export function materiauTexte(materiau) {
  if (!materiau) return false;
  // Ciel et effets : matériaux à shader, la texture n'a pas de sens.
  if (materiau.isShaderMaterial) return true;
  if (materiau.map) return true;
  if (materiau.transparent) return true; // vitres
  if (materiau.emissive && materiau.emissiveIntensity > 0) return true; // phares
  return false;
}

/**
 * Valide un objet 3D.
 * @param {THREE.Object3D} scene
 * @returns {{meshes:number, instanced:number, triangles:number, nonTextures:Array, ok:boolean}}
 */
export function validerScene(scene) {
  const nonTextures = [];
  let meshes = 0;
  let instanced = 0;
  let triangles = 0;

  scene.traverse((obj) => {
    if (!obj.isMesh) return;
    meshes++;
    if (obj.isInstancedMesh) instanced++;

    const geo = obj.geometry;
    const position = geo?.getAttribute('position');
    if (geo && position) {
      const facteur = obj.isInstancedMesh ? obj.count : 1;
      const tri = geo.index ? geo.index.count / 3 : position.count / 3;
      triangles += tri * facteur;
    }

    const materiaux = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of materiaux) {
      if (materiauTexte(m)) continue;
      nonTextures.push({
        objet: nomObjet(obj),
        type: m?.type ?? 'aucun',
        couleur: m?.color ? `#${m.color.getHexString()}` : null,
      });
    }
  });

  return {
    meshes,
    instanced,
    triangles: Math.round(triangles),
    nonTextures,
    ok: nonTextures.length === 0,
  };
}

/**
 * Valide un ensemble d'objets et consolide le résultat.
 * @param {Array<{nom:string, objet:THREE.Object3D}>} groupes
 */
export function validerTout(groupes) {
  const details = groupes.map(({ nom, objet }) => {
    const rapport = validerScene(objet);
    return { nom, ...rapport };
  });
  const nonTextures = details.flatMap((d) =>
    d.nonTextures.map((n) => ({ ...n, groupe: d.nom }))
  );
  return {
    groupes: details,
    nonTextures,
    ok: nonTextures.length === 0,
  };
}