# GPT Image Studio

无需构建的单文件文生图 / 图生图工作台，可本地打开或通过 GitHub Pages 使用。

## 功能

- 自定义 API 地址和 API Key，支持五种图像模型选择。
- GPT Image 2.5 的质量档位及透明背景参数联动。
- 多张参考图上传、生成计时、预览与下载。
- IndexedDB 历史缓存：保存提示词、模型、生成图片及参考图，支持复用、逐条删除和一键清空。
- 连接及参数设置保存在当前浏览器；仅勾选“保存 Key”时保存 API Key。

## GitHub Pages

首次启用需要仓库管理员进入 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**：

https://github.com/edwcentauri/gpt-image-studio/settings/pages

随后合并应用 PR 到 `main`。工作流会检查 HTML 入口和内联 JavaScript 语法，并将 `index.html` 自动部署至 Pages。以后每次更新 `main` 都会自动部署，也可在 Actions 页手动运行。PR 只执行检查，不部署。

首次部署成功后的访问地址：

https://edwcentauri.github.io/gpt-image-studio/

部署产物只包含 `index.html` 和 `.nojekyll`，不包含 README 或工作流源码。工作流不需要保存你的图像 API Key。

## 使用

在页面连接设置中填写 API 地址和 API Key，再选择模型与生成参数。浏览器会直接请求所填接口；接口需允许该网页来源的 CORS 请求。

历史缓存属于当前浏览器与来源，换设备、浏览器或从本地文件切换到 Pages 不会自动迁移。清除网站数据、浏览器自动清理或无痕模式可能导致缓存丢失；重要图片请下载保存。若接口只返回图片链接且浏览器无法下载其数据，历史会明确标注仅保存链接、可能过期。

## 验证范围

已进行 JavaScript 语法检查和历史保存、恢复、删除、清空及失败处理的模拟测试。尚未进行真实 API 生成测试或真实浏览器端到端测试。
