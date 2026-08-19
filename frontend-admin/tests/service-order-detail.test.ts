import assert from "node:assert/strict";
import test from "node:test";
import { mergeServiceOrderApprovalDetail } from "../src/lib/service-order-detail.ts";

test("审批工单详情保留申请快照事实并补全完整工单字段", () => {
  const snapshot = {
    id: 88,
    orderNo: "SO-SNAPSHOT",
    customerName: "申请时客户",
    issueDescription: "申请时问题",
    serviceMode: "onsite",
    serviceType: "repair",
    departureAt: "2026-07-14 17:00",
    actualStartAt: "2026-07-14 18:00",
    actualEndAt: "2026-07-14 21:00",
    returnAt: "2026-07-14 22:00",
    reportedDepartureAt: "2026-07-14 16:30",
  };
  const detail = {
    id: 88,
    orderNo: "SO-LIVE",
    customerName: "后来修改的客户",
    issueDescription: "后来修改的问题",
    serviceMode: "onsite",
    serviceType: "install",
    serviceModules: ["install"],
    customerAddress: "合肥市测试路 1 号",
    engineerName: "徐坚",
    files: [{ id: 7, originalName: "现场照片.png" }],
    report: {
      departureAt: "2026-07-14 16:00",
      actualStartAt: "2026-07-14 18:30",
      actualEndAt: "2026-07-14 21:30",
      returnAt: "2026-07-14 23:00",
      workContent: "完整处理记录",
      result: "resolved",
    },
  };

  const merged = mergeServiceOrderApprovalDetail(snapshot, detail);

  assert.equal(merged.orderNo, "SO-SNAPSHOT");
  assert.equal(merged.customerName, "申请时客户");
  assert.equal(merged.issueDescription, "申请时问题");
  assert.equal(merged.serviceType, "repair");
  assert.deepEqual(merged.serviceModules, ["install"]);
  assert.equal(merged.customerAddress, "合肥市测试路 1 号");
  assert.equal(merged.engineerName, "徐坚");
  assert.deepEqual(merged.files, detail.files);
  assert.equal(merged.report?.departureAt, "2026-07-14 17:00");
  assert.equal(merged.report?.actualStartAt, "2026-07-14 18:00");
  assert.equal(merged.report?.actualEndAt, "2026-07-14 21:00");
  assert.equal(merged.report?.returnAt, "2026-07-14 22:00");
  assert.equal(merged.report?.workContent, "完整处理记录");
  assert.equal(merged.report?.result, "resolved");
  assert.equal(merged.reportedDepartureAt, "2026-07-14 16:30");
});
