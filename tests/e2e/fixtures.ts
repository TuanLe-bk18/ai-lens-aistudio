import { test as base, expect, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { INITIAL_DEMO_SESSION } from '../../src/data/rubricData';
import type { SessionState, StudentCode } from '../../src/types';

export const STORAGE_KEY = 'ai_lens_session_v5_highres_verified';
export const ANALYZE_ROUTE = '**/api/analyze{,-video}';
export const steps = ['Nguồn & Bảng kiểm', 'AI tìm minh chứng', 'HS tự kiểm chứng', 'Kiểm chứng chéo', 'GV xử lý & chốt mức', 'Hồ sơ năng lực'];
export const students: StudentCode[] = ['HS01', 'HS02', 'HS03', 'HS04'];
export const demo = (): SessionState => structuredClone(INITIAL_DEMO_SESSION);

export const test = base.extend<{ browserSafety: void }>({
  browserSafety: [async ({ context, page }, use, testInfo) => {
    const errors: string[] = [];
    const unexpectedAnalysis: string[] = [];
    const watch = (tab: Page) => tab.on('pageerror', (error) => errors.push(error.stack || error.message));
    watch(page);
    context.on('page', watch);
    // Test-only MOCK of Vite's development HMR transport. Its fixed port 24678 may
    // belong to another editor server; HMR is not shipped production behavior.
    await context.routeWebSocket(/ws:\/\/(?:127\.0\.0\.1|localhost):\d+\//, (socket) => {
      socket.send(JSON.stringify({ type: 'connected' }));
    });
    // Local assets only: the suite must never send classroom data to an external service.
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      return url.origin === 'http://127.0.0.1:3100' ? route.continue() : route.abort('blockedbyclient');
    });
    // Tests must explicitly opt into the real no-key endpoint or a labeled page.route MOCK.
    await context.route(ANALYZE_ROUTE, async (route) => {
      unexpectedAnalysis.push(route.request().url());
      await route.abort('blockedbyclient');
    });
    await use();
    await testInfo.attach('browser-safety', {
      body: JSON.stringify({ pageErrors: errors, unexpectedAnalysisRequests: unexpectedAnalysis }, null, 2),
      contentType: 'application/json',
    });
    expect(errors, 'No uncaught browser errors').toEqual([]);
    expect(unexpectedAnalysis, 'No unexpected/paid analysis calls').toEqual([]);
  }, { auto: true }],
});
export { expect };

export async function boot(page: Page, session = demo()) {
  await page.addInitScript(({ key, seed }) => {
    // A fresh browser context per test; do not overwrite mutations on reload.
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(seed));
  }, { key: STORAGE_KEY, seed: session });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Bước 1: Nguồn & Bảng kiểm', exact: true })).toHaveAttribute('aria-current', 'step');
  await expect.poll(async () => (await persisted(page)).sessionId).toBe(session.sessionId);
}

export async function persisted(page: Page): Promise<SessionState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), STORAGE_KEY);
}

export async function go(page: Page, step: number) {
  const button = page.getByRole('button', { name: `Bước ${step}: ${steps[step - 1]}`, exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-current', 'step');
}

export async function settings(page: Page) {
  await page.getByRole('button', { name: 'Thiết lập', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Xuất JSON', exact: true })).toBeVisible();
}

export async function exportSession(page: Page): Promise<SessionState> {
  await settings(page);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất JSON', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^AI-LENS-HoSo-.*-v\d+\.json$/);
  const path = await download.path();
  expect(path).toBeTruthy();
  return JSON.parse(await readFile(path!, 'utf8'));
}

export async function importSession(page: Page, content: string) {
  await settings(page);
  await page.getByLabel('Nhập JSON', { exact: true }).setInputFiles({
    name: 'session.json', mimeType: 'application/json', buffer: Buffer.from(content),
  });
}

export async function manualDialog(page: Page, step: 2 | 3 | 5): Promise<Locator> {
  await go(page, step);
  await page.getByRole('button', {
    name: step === 2 ? 'Thêm minh chứng thủ công' : step === 3 ? 'Bổ sung minh chứng AI bỏ sót' : 'Bổ sung minh chứng', exact: true,
  }).click();
  const dialog = page.getByRole('dialog', { name: 'Bổ sung minh chứng AI bỏ sót' });
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function addManual(page: Page, step: 2 | 3 | 5, behavior: string) {
  const dialog = await manualDialog(page, step);
  await dialog.getByRole('combobox', { name: /^Nguồn minh chứng/ }).selectOption('VID01');
  await dialog.getByRole('combobox', { name: /^Tiêu chí/ }).selectOption('TC1');
  await dialog.getByLabel('Giây bắt đầu').fill('2');
  await dialog.getByLabel('Giây kết thúc').fill('4');
  await dialog.getByLabel('Mô tả hành vi quan sát được').fill(behavior);
  await dialog.getByRole('button', { name: 'Lưu minh chứng' }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(async () => (await persisted(page)).evidences.some((ev) => ev.observableBehavior === behavior)).toBe(true);
  return (await persisted(page)).evidences.find((ev) => ev.observableBehavior === behavior)!;
}

export function queueCard(page: Page, id: string) {
  // Queue cards do not expose article semantics; scope through their visible evidence ID.
  return page.getByRole('tabpanel').locator('div.flex.flex-col').filter({ has: page.getByText(id, { exact: true }) });
}

export async function selectStudent(page: Page, code: StudentCode, groupName?: string) {
  const scope = groupName ? page.getByRole('group', { name: groupName, exact: true }) : page.getByRole('main');
  const tab = scope.getByRole('button').filter({ hasText: new RegExp(`^${code}$`) });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-pressed', 'true');
}

export async function mediaRecords(page: Page, clear = false) {
  return page.evaluate(async (shouldClear) => {
    return new Promise<Array<{ sourceId: string; size: number; type: string }>>((resolve, reject) => {
      const open = indexedDB.open('ai_lens_media_db_v3', 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('custom_media', shouldClear ? 'readwrite' : 'readonly');
        const store = tx.objectStore('custom_media');
        if (shouldClear) store.clear();
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => {
          db.close();
          resolve(request.result.map((item) => ({ sourceId: item.sourceId, size: item.blob.size, type: item.blob.type })));
        };
      };
    });
  }, clear);
}
