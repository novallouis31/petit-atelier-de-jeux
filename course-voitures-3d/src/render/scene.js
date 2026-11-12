/**
 * Scène 3D : rendu, lumières, ciel et post-traitement.
 *
 * L'éclairage est entièrement procédural : une lumière directionnelle
 * (le soleil) avec ombres, une lumière hémisphérique (le rebond du ciel)
 * et un ciel analytique de type Preetham, dont on dérive également
 * l'environnement qui alimente les reflets PBR de la carrosserie.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SpeedPass } from './speedPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { SpeedShader } from './effects.js';

/**
 * Crée le rendu et la scène pour un thème donné.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} theme      thème du circuit (src/core/tracks.js)
 */
export function createScene(canvas, theme) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    // Le buffer ne doit survivre à l'affichage que pour les captures
    // (screenshots, validation). Garder cette option en permanence coûte une
    // copie de framebuffer par image : on ne l'active que sur demande.
    preserveDrawingBuffer: /[?&]capture=1/.test(window.location.search),
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Le tone mapping et la conversion sRGB sont laissés à `OutputPass`, en
  // fin de chaîne de post-traitement. Les laisser aussi sur le renderer
  // les appliquerait deux fois : l'image perdait ses contrastes.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  // --- fond : ciel analytique ---
  const sky = new Sky();
  // Le ciel doit rester dans le champ de vision de la caméra : s'il est plus
  // grand que la distance maximale, il est rogné et l'on voit ses anneaux
  // de mosaïque au lieu d'un ciel lisse.
  sky.scale.setScalar(2000);
  sky.material.uniforms.turbidity.value = 6;
  sky.material.uniforms.rayleigh.value = 2.2;
  sky.material.uniforms.mieCoefficient.value = 0.006;
  sky.material.uniforms.mieDirectionalG.value = 0.82;

  const sun = theme.sun;
  const phi = THREE.MathUtils.degToRad(90 - sun.elevation * 90);
  const theta = THREE.MathUtils.degToRad(sun.azimuth * 360);
  sky.material.uniforms.sunPosition.value.setFromSphericalCoords(1, phi, theta);
  scene.add(sky);

  // --- environnement pour les reflets PBR ---
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new THREE.Scene();
  envScene.add(sky.clone());
  const envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
  // L'environnement alimente les reflets PBR. On le garde discret : il
  // s'ajoute à l'éclairage direct, et le ciel est déjà très lumineux.
  scene.environmentIntensity = 0.28;
  pmrem.dispose();

  // --- brouillard : il donne la profondeur et masque l'horizon ---
  scene.fog = new THREE.FogExp2(theme.fog.color, theme.fog.density);

  // --- lumière directionnelle (soleil) ---
  // Les intensités sont calées avec l'exposition basse (0,3) : le soleil
  // est la source principale, le ciel fournissant déjà une part importante
  // de la lumière ambiante via l'environnement.
  const dir = new THREE.DirectionalLight(theme.key, 3.2);
  dir.position.setFromSphericalCoords(180, phi, theta);
  dir.castShadow = true;
  // 1024² et une zone resserrée : la shadow map est redessinée à chaque
  // image, et à 2048² elle coûtait plus cher que le reste de la scène.
  // À 60 m de demi-largeur, 1024 px donnent ~17 px/m — suffisant pour des
  // ombres de voiture et d'arbre.
  dir.shadow.mapSize.set(1024, 1024);
  dir.shadow.camera.near = 1;
  dir.shadow.camera.far = 260;
  const s = 60;
  dir.shadow.camera.left = -s;
  dir.shadow.camera.right = s;
  dir.shadow.camera.top = s;
  dir.shadow.camera.bottom = -s;
  dir.shadow.bias = -0.0006;
  dir.shadow.normalBias = 0.06;
  scene.add(dir);
  scene.add(dir.target);

  // --- lumière hémisphérique (rebond du ciel et du sol) ---
  const hemi = new THREE.HemisphereLight(theme.fill, theme.ambient, 1.6);
  scene.add(hemi);

  // --- caméra ---
  // La distance maximale doit dépasser l'échelle du ciel (2000), sinon le
  // ciel est rogné par le plan lointain.
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 6000);
  camera.position.set(0, 5, -12);

  // --- post-traitement ---
  // On utilise les cibles par défaut du compositeur : elles sont en
  // demi-flottant et **linéaires**. La conversion sRGB et le tone mapping
  // sont faits en une seule fois, par `OutputPass`, en fin de chaîne. Une
  // cible sRGB appliquerait la conversion une seconde fois et délavait
  // complètement l'image.
  const composer = new EffectComposer(renderer);

  // La cible de rendu du compositeur doit être multi-échantillonnée :
  // sinon l'antialiasing du navigateur ne s'applique pas (il ne s'applique
  // qu'au rendu direct vers l'écran) et les bords sont dentelés.
  if (renderer.capabilities.isWebGL2) {
    const echantillons = Math.min(4, renderer.capabilities.maxSamples);
    composer.renderTarget1.samples = echantillons;
    composer.renderTarget2.samples = echantillons;
  }

  composer.addPass(new RenderPass(scene, camera));

  // On n'utilise PAS de `UnrealBloomPass` : cette passe écrit son résultat
  // dans le tampon de lecture au lieu de celui d'écriture, ce qui décale la
  // chaîne de post-traitement et délave l'image. Le tone mapping et les
  // effets de vitesse suffisent à l'apparence.

  // Passe d'effets de vitesse : elle écrit directement dans le tampon de
  // lecture (voir `speedPass.js` pour la raison).
  const speedPass = new SpeedPass(SpeedShader);
  // La passe travaille sur des valeurs linéaires : `OutputPass` se charge du
  // tone mapping et de la conversion sRGB en fin de chaîne. Si le matériau
  // de la passe était lui aussi tone-mappé, le tone mapping serait appliqué
  // deux fois et l'image perdait tout contraste.
  speedPass.material.toneMapped = false;
  composer.addPass(speedPass);

  composer.addPass(new OutputPass());

  // `OutputPass` applique le tone mapping ACES puis la conversion sRGB.
  // Les deux sont nécessaires : sans la conversion sRGB, les demi-teintes
  // s'affichaient délavées (l'image paraissait « laiteuse »).
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Le ciel de Preetham est une source HDR très intense : on expose
  // nettement en dessous, comme face à un ciel de plein soleil. À 0,45
  // l'image était délavée (40 % de pixels burnlés) ; à 0,30 elle garde
  // son contraste et ses couleurs.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.3;

  return { renderer, scene, camera, composer, speedPass, dir, sky };
}

/** Redimensionne le rendu et le compositeur. */
export function resizeScene(ctx, width, height) {
  const { renderer, camera, composer, speedPass } = ctx;
  renderer.setSize(width, height, false);
  composer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  speedPass.uniforms.resolution.value.set(width, height);
}
