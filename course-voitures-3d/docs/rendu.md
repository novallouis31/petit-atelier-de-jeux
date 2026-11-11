# Notes de rendu

Ce document recense les pièges rencontrés avec Three.js r180. Ils ont un
point commun : **le jeu fonctionne, mais l'image est fausse**. Aucune
erreur n'est signalée par la console ; il faut comparer des images pour les
voir.

Ce sont aussi des pièges que l'on ne rencontrerait pas en lisant le code
seulement — d'où l'intérêt de les écrire.

---

## 1. Le tone mapping appliqué deux fois

**Symptôme** : l'image est délavée, les demi-teintes virent au gris pâle,
les couleurs sont ternes. Le contraste s'effondre (mesuré : 5,8 → 0,2).

**Cause** : `renderer.toneMapping` s'applique dans les matériaux, mais
**seulement si le rendu va directement à l'écran** :

```js
// node_modules/three/src/renderers/webgl/WebGLPrograms.js
if (material.toneMapped) {
    if (currentRenderTarget === null || currentRenderTarget.isXRRenderTarget) {
        toneMapping = renderer.toneMapping;
    }
}
```

Dans une chaîne de post-traitement, le rendu va dans une cible : les
matériaux ne tone-mappent donc pas, et c'est `OutputPass` qui s'en charge en
fin de chaîne. C'est le comportement voulu.

Mais si l'on laisse `renderer.toneMapping` actif **et** qu'on ajoute un
`OutputPass`, le tone mapping est appliqué deux fois : une fois par
`OutputPass`, et une fois de plus parce que `OutputPass` lit
`renderer.toneMapping` pour choisir ses `#define`.

**Correction** : ne laisser le tone mapping se faire qu'une fois.

```js
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.3;
composer.addPass(new OutputPass());
```

## 2. La double conversion sRGB

**Symptôme** : même délavage, mais lié à l'espace colorimétrique.

**Cause** : `OutputPass` convertit la sortie en sRGB si
`renderer.outputColorSpace` vaut `SRGBColorSpace`. Or le navigateur
convertit déjà le canvas en sRGB à l'affichage.

**Piège** : supprimer la conversion dans `OutputPass` **délave l'image
autant**. La bonne solution n'est pas de la retirer, mais de laisser la
conversion se faire une seule fois — c'est-à-dire de garder
`outputColorSpace = SRGBColorSpace` et de ne pas ajouter d'autre conversion
en amont.

**Piège neighbourhoods** : `OutputPass` **reconstruit ses `#define` à chaque
rendu**. Modifier `outputPass.material.defines` à la main ne sert à rien :
c'est écrasé au rendu suivant. Il faut agir sur `renderer.outputColorSpace`
ou sur `renderer.toneMapping`.

## 3. La copie superflue du compositeur

**Symptôme** : l'image est nette quand la passe de post-traitement est
désactivée, et totalement délavée dès qu'elle est active — même si cette
passe ne fait qu'une simple copie (`gl_FragColor = texture2D(tDiffuse, vUv)`).

**Cause** : `ShaderPass` a `needsSwap = true`. Le compositeur écrit alors le
résultat dans le tampon d'écriture, puis fait une **copie** vers le tampon
de lecture via `CopyShader` — dont le matériau est tone-mappé. L'image est
donc traitée deux fois.

Mesure : contraste 10,1 avec `needsSwap = false`, contre 0,04 avec
`needsSwap = true`. Soit un facteur 250.

**Correction** : écrire une passe qui rend directement dans le tampon de
lecture, sans échange. C'est ce que fait `src/render/speedPass.js` :

```js
render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this.fsQuad.render(renderer);
}
```

avec `this.needsSwap = false`.

## 4. `UnrealBloomPass` et l'ordre des tampons

`UnrealBloomPass` déclare `needsSwap = false` et écrit son résultat dans le
**tampon de lecture**. Elle peut donc être placée, mais il faut en être
conscient. Par ailleurs, son seuil par défaut (0,86) déclenche le bloom sur
le ciel de Preetham, très lumineux : toute l'image devient blanche.

Le bloom a été retiré de ce projet : le tone mapping et les effets de
vitesse suffisent à l'apparence, et la chaîne est plus simple.

## 5. L'échelle du ciel

**Symptôme** : le ciel affiche des anneaux de mosaïque au lieu d'un dégradé.

**Cause** : `Sky` a une échelle par défaut de 45 000 unités, alors que la
caméra a une distance maximale de 3 000. Le ciel est alors **rogné** par le
plan lointain.

**Correction** : ramenée à 2 000, et `camera.far` porté à 6 000.

## 6. L'ordre des triangles

**Symptôme** : la route ou le terrain est invisible (on voit à travers), ou
noir (éclairé par en dessous).

**Cause** : dans `BufferGeometry`, l'ordre des indices détermine le sens de
la normale. Un triangle défini dans le mauvais sens est éliminé par le
back-face culling, ou éclairé par la normale opposée.

**Correction** : vérifier le sens avec le produit vectoriel :

```js
const normale = new THREE.Vector3()
    .subVectors(b, a)
    .cross(new THREE.Vector3().subVectors(c, a));
// normale.y > 0 : le triangle est dans le sens direct (visible d'au-dessus)
```

Le test `tests/render.test.js` vérifie ce point pour la route.

## 7. L'échelle des textures

**Symptôme** : la texture est appliquée mais l'image reste un aplat.

**Cause** : les UV du maillage de route sont exprimés **en mètres**. Avec
`repeat = 1`, une texture de 1 024 px couvre un mètre : à l'échelle de
l'écran, le motif est si serré que le filtrage mipmap le réduit à un aplat
uniforme.

**Correction** : `repeat = 1/8` pour une texture qui couvre 8 mètres.

## 8. La zone d'ombre

**Symptôme** : tout le terrain est noir, la voiture est invisible.

**Cause** : la caméra d'ombre est fixe à l'origine du circuit, et la zone
d'ombre (220 m de large) est trop petite par rapport à la carte : le
relief projette une ombre sur tout ce qui est autour.

**Correction** : la cible de la lumière directionnelle suit la voiture, et
la zone d'ombre est resserrée (60 m) pour améliorer la résolution de la
shadow map.

---

## Méthode de diagnostic

Les images dégradées se diagnostiquent par **mesure**, pas à l'œil :

1. Rendre l'image et la mesurer (contraste local, proportion de pixels
  burnlés, écart-type de la luminance).
2. **Isoler** : désactiver les passes une par une (`pass.enabled = false`) et
   mesurer à chaque fois. La passe qui fait chuter le contraste est
   coupable.
3. Remplacer le shader de la passe par une **simple copie** : si l'image
   reste dégradée, le problème est dans la chaîne, pas dans le shader.

Une dernière prudence : `gl.readPixels` sur une cible en demi-flottant
demande un `Uint16Array`, pas un `Float32Array`. Une lecture avec le mauvais
type renvoie des zéros et fait croire à une scène noire.
