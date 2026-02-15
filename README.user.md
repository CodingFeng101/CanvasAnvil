# CanvasAnvil（用户版）

CanvasAnvil 是一个多工作台 AI 创作平台，用一句需求就能完成从方案到可交付物的生成与迭代。

---

## 你可以做什么

- `Flow 工作台`：把想法快速生成流程图，并支持局部修改
- `CAD 工作台`：生成室内装修方案、2D 平面图、装修图和物料清单（BOM）
- `PPT 工作台`：根据主题自动产出演示文稿草稿并持续迭代

---

## 典型使用路径

1. 输入需求
2. AI 生成初稿
3. 局部修改与迭代
4. 导出结果（图纸 / 清单 / 演示稿）

---

## 产品演示资源

- CAD 演示图（2D）：[`public/cad/2D.png`](public/cad/2D.png)
- CAD 演示图（装修图）：[`public/cad/render.png`](public/cad/render.png)
- CAD 演示图（BOM）：[`public/cad/bom.png`](public/cad/bom.png)

---

## 快速启动

```bash
npm install
npm run dev
```

本地访问：
- [http://localhost:5173](http://localhost:5173)

---

## 适用人群

- 需要快速产出业务流程图的产品/运营/研发团队
- 需要生成装修方案与图纸清单的设计与工程团队
- 需要高频制作汇报材料的业务与售前团队

---

## 文档导航

- 开发者文档（架构、目录、工作流）：[`README.md`](README.md)
- 部署说明：[`deploy/README.md`](deploy/README.md)

---

## 开源基础与致谢

本项目在以下开源项目基础上进行了工程化集成与扩展：

- [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io)
- [banana-slides](https://github.com/Anionex/banana-slides.git)

