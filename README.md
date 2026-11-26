# 个人知识门户

使用 Next.js、React、TypeScript 和 Node.js 内置 SQLite 构建的个人知识管理网站。

## 功能

- 网站收藏、行业资讯、论文库，以及相互独立的分类和标签。
- 论文链接、DOI、论文名称、PDF 和常见文献格式导入；指标带年份和来源，无法核实的指标保留未知状态。
- 私有备忘录和待办事项；正文可视化编辑、自动续写列表、插入图片、查看大图和调整图片排版。
- 兼容 Chat Completions 的模型接口，支持聊天、链接整理、分类和图片分析。
- 自定义外观、背景、页面缩放、闲置特效，以及卡片拖拽排序。
- 管理员会话、访问权限、速率限制、备份和版本检查。

## 本地运行

需要 Node.js 24 或更新的兼容版本。

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

访问 `http://127.0.0.1:3000`。首次运行后，在本机生成的数据目录中读取 `setup-token.txt`，通过管理员登录界面创建自己的账号。也可运行 `npm run setup` 完成交互式初始化。没有预设的管理员账号或密码。

## 配置模型

默认不包含可用的模型配置或密钥。部署者需要在管理员设置中填写自己的 API 地址、模型名称和密钥，或通过环境变量配置。示例文件中的 `AI_BASE_URL`、`AI_MODEL`、`AI_API_KEY` 留空。

模型接入和权限检查代码属于应用功能，不包含原站的模型凭据。测试中的用户名、密码、API Key 和模型响应为独立的模拟数据，不能用于登录任何实际服务。

## 数据边界

- 此仓库不提供原站的收藏、论文记录、备忘录、待办事项、聊天数据、上传图片、管理员账号或实际模型设置。
- 应用会在 `DATA_DIR` 下创建自己的数据库、加密主密钥和初始化码；这些内容不应提交到 Git。
- 源码中的演示书签和资讯是通用公开网址，可自行删除或修改。
- 备忘录、待办和正文图片仅管理员可访问；公开页面中的收藏、资讯和论文内容由部署者决定。
- 本地背景文件保存在当前浏览器，不随源码分发。

## 测试与构建

```powershell
npm run typecheck
npm test
npm run build
```

运行全部单元与后端测试：

```powershell
$testFiles = Get-ChildItem tests -Filter '*.test.ts' | ForEach-Object FullName
node --import tsx --test --test-concurrency=1 $testFiles
```

浏览器测试使用隔离数据目录。可设置 `CHROME_PATH` 为自己的 Chromium、Chrome 或夸克可执行文件路径，再运行 `npm run test:e2e`。测试报告应保存在忽略目录中。

端口测试、SSH 登录、隧道访问、排错与部署步骤见 [阿里云连接与部署教程](docs/DEPLOY-ALIYUN.md)。教程使用占位符；实际连接信息和模型配置由部署者私下保管。项目使用的第三方 PDF 组件保留了相应许可证和声明。
