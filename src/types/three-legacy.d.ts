import 'three';

declare module 'three' {
  interface WebGLRenderer {
    useLegacyLights: boolean;
  }
}

