import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorToast } from "@/components/ErrorToast";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/services/api";
import { Skeleton } from "@/components/Skeleton";
import { formatCount } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";

interface TimesheetItem {
  id?: string | number;
  orderNo?: string;
  customerName?: string;
  engineerName?: string;
  serviceDate?: string;
  serviceAt?: string;
  date?: string;
  weekday?: string;
  workNature?: string;
  serviceMode?: string;
  category?: string;
  productName?: string;
  workContent?: string;
  salesperson?: string;
  progress?: string;
  remark?: string;
  source?: string;
}

interface EngineerOption {
  id: string | number;
  realName?: string;
  username?: string;
}

interface SalespersonOption {
  id: string | number;
  realName?: string;
  username?: string;
  role?: string;
}

interface CustomerOption {
  id: string | number;
  name?: string;
}

function formatDate(value?: string) {
  if (!value) return "-";
  return String(value).replace("T", " ").slice(0, 16);
}

function safeSheetName(value: string, fallback: string) {
  const cleaned = value.replace(/[\\/?*\[\]:]/g, " ").trim() || fallback;
  return cleaned.slice(0, 31);
}

function getServiceDate(item: TimesheetItem) {
  return item.date || item.serviceDate || item.serviceAt || "";
}

function getSourceLabel(source?: string) {
  return source === "service_order" ? "工单" : source === "manual" ? "手工记录" : source || "-";
}

async function downloadEngineerWorkbook(filename: string, label: string, items: TimesheetItem[]) {
  const [{ Workbook }, { saveAs }] = await Promise.all([
    import("exceljs"),
    import("file-saver"),
  ]);
  const workbook = new Workbook();
  workbook.creator = "Service Sheet RC";
  workbook.created = new Date();
  workbook.modified = new Date();

  const groups = new Map<string, TimesheetItem[]>();
  for (const item of items) {
    const engineer = item.engineerName || "未指定工程师";
    groups.set(engineer, [...(groups.get(engineer) || []), item]);
  }

  const sortedGroups = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right, "zh-Hans-CN"));
  const columns = [
    { header: "工单编号", key: "orderNo", width: 20 },
    { header: "填表人", key: "engineerName", width: 14 },
    { header: "日期", key: "date", width: 13 },
    { header: "星期", key: "weekday", width: 10 },
    { header: "工作性质", key: "workNature", width: 13 },
    { header: "客户名称", key: "customerName", width: 24 },
    { header: "专案/产品", key: "productName", width: 24 },
    { header: "工作内容", key: "workContent", width: 42 },
    { header: "进度", key: "progress", width: 12 },
    { header: "备注", key: "remark", width: 18 },
    { header: "来源", key: "source", width: 12 },
  ];

  sortedGroups.forEach(([engineer, engineerItems], index) => {
    const worksheet = workbook.addWorksheet(safeSheetName(engineer, `工程师${index + 1}`), {
      views: [{ state: "frozen", ySplit: 4 }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    worksheet.columns = columns.map(({ key, width }) => ({ key, width }));
    worksheet.mergeCells(1, 1, 1, columns.length);
    worksheet.getCell(1, 1).value = "敦阳（宁波）科技有限公司";
    worksheet.mergeCells(2, 1, 2, columns.length);
    worksheet.getCell(2, 1).value = `月报记录 · ${label}`;
    worksheet.mergeCells(3, 1, 3, columns.length);
    worksheet.getCell(3, 1).value = `填表人：${engineer}　记录数：${engineerItems.length}`;
    worksheet.addRow(columns.map((column) => column.header));

    const sortedItems = [...engineerItems].sort((left, right) => {
      const dateCompare = String(getServiceDate(left)).localeCompare(String(getServiceDate(right)));
      if (dateCompare) return dateCompare;
      return String(left.orderNo || left.id || "").localeCompare(String(right.orderNo || right.id || ""));
    });

    sortedItems.forEach((item) => {
      worksheet.addRow({
        orderNo: item.orderNo || "",
        engineerName: item.engineerName || engineer,
        date: getServiceDate(item),
        weekday: item.weekday || "",
        workNature: item.workNature || item.serviceMode || "",
        customerName: item.customerName || "",
        productName: item.productName || "",
        workContent: item.workContent || "",
        progress: item.progress || "",
        remark: item.remark || item.orderNo || "",
        source: getSourceLabel(item.source),
      });
    });

    worksheet.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: Math.max(1, worksheet.rowCount), column: columns.length },
    };

    worksheet.getRow(1).height = 30;
    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E1065" } };
      cell.alignment = { vertical: "middle", horizontal: "left" };
    });
    worksheet.getRow(2).height = 24;
    worksheet.getRow(2).eachCell((cell) => {
      cell.font = { bold: true, size: 12, color: { argb: "FF5B21B6" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F3FF" } };
      cell.alignment = { vertical: "middle", horizontal: "left" };
    });
    worksheet.getRow(3).height = 22;
    worksheet.getRow(3).eachCell((cell) => {
      cell.font = { size: 10, color: { argb: "FF7C6F9C" } };
      cell.alignment = { vertical: "middle", horizontal: "left" };
    });
    worksheet.getRow(4).height = 24;
    worksheet.getRow(4).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8B5CF6" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = {
        top: { style: "thin", color: { argb: "FFEDE9FE" } },
        left: { style: "thin", color: { argb: "FFEDE9FE" } },
        bottom: { style: "thin", color: { argb: "FFEDE9FE" } },
        right: { style: "thin", color: { argb: "FFEDE9FE" } },
      };
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 4) return;
      row.height = 22;
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFEDE9FE" } },
          left: { style: "thin", color: { argb: "FFEDE9FE" } },
          bottom: { style: "thin", color: { argb: "FFEDE9FE" } },
          right: { style: "thin", color: { argb: "FFEDE9FE" } },
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: "left",
          wrapText: [7, 8, 10].includes(colNumber),
        };
        if (rowNumber % 2 === 0) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F3FF" } };
        }
      });
    });

    worksheet.getColumn("date").numFmt = "yyyy-mm-dd";
    worksheet.properties.defaultRowHeight = 22;
    worksheet.headerFooter.oddHeader = `&C敦阳（宁波）科技有限公司　${label} - ${engineer}`;
    worksheet.headerFooter.oddFooter = "&R第 &P / &N 页";
  });

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}

function defaultMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const last = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { first, last };
}

export function Timesheets() {
  const { user } = useAuth();
  const defaults = useMemo(() => defaultMonthRange(), []);
  const [startDate, setStartDate] = useState(defaults.first);
  const [endDate, setEndDate] = useState(defaults.last);
  const [engineerId, setEngineerId] = useState("all");
  const [salesperson, setSalesperson] = useState("all");
  const [customerId, setCustomerId] = useState("all");
  const [engineers, setEngineers] = useState<EngineerOption[]>([]);
  const [salespeople, setSalespeople] = useState<SalespersonOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [items, setItems] = useState<TimesheetItem[]>([]);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const userRole = String(user?.role || "");
  const canSelectSalesperson = userRole !== "sales";

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        engineerId,
      });
      if (canSelectSalesperson && salesperson !== "all") params.set("salesperson", salesperson);
      if (customerId !== "all") params.set("customerId", customerId);
      const data = await api.get(`/service-orders/timesheet/monthly?${params.toString()}`);
      const list = (data?.items || []) as TimesheetItem[];
      setItems(list);
      setLabel(data?.label || `${startDate} 至 ${endDate}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "加载失败";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadOptions() {
    const [engineerData, customerData, salespersonData] = await Promise.all([
      api.get("/users/engineers").catch(() => ({ items: [] })),
      api.get("/customers?pageSize=200").catch(() => ({ items: [] })),
      canSelectSalesperson ? api.get("/users/salespeople").catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
    ]);
    setEngineers((engineerData?.items || []) as EngineerOption[]);
    setCustomers((customerData?.items || []) as CustomerOption[]);
    setSalespeople((salespersonData?.items || []) as SalespersonOption[]);
  }

  useEffect(() => {
    loadOptions().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSelectSalesperson]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, engineerId, salesperson, customerId, canSelectSalesperson]);

  const stats = useMemo(() => {
    const total = items.length;
    const service = items.filter((i) => i.source === "service_order").length;
    const manual = items.filter((i) => i.source === "manual").length;
    return [
      { label: "已加载记录", value: total },
      { label: "工单", value: service },
      { label: "手工记录", value: manual },
    ];
  }, [items]);

  async function exportExcel() {
    if (!items.length) return;
    await downloadEngineerWorkbook(`timesheet-${startDate}-to-${endDate}.xlsx`, label || `${startDate} 至 ${endDate}`, items);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">月报导出</h1>
          <p className="text-muted-foreground mt-1">导出指定月份的月报数据</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
          <Button onClick={exportExcel} disabled={loading || items.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            导出 Excel
          </Button>
        </div>
      </div>

      <ErrorToast message={error} />

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor="start-date">开始日期</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">结束日期</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>工程师</Label>
              <Select value={engineerId} onValueChange={setEngineerId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择工程师" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部工程师</SelectItem>
                  {engineers.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.realName || e.username || `工程师 #${e.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {canSelectSalesperson && (
              <div className="space-y-2">
                <Label>对应销售</Label>
                <Select value={salesperson} onValueChange={setSalesperson}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择销售" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部销售</SelectItem>
                    <SelectItem value="__unassigned">未关联销售</SelectItem>
                    {salespeople.map((sales) => {
                      const name = (sales.realName || sales.username || "").trim();
                      if (!name) return null;
                      return (
                        <SelectItem key={sales.id} value={name}>
                          {name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>客户</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择客户" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部客户</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={String(customer.id)}>
                      {customer.name || `客户 #${customer.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat, statIndex) => (
          <Card key={stat.label} className="overflow-hidden border-none shadow-sm ring-1 ring-border">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{stat.label}</div>
              <div className="text-2xl font-bold mt-1">
                                {loading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <span className="stat-value-enter inline-block" style={{ animationDelay: `${Math.min(statIndex * 120, 480)}ms` }}>{formatCount(stat.value)}</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>月报列表 {label && <span className="text-muted-foreground font-normal text-sm ml-2">({label})</span>}</CardTitle>
            <CardDescription>按工单维度展示当前月份月报记录</CardDescription>
          </div>
          <Badge variant="secondary">{items.length} 条</Badge>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <span className="btn-loader mr-2" aria-hidden="true" /> 正在加载…
            </div>
          ) : items.length === 0 ? (
            <EmptyState title="暂无月报数据" description="可调整日期范围或筛选条件" />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>工单</TableHead>
                    <TableHead>客户</TableHead>
                    <TableHead>工程师</TableHead>
                    <TableHead>服务日期</TableHead>
                    <TableHead>来源</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={item.id || `${item.orderNo}-${idx}`}>
                      <TableCell className="font-medium">{item.orderNo || `记录 #${idx + 1}`}</TableCell>
                      <TableCell>{item.customerName || "-"}</TableCell>
                      <TableCell>{item.engineerName || "-"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(getServiceDate(item))}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.source === "service_order" ? "info" : "secondary"}>
                          {item.source === "service_order" ? "工单" : item.source === "manual" ? "手工记录" : item.source || "-"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
