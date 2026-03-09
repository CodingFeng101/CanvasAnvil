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

CanvasAnvil est une plateforme IA multi-canvas qui transforme une exigence unique en livrables itérables.

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

## Tutoriels vidéo

- [Regarder sur Bilibili](https://www.bilibili.com/video/BV1jzZ3BBEHc?vd_source=b6b031f92061ae667eba1185f4782a1c)
- [Regarder sur YouTube](https://youtu.be/n3Otj--aLRo)
- [Regarder sur Douyin](https://v.douyin.com/JwlwhmE6R40/)

## Essayer CanvasAnvil

- [Ouvrir CanvasAnvil](https://canvasanvil.codingfgd.asia)
- Remarque : la configuration serveur actuelle est modeste, le service peut parfois être lent.

## Vue d'ensemble des capacités (côté utilisateur)

- `Flow` : génération de diagrammes de flux et éditions partielles (draw.io XML)
- `CAD` : planification d'aménagement intérieur, tableaux d'analyse, plans 2D, tâches de rendu, BOM
- `PPT` : génération de brouillons de présentation et édition itérative

## Workflow type

1. Saisir le besoin
2. Générer/itérer le plan de conception
3. Générer les tableaux d'analyse et valider la stratégie
4. Générer et éditer le plan 2D
5. Exporter les livrables (diagrammes / listes / diapositives)

## Démarrage rapide

1. Installer les dépendances
```bash
npm install
```
2. Lancer le mode développement
```bash
npm run dev
```
URL par défaut : `http://localhost:5173`

3. Vérification de types
```bash
npm run check
```
4. Build de production
```bash
npm run build
```

## Origines et intégrations

- Canvas Flow : intégré et amélioré depuis [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io)
- Canvas PPT : intégré et amélioré depuis [banana-slides](https://github.com/Anionex/banana-slides.git)
- Canvas CAD : implémentation interne (architecture, workflow Agent, pipeline d'édition 2D SVG, pipeline BOM/rendu)

Améliorations clés :

- UX unifiée entre les canvas (chat, blocs de code, application en un clic)
- Routage Agent et mécanismes de retry plus stables
- Capacités spécifiques CAD (patch / replace / BOM / workflow de rendu à 7 slots)
- Pipelines transverses d'état/version/export

## Capacités principales (côté développeur)

- Flow : génération de diagrammes pilotée par chat, patch/replace, application en un clic, restauration de snapshots
- CAD : sortie `cad_plan`, génération parallèle de tableaux d'analyse, mises à jour partielles 2D SVG avec références d'images d'analyse, rendus concurrents, export BOM
- PPT : génération de contenu structuré, éditions incrémentales par page, itérations en streaming

## Stack technique

- Frontend : React 18 + TypeScript + Vite
- UI : Tailwind CSS + Radix UI + Lucide
- Moteurs de diagrammes : draw.io/diagrams.net pour Flow, SVG-Edit pour CAD
- Intégration de modèles : accès multi-modèles configurable (chat / image)

## Scripts utiles

- `npm run dev` : démarrer le serveur de développement
- `npm start` : démarrage production (site statique + API)
- `npm run build` : build de production
- `npm run check` : vérification TypeScript
- `npm run lint` : ESLint

## Structure du projet (chemins clés)

```text
.
|- agent/                      # Prompts et specs de sous-agents CAD/Flow/PPT
|- public/                     # Ressources statiques (incluant SVG-Edit)
|- src/
|  |- workspaces/
|  |  |- flow/                 # Canvas Flow
|  |  |- cad/                  # Canvas CAD (cœur interne)
|  |  |- ppt/                  # Canvas PPT
|- api/                        # Logique API
|- README.md
```

## Documentation

- Guide de déploiement : [Ouvrir le guide de déploiement](deploy/README.md)

## Contact WeChat

Mon QR code WeChat est ci-dessous, n'hésitez pas à me contacter.

<p align="left">
  <img src="public/wechat.jpg" alt="WeChat QR code" width="280" />
</p>
