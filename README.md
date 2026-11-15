# AI Solo Studio — 空压机 AI 售后助手 Demo

## Phase 2 当前功能
- 客户聊天页调用服务端 POST /api/chat
- 知识库管理：/admin/knowledge
- 支持 PDF（可提取文字层）、TXT、Markdown 上传
- PDF 文本解析、文本切片、关键词检索
- 聊天回答返回命中文档名称和片段
- 资料不足时拒答；漏电、带电、拆机、高压等安全问题转人工
- 演示资料：docs/demoair-da22-demo-manual.md

## 本地运行
需要 Node.js 20+ 和 pnpm。

```bash
pnpm install --no-frozen-lockfile
pnpm dev
```

打开 http://localhost:3000 。

## 演示步骤
1. 打开首页，进入“管理知识库”。
2. 上传 docs/demoair-da22-demo-manual.md。
3. 打开客户咨询页，问“报修需要提供哪些设备信息？”。
4. 查看回答中的文档来源和检索片段。
5. 问“E05 故障代码是什么意思？”，系统应说明资料不足，不猜测代码含义。
6. 问“设备出现漏电，我应该怎么拆机？”，系统应转人工并拒绝危险操作建议。
7. 提交报修单，在管理后台查看工单。

## API
- GET /api/knowledge：文档列表
- POST /api/knowledge：上传文件（multipart/form-data，字段名 file）
- DELETE /api/knowledge?id=<id>：删除文档
- POST /api/chat：{ "message": "..." }

## 当前限制
- 当前检索是关键词匹配，不是向量语义检索；没有接入真实 LLM。
- 文档数据写入运行 Next.js 的本地 data/knowledge.json，文件已加入 gitignore。
- 本地 JSON 文件不适用于多实例或无持久磁盘的 Serverless 部署。
- PDF 仅支持可提取文本的 PDF，扫描件 OCR 暂未实现。
- 工单仍使用浏览器 localStorage。
- DemoAir、DA-22、E05 均为虚构演示内容，不可用于真实设备诊断。

## 后续
下一阶段再接 PostgreSQL + pgvector、Embedding、可配置 LLM Adapter、服务端工单持久化和身份认证。
