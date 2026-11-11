/**
 * Passe de post-traitement des effets de vitesse.
 *
 * Pourquoi une passe maison plutôt que `ShaderPass` ?
 *
 * `ShaderPass` a `needsSwap = true` : le compositeur écrit alors le résultat
 * dans le tampon d'écriture, puis fait une **copie** vers le tampon de
 * lecture. Cette copie supplémentaire passe par `CopyShader`, dont le
 * matériau est tone-mappé : l'image est donc traitée deux fois, ce qui
 * délave complètement le rendu (le contraste passait de 10 à 0,04 !).
 *
 * Cette passe écrit donc directement dans le tampon de lecture et déclare
 * `needsSwap = false` : plus aucune copie intermédiaire.
 */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

export class SpeedPass extends Pass {
  /**
   * @param {object} shader  { uniforms, vertexShader, fragmentShader }
   */
  constructor(shader) {
    super();

    this.uniforms = THREE.UniformsUtils.clone(shader.uniforms);
    // `tDiffuse` n'est pas déclaré dans le shader de l'utilisateur : c'est
    // la passe qui fournit la texture de la scène.
    this.uniforms.tDiffuse = { value: null };
    this.material = new THREE.ShaderMaterial({
      name: 'SpeedShader',
      uniforms: this.uniforms,
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      // La passe travaille sur des valeurs linéaires : c'est `OutputPass`
      // qui applique le tone mapping et la conversion sRGB, en fin de
      // chaîne. Un tone mapping ici serait appliqué deux fois.
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
    });

    this.fsQuad = new FullScreenQuad(this.material);
    this.clear = false;
    // On écrit dans le tampon de lecture : pas d'échange, pas de copie.
    this.needsSwap = false;
  }

  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    // Le rendu se fait dans le tampon de lecture : c'est ce tampon qui sera
    // lu par la passe suivante.
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.render(renderer);
  }

  dispose() {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}
