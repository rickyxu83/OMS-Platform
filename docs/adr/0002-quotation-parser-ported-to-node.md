# 报价单解析用 Node 重写，不在后端引入 Python 运行时

报价单导入（上传厂商报价 .xlsx → 解析出品项）已有经过验证的 Python 实现 `quotation_parser.py`（openpyxl，处理合并单元格、TO/ATTN 块、TEL/FAX 双块歧义、定价行判定、税率扫描）。决定将其字段规则重写为 Node（后端 `backend` 内，用 xlsx/exceljs 读表），而不是保留 Python 文件、子进程调用或单独起 Python 服务。

原因：OMS 后端是单一 Node 运行时 + Docker 部署，引入 Python 意味着镜像/部署/依赖多一套；同一份业务口径放进后端模块，导入能力直接成为后端接口的一部分。

代价：重写时需保持 parser 已覆盖的边界行为（合并单元格取左上值、块内 TEL/FAX 取对侧、组价合并单元格只计一次）。解析规则变更时两处（旧 Python、新 Node）不会自动同步，旧文件保留在 mr-blank-template 仓库作为参照。
