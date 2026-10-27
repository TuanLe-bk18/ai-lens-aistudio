import { ANALYZE_ROUTE, addManual, boot, demo, expect, exportSession, go, persisted, settings, STORAGE_KEY, test } from './fixtures';
import type { EvidenceItem } from '../../src/types';
import { readFile } from 'node:fs/promises';

test('REAL API: health contract, no-key error via browser endpoint and UI, plus validation and legacy alias', async ({ page }) => {
  await boot(page);
  const health = await page.evaluate(async () => (await fetch('/api/health')).json());
  expect(health).toMatchObject({ status: 'ok', hasServerApiKey: false, supportedProcessingModes: ['AGENTIC', 'STATIC'], endpoints: ['/api/analyze', '/api/analyze-video'], fallbackModel: 'gemini-2.5-flash' });
  expect(health.model).toEqual(expect.any(String));
  expect(health.agenticModels).toContain('gemini-3.8-flash');
  // Only this explicit no-key test reaches the real server. Config clears both API-key env vars.
  await page.route(ANALYZE_ROUTE, (route) => route.continue());
  const post = (endpoint: string, data: unknown) => page.evaluate(async ({ endpoint, data }) => {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    return { status: response.status, contentType: response.headers.get('content-type'), body: await response.json() };
  }, { endpoint, data });
  for (const endpoint of ['/api/analyze', '/api/analyze-video']) {
    const result = await post(endpoint, { sourceId: 'VID01', processingMode: 'AGENTIC', students: demo().students });
    expect(result.status).toBe(400);
    expect(result.contentType).toContain('application/json');
    expect(result.body).toEqual({ error: expect.stringContaining('Chưa cấu hình GEMINI_API_KEY') });
  }
  expect(await post('/api/analyze', {})).toMatchObject({ status: 400, body: { error: 'Thiếu mã nguồn dữ liệu (sourceId).' } });
  expect(await post('/api/analyze', { sourceId: 'MISSING-E2E' })).toMatchObject({ status: 404, body: { error: expect.stringContaining('Không tìm thấy nguồn video') } });
  const before = await persisted(page);
  await go(page, 2);
  await page.getByRole('button', { name: 'Phân tích lại video này', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Chưa cấu hình GEMINI_API_KEY');
  await expect(page.getByRole('button', { name: 'Phân tích lại video này', exact: true })).toBeEnabled();
  expect(await persisted(page)).toEqual(before);
});

test('MOCK API success: loading, response contract, reanalysis preserves both manual origins and invalidates old references', async ({ page }) => {
  await boot(page);
  const teacher = await addManual(page, 5, 'E2E teacher manual survives MOCK reanalysis');
  expect(teacher.teacherStatus).toBe('accepted');
  const student = await addManual(page, 3, 'E2E student manual survives MOCK reanalysis');
  expect(student.id).not.toBe(teacher.id);
  await go(page, 2);
  const before = await persisted(page);
  const replacement: EvidenceItem = {
    id: 'EV-AI-VID01-E2E-MOCK-1', revision: 1, sourceId: 'VID01', startSeconds: 2, endSeconds: 6,
    criterionCode: 'TC1', indicatorCode: '2.3', subjectScope: 'individual', studentCodes: ['HS02'],
    observableBehavior: 'MOCK API evidence: HS02 points to the experiment diagram.', spokenTranscript: 'MOCK spoken response',
    clarity: 'clear', origin: 'ai', teacherStatus: 'pending', selfReviews: [], peerReviews: [], createdAt: '2026-10-25T05:00:00Z',
  };
  const response = {
    model: 'E2E-MOCK-not-Gemini', processingModeUsed: 'AGENTIC', usedFilesApi: false, sourceId: 'VID01',
    transcriptSegments: [{ id: 'TR-E2E-MOCK', startSeconds: 2, endSeconds: 6, speakerCode: 'HS02', text: 'MOCK transcript returned from test route', linkedCriteria: ['TC1'] }],
    agenticSteps: [{ stepNumber: 1, actionType: 'cross_check_rubric', timeWindow: '00:02–00:06', detail: 'MOCK trace from test-only route' }],
    evidences: [replacement],
  };
  let captured: { body: Record<string, unknown>; headers: Record<string, string> } | undefined;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(ANALYZE_ROUTE, async (route) => {
    captured = { body: route.request().postDataJSON(), headers: route.request().headers() };
    await gate;
    await route.fulfill({ status: 200, json: response });
  });
  await page.getByRole('button', { name: 'Phân tích lại video này', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đang phân tích VID01…', exact: true })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Gemini đang xử lý VID01');
  expect(await persisted(page)).toEqual(before);
  release();
  await expect(page.getByRole('button', { name: 'Phân tích lại video này', exact: true })).toBeEnabled();
  await expect(page.getByRole('article').filter({ hasText: replacement.observableBehavior })).toBeVisible();
  expect(captured?.body).toMatchObject({ sourceId: 'VID01', processingMode: 'AGENTIC', students: demo().students, customDurationSeconds: 26.5, customMimeType: 'video/mp4' });
  expect(captured?.headers['x-gemini-api-key']).toBeUndefined();
  const after = await persisted(page);
  expect(after.mode).toBe('live_ai');
  expect(after.sessionRevision).toBe(before.sessionRevision + 1);
  expect(after.evidences.find((ev) => ev.id === teacher.id)).toEqual(teacher);
  expect(after.evidences.find((ev) => ev.id === student.id)).toEqual(student);
  expect(after.evidences.find((ev) => ev.id === 'EV-01')).toBeUndefined();
  expect(after.evidences.filter((ev) => ev.sourceId !== 'VID01')).toEqual(before.evidences.filter((ev) => ev.sourceId !== 'VID01'));
  expect(after.decisions.filter((d) => d.acceptedEvidenceRefs.some((ref) => ref.id === 'EV-01')).every((d) => d.isStale)).toBe(true);
  expect(after.sources[0]).toMatchObject({ processingModeUsed: 'AGENTIC', transcriptSegments: response.transcriptSegments, agenticSteps: response.agenticSteps });
  await page.getByText('Lời thoại đồng bộ · VID01', { exact: true }).click();
  await expect(page.getByRole('button').filter({ hasText: 'MOCK transcript returned from test route' })).toBeVisible();
  await go(page, 6);
  await expect(page.getByRole('status').filter({ hasText: 'chỉ số cần giáo viên duyệt lại' })).toBeVisible();
  await expect(page.getByText('EV-01 v1 — không còn trong phiên', { exact: true })).toBeVisible();
});

test('MOCK API failures: error body and generic error preserve session, loading ends, retry succeeds', async ({ page }) => {
  await boot(page);
  await go(page, 2);
  const before = await persisted(page);
  let attempt = 0;
  await page.route(ANALYZE_ROUTE, async (route) => {
    attempt++;
    await route.fulfill(attempt === 1
      ? { status: 503, json: { error: 'MOCK API unavailable: retry later' } }
      : attempt === 2 ? { status: 500, json: {} }
        : { status: 200, json: { model: 'E2E-MOCK-empty-result', evidences: [], transcriptSegments: [], agenticSteps: [], processingModeUsed: 'AGENTIC' } });
  });
  const analyze = page.getByRole('button', { name: 'Phân tích lại video này', exact: true });
  await analyze.click();
  await expect(page.getByRole('alert')).toContainText('MOCK API unavailable: retry later');
  await expect(analyze).toBeEnabled();
  expect(await persisted(page)).toEqual(before);
  await analyze.click();
  await expect(page.getByRole('alert')).toContainText('Không thể phân tích nguồn dữ liệu qua API.');
  expect(await persisted(page)).toEqual(before);
  await analyze.click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(analyze).toBeEnabled();
  await expect.poll(async () => (await persisted(page)).mode).toBe('live_ai');
});

for (const kind of ['image', 'video'] as const) {
  test(`MOCK API uploaded ${kind}: sends exact real file bytes as base64 with MIME, duration and students`, async ({ page }) => {
    await boot(page);
    const image = kind === 'image';
    const buffer = await readFile(image ? `public${demo().sources[0].thumbnailUrl}` : `videos/demo/${demo().sources[5].filename}`);
    await page.getByLabel('Tải thêm video hoặc ảnh phiếu học tập, vở ghi', { exact: true }).setInputFiles({
      name: image ? 'mock-api-worksheet.jpg' : 'mock-api-classroom.mp4', mimeType: image ? 'image/jpeg' : 'video/mp4', buffer,
    });
    await expect.poll(async () => (await persisted(page)).sources.length).toBe(7);
    const source = (await persisted(page)).sources.at(-1)!;
    // Reload forces analysis to use the rehydrated IndexedDB Blob, not just the original File.
    await page.reload();
    await expect.poll(async () => (await persisted(page)).sources.at(-1)!.videoUrl !== source.videoUrl).toBe(true);
    await page.getByRole('button', { name: `${source.id} — ${source.title}`, exact: true }).click();
    let payload: Record<string, unknown> | undefined;
    await page.route(ANALYZE_ROUTE, async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({ status: 200, json: {
        model: 'E2E-MOCK-upload-result', sourceId: source.id, usedFilesApi: false, processingModeUsed: 'AGENTIC',
        evidences: [], transcriptSegments: [], agenticSteps: [],
      } });
    });
    await go(page, 2);
    await page.getByRole('button', { name: image ? 'Phân tích ảnh này' : 'Phân tích video này', exact: true }).click();
    await expect.poll(async () => (await persisted(page)).mode).toBe('live_ai');
    expect(payload).toMatchObject({ sourceId: source.id, customMimeType: image ? 'image/jpeg' : 'video/mp4', customDurationSeconds: source.durationSeconds, students: demo().students, processingMode: 'AGENTIC' });
    expect(payload?.customBase64).toBe(buffer.toString('base64'));
  });
}

test('MOCK API key security: password field, x-header only, never persisted/exported and cleared on reload', async ({ page }) => {
  await boot(page);
  const key = 'E2E-NOT-A-REAL-KEY-DO-NOT-SEND-TO-GEMINI';
  await settings(page);
  await page.getByRole('button', { name: 'Cấu hình Gemini API Key', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Cấu hình Gemini API Key', exact: true });
  const input = dialog.getByLabel('Gemini API Key', { exact: true });
  await expect(input).toHaveAttribute('type', 'password');
  await expect(input).toHaveAttribute('autocomplete', 'off');
  await input.fill(`  ${key}  `);
  await dialog.getByRole('button', { name: 'Lưu & Đóng', exact: true }).click();
  let sent: { headers: Record<string, string>; body: string; url: string } | undefined;
  await page.route(ANALYZE_ROUTE, async (route) => {
    sent = { headers: route.request().headers(), body: route.request().postData()!, url: route.request().url() };
    await route.fulfill({ status: 401, json: { error: 'MOCK intentionally invalid API key' } });
  });
  await go(page, 2);
  await page.getByRole('button', { name: 'Phân tích lại video này', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('MOCK intentionally invalid API key');
  expect(sent?.headers['x-gemini-api-key']).toBe(key);
  expect(sent?.body).not.toContain(key);
  expect(sent?.url).not.toContain(key);
  expect(JSON.stringify(await exportSession(page))).not.toContain(key);
  const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(JSON.stringify(storage)).not.toContain(key);
  expect(Object.keys(storage.local)).toEqual([STORAGE_KEY]);
  await page.reload();
  await settings(page);
  await page.getByRole('button', { name: 'Cấu hình Gemini API Key', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Gemini API Key', { exact: true })).toHaveValue('');
});
