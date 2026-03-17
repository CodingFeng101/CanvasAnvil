<p align="center">
  <img src="public/logo.png" alt="CanvasAnvil logo" width="92%" />
</p>

<h1 align="center">CanvasAnvil</h1>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh-CN.md">简体中文</a> |
  <a href="README.zh-TW.md">繁體中文</a> |
  <a href="README.ja-JP.md">日本語</a> |
  <a href="README.ko-KR.md">한국어</a> |
  <a href="README.fr-FR.md">Français</a>
</p>

CanvasAnvil est une plateforme IA multi-canvas dédiée aux diagrammes de flux, aux workflows CAD et à la génération/édition de PPT.

## Version

Version actuelle : `v1.0.0`

`v1.0.0` est la première grande version réellement exploitable. Elle améliore surtout l’édition de PPT existants, en particulier l’édition de texte sur des PPT exportés depuis NotebookLM.

## Points forts de v1.0.0

- Expérience unifiée entre `Flow`, `CAD` et `PPT`
- Prise en charge de l’édition de texte sur des PPT exportés depuis NotebookLM
- Workflow mieux adapté à la modification et à l’itération sur des PPT existants, pas seulement à la première génération
- Les images importées dans PPT n’injectent plus de gros payloads base64 bruts dans le chat
- Les requêtes de génération et d’édition d’images PPT passent maintenant par un proxy local pour une meilleure compatibilité navigateur
- Gestion plus stable des images de référence avec limite du nombre d’images, compression et retry de secours
- Correction de plusieurs problèmes de texte corrompu dans l’espace de travail PPT et dans la documentation

## Aperçu des canvas

<table>
  <tr><td width="680" align="center"><strong>Canvas Flow</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/flow.gif?raw=1" alt="Canvas Flow" width="680" /></td></tr>
</table>

<table>
  <tr><td width="680" align="center"><strong>Canvas CAD</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/cad.gif?raw=1" alt="Canvas CAD" width="680" /></td></tr>
</table>

<table>
  <tr><td width="680" align="center"><strong>Canvas PPT</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/ppt.gif?raw=1" alt="Canvas PPT" width="680" /></td></tr>
</table>

## Démo en ligne

- [Ouvrir CanvasAnvil](https://canvasanvil.codingfgd.asia)

## Tutoriels vidéo

- [Bilibili](https://www.bilibili.com/video/BV1jzZ3BBEHc?vd_source=b6b031f92061ae667eba1185f4782a1c)
- [YouTube](https://youtu.be/n3Otj--aLRo)
- [Douyin](https://v.douyin.com/JwlwhmE6R40/)

## Vue d’ensemble des capacités

- `Flow` : génération de diagrammes de flux et édition partielle basées sur draw.io XML
- `CAD` : planification de workflows intérieurs, planches d’analyse, plans 2D, tâches de rendu et BOM
- `PPT` : génération de diapositives structurées, édition au niveau de la page, itération assistée par image et export

## Démarrage rapide

1. Installer les dépendances

```bash
npm install
```

2. Lancer le développement local

```bash
npm run dev
```

URL par défaut : `http://localhost:5173`

3. Vérifier les types

```bash
npm run check
```

4. Build de production

```bash
npm run build
```

## Scripts utiles

- `npm run dev` : démarrer le serveur Vite
- `npm run dev:full` : démarrer les serveurs Web et API ensemble
- `npm run dev:web` : démarrer le frontend
- `npm run dev:api` : démarrer l’API
- `npm run check` : vérification TypeScript
- `npm run lint` : ESLint
- `npm run build` : build de production
- `npm run preview` : prévisualiser le build
- `npm start` : démarrer le serveur API

## Notes de développement

- La configuration IA est lue depuis les paramètres locaux de l’application et peut pointer vers des fournisseurs personnalisés
- Le développement local PPT dépend maintenant de la route proxy locale `/api/ppt-ai`
- Après une modification du routage API local dans `vite.config.ts`, redémarrez le serveur de développement

## Structure du projet

```text
.
├─ agent/                      # Prompts Agent et spécifications des sous-agents
├─ public/                     # Ressources statiques
├─ src/
│  └─ workspaces/
│     ├─ flow/                 # Canvas Flow
│     ├─ cad/                  # Canvas CAD
│     └─ ppt/                  # Canvas PPT
├─ api/                        # Points d’entrée des routes API locales
└─ README.md
```

## Origines et intégrations

- Canvas Flow : intégré et étendu depuis [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io)
- Canvas PPT : intégré et étendu depuis [banana-slides](https://github.com/Anionex/banana-slides.git)
- Canvas CAD : implémentation interne incluant workflow agent, édition 2D SVG, orchestration des rendus et pipeline BOM

## Documentation

- Guide de déploiement : [deploy/README.md](deploy/README.md)

## Contact

Scannez le QR code WeChat ci-dessous pour contacter l’auteur.

<p align="left">
  <img src="public/wechat.jpg" alt="WeChat QR code" width="280" />
</p>
