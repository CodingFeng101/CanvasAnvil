<p align="center">
  <img src="public/logo.png" alt="CanvasAnvil logo" width="92%" />
</p>

<h1 align="center">CanvasAnvil</h1>

<p align="center">
  <strong>Une plateforme IA multi-canvas pour Flow, CAD et PPT.</strong>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">Simplified Chinese</a> ·
  <a href="README.zh-TW.md">Traditional Chinese</a> ·
  <a href="README.ja-JP.md">Japanese</a> ·
  <a href="README.ko-KR.md">Korean</a> ·
  <a href="README.fr-FR.md">French</a>
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-v1.0.2-2563eb?style=for-the-badge" />
  <img alt="workspaces" src="https://img.shields.io/badge/workspaces-Flow%20%7C%20CAD%20%7C%20PPT-0f766e?style=for-the-badge" />
  <img alt="stack" src="https://img.shields.io/badge/stack-Vite%20%2B%20React%20%2B%20TypeScript-7c3aed?style=for-the-badge" />
</p>

> CanvasAnvil réunit dans un même espace la génération de diagrammes de flux, les workflows CAD et la production de PPT.

## Version

Version actuelle : `v1.0.2`

- `v1.0.2` : passage du workflow PPT à un mode image-first, report de l'OCR et de la réinjection du texte au moment de l'export `PPTX éditable`, et persistance des modèles PPT dans IndexedDB
- `v1.0.1` : correction des problèmes de persistance des images dans les espaces de travail PPT et CAD

## ✨ Vue d'ensemble

| Canvas | Rôle principal | Sorties typiques |
| --- | --- | --- |
| `Flow` | génération et édition partielle basées sur draw.io XML | diagrammes de flux, schémas système, schémas logiques |
| `CAD` | planification et analyse pour les workflows d'intérieur | planches d'analyse, plans 2D, tâches de rendu, BOM |
| `PPT` | génération structurée de diapositives et itération orientée image | présentations, visuels de slides, exports multi-format |

## 🚀 Mise à jour récente

- Le workflow PPT est maintenant centré sur l'image
- Les ajustements et rerendus dans l'interface régénèrent directement les images des diapositives au lieu de traiter à l'avance des calques de texte éditables pendant la création
- L'export est séparé en `PDF`, `PPT basé sur des images` et `PPTX éditable`
- L'OCR, la génération d'un fond sans texte et la réinjection du texte ne s'exécutent que lors de l'export `PPTX éditable`
- Les modèles PPT importés et les préférences de modèles prédéfinis masqués sont maintenant persistés localement via IndexedDB

## 🖼️ Aperçu des canvas

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

## 🌐 Démo en ligne

- [Ouvrir CanvasAnvil](https://canvasanvil.codingfgd.asia)

## 🎬 Tutoriels vidéo

- [Bilibili](https://www.bilibili.com/video/BV1jzZ3BBEHc?vd_source=b6b031f92061ae667eba1185f4782a1c)
- [YouTube](https://youtu.be/n3Otj--aLRo)
- [Douyin](https://v.douyin.com/JwlwhmE6R40/)

## 🧩 Capacités

- `Flow` : génération de diagrammes de flux et édition partielle basées sur draw.io XML
- `CAD` : planification de workflows intérieurs, planches d'analyse, plans 2D, tâches de rendu et BOM
- `PPT` : génération structurée de diapositives, itération orientée image, persistance des modèles et export multi-format

## ⚡ Démarrage rapide

1. Installer les dépendances

```bash
npm install
```

2. Lancer le développement local

```bash
npm run dev
```

URL par défaut : `http://localhost:5173`

3. Exécuter la vérification de types

```bash
npm run check
```

4. Construire pour la production

```bash
npm run build
```

## 🛠️ Scripts utiles

- `npm run dev` : démarrer le serveur de développement Vite
- `npm run dev:full` : démarrer ensemble les serveurs de développement Web et API
- `npm run dev:web` : démarrer le serveur frontend
- `npm run dev:api` : démarrer le serveur API
- `npm run check` : vérification TypeScript
- `npm run lint` : ESLint
- `npm run build` : build de production
- `npm run preview` : prévisualiser le build
- `npm start` : lancer le service API

## 🧪 Notes de développement

- La configuration IA est lue depuis les réglages locaux de l'application et peut être reliée à des fournisseurs de modèles personnalisés
- Le développement local du module PPT dépend du proxy local `/api/ppt-ai`
- Après modification du routage API local dans `vite.config.ts`, redémarrez le serveur de développement

## 🗂️ Structure du projet

```text
.
├── agent/                      # Prompts Agent et spécifications des sous-agents
├── public/                     # Ressources statiques
├── src/
│   └── workspaces/
│       ├── flow/               # Canvas Flow
│       ├── cad/                # Canvas CAD
│       └── ppt/                # Canvas PPT
├── api/                        # Entrées des routes API locales
└── README.md
```

## 🔗 Origines et intégrations

- Canvas Flow : intégré et étendu à partir de [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io)
- Canvas PPT : intégré et étendu à partir de [banana-slides](https://github.com/Anionex/banana-slides.git)
- Canvas CAD : développé en interne, avec workflow agent, édition SVG 2D, orchestration de rendu et pipeline BOM

## 📚 Documentation

- Guide de déploiement : [deploy/README.md](deploy/README.md)

## 📮 Contact

Scannez le QR code WeChat ci-dessous pour contacter l'auteur.

<p align="left">
  <img src="public/wechat.jpg" alt="WeChat QR code" width="280" />
</p>
