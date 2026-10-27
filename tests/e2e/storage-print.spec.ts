import { readFile } from 'node:fs/promises';
import { addManual, boot, demo, expect, exportSession, go, importSession, mediaRecords, persisted, settings, test } from './fixtures';

// Real checked-in JPEG and MP4 uploads, not fake MIME headers or mocked IndexedDB.
test('JSON rejects syntax/schema errors without changing state; valid import/export round-trips reviews, references and audit', async ({ page }) => {
  await boot(page);
  const before = await persisted(page);
  for (const [content, message] of [
    ['{ invalid json', 'Không thể đọc tệp JSON'],
    ['null', 'không đúng định dạng đối tượng'],
    ['{"sessionId":"missing-required-fields"}', 'thiếu các trường bắt buộc'],
  ]) {
    await importSession(page, content);
    await expect(page.getByRole('alert')).toContainText(message);
    expect(await persisted(page)).toEqual(before);
    await page.getByRole('button', { name: 'Đóng cảnh báo lưu trữ', exact: true }).click();
  }
  const imported = structuredClone(before);
  imported.sessionId = 'E2E-IMPORTED-ROUNDTRIP';
  imported.activityTitle = 'E2E imported classroom activity';
  imported.sessionRevision = 17;
  await importSession(page, JSON.stringify(imported));
  await expect(page.getByRole('heading', { name: imported.activityTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await persisted(page)).toEqual(imported);
  expect(await exportSession(page)).toEqual(imported);
  await page.reload();
  expect(await persisted(page)).toEqual(imported);
});

test('valid JSON import reconciles obsolete evidence revision references as stale', async ({ page }) => {
  await boot(page);
  const imported = demo();
  imported.sessionId = 'E2E-STALE-IMPORT';
  imported.evidences[0].revision = 9;
  await importSession(page, JSON.stringify(imported));
  await expect.poll(async () => (await persisted(page)).sessionId).toBe(imported.sessionId);
  expect((await persisted(page)).decisions.find((d) => d.studentCode === 'HS01' && d.indicatorCode === '2.3')?.isStale).toBe(true);
  await go(page, 6);
  await expect(page.getByText('Mức trước đó: M2 (đã hết hiệu lực).', { exact: true }).first()).toBeVisible();
});

test('real image/video uploads survive IndexedDB reload; missing-media warnings and reset clear custom storage', async ({ page }) => {
  await boot(page);
  const imageBuffer = await readFile(`public${demo().sources[0].thumbnailUrl}`);
  const videoBuffer = await readFile(`videos/demo/${demo().sources[5].filename}`);
  const upload = page.getByLabel('Tải thêm video hoặc ảnh phiếu học tập, vở ghi', { exact: true });
  await upload.setInputFiles({ name: 'e2e-worksheet.jpg', mimeType: 'image/jpeg', buffer: imageBuffer });
  await expect.poll(async () => (await persisted(page)).sources.length).toBe(7);
  let session = await persisted(page);
  const image = session.sources.at(-1)!;
  expect(image).toMatchObject({ mediaType: 'worksheet_image', mimeType: 'image/jpeg', isCustomUpload: true, mediaMissing: false, durationSeconds: 10, expectedCriteria: ['TC3', 'TC4', 'TC5'] });
  await go(page, 2);
  const viewer = page.getByRole('region', { name: 'Trình xem và phân tích nguồn minh chứng', exact: true });
  const img = viewer.getByRole('img', { name: image.title, exact: true });
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await expect(page.getByRole('button', { name: 'Phân tích ảnh này', exact: true })).toBeVisible();
  await page.getByText(`Lời thoại đồng bộ · ${image.id}`, { exact: true }).click();
  await expect(page.getByText('Nguồn ảnh không có lời thoại đồng bộ.', { exact: true })).toBeVisible();
  await go(page, 1);
  await upload.setInputFiles({ name: 'e2e-classroom.mp4', mimeType: 'video/mp4', buffer: videoBuffer });
  await expect.poll(async () => (await persisted(page)).sources.length).toBe(8);
  session = await persisted(page);
  const video = session.sources.at(-1)!;
  expect(video).toMatchObject({ mediaType: 'video', mimeType: 'video/mp4', isCustomUpload: true, mediaMissing: false });
  expect(Math.abs(video.durationSeconds - 14.8)).toBeLessThan(1);
  expect(video.thumbnailUrl).toMatch(/^data:image\/jpeg/);
  expect(await mediaRecords(page)).toEqual(expect.arrayContaining([
    { sourceId: image.id, size: imageBuffer.length, type: 'image/jpeg' },
    { sourceId: video.id, size: videoBuffer.length, type: 'video/mp4' },
  ]));
  const oldUrls = session.sources.filter((s) => s.isCustomUpload).map((s) => s.videoUrl);
  await page.reload();
  await expect.poll(async () => (await persisted(page)).sources.filter((s) => s.isCustomUpload && !oldUrls.includes(s.videoUrl) && !s.mediaMissing).length).toBe(2);
  await page.getByRole('button', { name: `${video.id} — ${video.title}`, exact: true }).click();
  await go(page, 2);
  const player = page.locator('video');
  await expect.poll(() => player.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(1);
  await page.getByRole('slider', { name: `Tua video ${video.id}`, exact: true }).fill('3');
  await expect.poll(() => player.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeCloseTo(3, 0);
  await go(page, 1);
  await page.getByRole('button', { name: `${image.id} — ${image.title}`, exact: true }).click();
  await go(page, 2);
  await expect.poll(() => page.getByRole('img', { name: image.title, exact: true }).evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  // Simulates importing metadata on a different device / browser storage eviction.
  await mediaRecords(page, true);
  await page.reload();
  await expect.poll(async () => (await persisted(page)).sources.filter((s) => s.isCustomUpload && s.mediaMissing).length).toBe(2);
  await expect(page.getByText('2 nguồn cần tải lại tệp cục bộ', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: `${video.id} — ${video.title}`, exact: true }).click();
  await page.getByText(`Chi tiết nguồn · ${video.id}`, { exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Tệp cục bộ không có trên máy này');
  await go(page, 2);
  await expect(page.getByRole('alert')).toContainText('tải lại tệp trước khi xem hoặc phân tích');
  await page.getByRole('button', { name: 'Phân tích video này', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Thông báo API:' })).toContainText('Không tìm thấy dữ liệu tệp gốc');
  // Restore a real upload so reset has a non-empty IndexedDB store to clear.
  await go(page, 1);
  await upload.setInputFiles({ name: 'e2e-reset.jpg', mimeType: 'image/jpeg', buffer: imageBuffer });
  await expect.poll(async () => (await mediaRecords(page)).length).toBe(1);
  await addManual(page, 3, 'E2E reset must discard this student evidence');
  await settings(page);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Khôi phục dữ liệu gốc', exact: true }).click();
  expect((await persisted(page)).sources.length).toBe(9);
  await settings(page);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Khôi phục dữ liệu gốc', exact: true }).click();
  await expect.poll(async () => (await persisted(page))?.sources.length).toBe(6);
  expect(await mediaRecords(page)).toEqual([]);
  const reset = await persisted(page);
  // Reset deliberately persists a fresh demo session; localStorage is not expected to stay empty.
  expect(reset.evidences).toEqual(demo().evidences);
  expect(reset.sources).toEqual(demo().sources);
  expect(reset.auditLog).toEqual(demo().auditLog);
  expect(reset.sessionRevision).toBe(1);
  await page.reload();
  expect((await persisted(page)).sources.some((s) => s.isCustomUpload)).toBe(false);
});

test('print lifecycle expands full selected report, hides actions, produces a PDF and restores disclosures', async ({ page }) => {
  await boot(page);
  await go(page, 6);
  const report = page.locator('.ailens-portfolio-report');
  const disclosures = report.locator('details');
  expect(await disclosures.count()).toBeGreaterThan(5);
  const original = await disclosures.evaluateAll((elements) => elements.map((el) => (el as HTMLDetailsElement).open));
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect.poll(() => disclosures.evaluateAll((elements) => elements.every((el) => (el as HTMLDetailsElement).open))).toBe(true);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('header')).toBeHidden();
  await expect(page.getByRole('button', { name: 'In hồ sơ HS01', exact: true })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Hồ sơ năng lực khoa học tự nhiên cá nhân', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'HS01', exact: true })).toBeVisible();
  const visibleActions = await page.locator('.no-print').evaluateAll((elements) => elements.filter((el) => el.getClientRects().length && getComputedStyle(el).display !== 'none').length);
  expect(visibleActions).toBe(0);
  await expect(report.getByText('Nhận định chuyên môn đã lưu', { exact: true }).first()).toBeVisible();
  await expect(report.getByText('Tham chiếu tại lần chốt', { exact: true }).first()).toBeVisible();
  await expect(report.getByText('Transcript nguồn đầy đủ (3 đoạn)', { exact: true }).first()).toBeVisible();
  await expect(report.getByText(demo().sources[0].transcriptSegments![0].text, { exact: true })).toBeVisible();
  await expect(report.getByRole('heading', { name: 'Nhiệm vụ tiếp theo', exact: true })).toBeVisible();
  await page.screenshot({ path: '.ui-refactor/screenshots/desktop-portfolio-print.png', fullPage: true });
  const pdf = await page.pdf({ path: '.ui-refactor/screenshots/HS01-portfolio.pdf', format: 'A4', printBackground: true });
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  expect(pdf.length).toBeGreaterThan(10_000);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({ media: 'screen' });
  expect(await disclosures.evaluateAll((elements) => elements.map((el) => (el as HTMLDetailsElement).open))).toEqual(original);
  await expect(page.locator('header')).toBeVisible();
  await expect(page.getByRole('button', { name: 'In hồ sơ HS01', exact: true })).toBeVisible();
});

test('report export action navigates to step six and invokes the browser print action', async ({ page }) => {
  await boot(page);
  // Test-only print spy avoids the OS dialog; rendering/lifecycle is exercised separately above.
  await page.evaluate(() => {
    window.print = () => {
      window.dispatchEvent(new Event('beforeprint'));
      document.documentElement.dataset.e2ePrintCalls = String(Number(document.documentElement.dataset.e2ePrintCalls || 0) + 1);
      window.dispatchEvent(new Event('afterprint'));
    };
  });
  await page.getByRole('button', { name: 'Xuất báo cáo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hồ sơ năng lực khoa học tự nhiên cá nhân', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-e2e-print-calls', '1');
  await settings(page);
  await page.getByRole('button', { name: 'In / Xuất PDF', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-e2e-print-calls', '2');
  await page.getByRole('button', { name: 'In hồ sơ HS01', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-e2e-print-calls', '3');
});
