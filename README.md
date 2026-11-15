# AI Solo Studio — 空压机 AI 售后助手 Demo

## Phase 2 当前功能
- 客户聊天页调用服务端 POST /api/chat
- 知识库管理：/admin/knowledge
- 支持 PDF（可提取文字层）、TXT、Markdown 上传
- PDF 文本解析、文本切片、关键词检索
- RAG：先检索企业知识库，再通过 LiteLLM Chat Completions 生成答案
- 回答展示命中文档名称、页码和检索片段
- 资料不足时拒答；漏电、带电、拆机、高压等安全问题优先转人工
- 演示资料：docs/demoair-da22-demo-manual.md

## 本地运行
需要 Node.js 20+ 和 pnpm。

```bash
pnpm install --no-frozen-lockfile
cp .env.example .env.local
# 编辑 .env.local，填写 LiteLLM 配置
pnpm dev
```

打开 http://localhost:3000 。

## LiteLLM 环境变量
在服务端 `.env.local` 配置，禁止提交真实 API Key：

```env
LITELLM_BASE_URL=http://localhost:4000/v1
LITELLM_API_KEY=your-litellm-api-key
LITELLM_MODEL=your-litellm-model-name
```

- `LITELLM_BASE_URL`：LiteLLM 网关地址，默认示例为本机 4000 端口。
- `LITELLM_API_KEY`：LiteLLM 网关密钥。
- `LITELLM_MODEL`：LiteLLM 中配置的模型别名。
- 如果网关部署在其他机器或云端，请把地址改成实际可从 Next.js 服务端访问的地址。
- 当前使用 OpenAI 兼容的 `/v1/chat/completions` 接口。

## 演示步骤
1. 打开首页，进入“管理知识库”。
2. 上传 `docs/demoair-da22-demo-manual.md` 或可提取文字的 PDF。
3. 打开客户咨询页，问“报修需要提供哪些设备信息？”。
4. 检查回答是否由模型归纳，并显示资料来源。
5. 问“E05 故障代码是什么意思？”，资料没有明确说明时应拒绝猜测。
6. 问“设备出现漏电，我应该怎么拆机检查？”，系统应直接转人工，不调用模型。
7. 问一个知识库完全没有涉及的问题，系统应提示资料不足。
8. 提交报修单，在管理后台查看工单。

## API
- GET /api/knowledge：文档列表
- POST /api/knowledge：上传文件（multipart/form-data，字段名 file）
- DELETE /api/knowledge?id=<id>：删除文档
- POST /api/chat：{ "message": "..." }

## 当前限制
- 当前 RAG 检索仍是关键词匹配，不是 Embedding 向量语义检索；中文同义表达可能检索不到。
- LLM 生成受检索片段约束，但仍需通过测试集验证，不应视为绝对不会幻觉。
- 文档数据写入运行 Next.js 的本地 `data/knowledge.json`，文件已加入 gitignore。
- 本地 JSON 文件不适用于多实例或无持久磁盘的 Serverless 部署。
- PDF 仅支持可提取文本的 PDF，扫描件 OCR 暂未实现。
- 工单仍使用浏览器 localStorage。
- DemoAir、DA-22、E05 均为虚构演示内容，不可用于真实设备诊断。

## 下一阶段
- Embedding + pgvector 语义检索
- 按租户隔离知识库和数据权限
- 服务端工单持久化、身份认证和操作审计
- 生产环境限流、日志脱敏、监控与数据备份
