// Hồi quy hiệu năng: một lần ghi chỉ được làm mới dữ liệu người dùng đang hiện, KHÔNG kéo theo danh mục tĩnh.
// Chạy: node --test tests/   (Node >= 22.6, tự bỏ type khi import .ts)
import test from "node:test";
import assert from "node:assert/strict";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { invalidateData } from "../src/lib/cache.ts";

test("invalidateData: refetch dữ liệu người dùng đang hiện, bỏ qua danh mục tĩnh", async () => {
  const qc = new QueryClient();
  const calls = [];
  const watch = (key) => {
    const o = new QueryObserver(qc, { queryKey: key, queryFn: async () => (calls.push(key[0]), 1), staleTime: 60_000 });
    return o.subscribe(() => {});
  };
  // ["exercise", id] chứa PR / lần tập gần nhất của người dùng → phải được làm mới sau khi ghi
  const keys = [["daily"], ["schedule"], ["calendar", 35], ["exercise", "bench"], ["templates"], ["foods", "", false, ""], ["exmeta"]];
  const unsub = keys.map(watch);
  await new Promise((r) => setTimeout(r, 20));
  calls.length = 0; // bỏ lần tải đầu

  await invalidateData(qc);

  assert.deepEqual(calls.sort(), ["calendar", "daily", "exercise", "schedule"]);
  unsub.forEach((u) => u());
});
