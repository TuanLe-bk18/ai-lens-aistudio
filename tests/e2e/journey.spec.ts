import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { RUBRIC_INDICATORS } from '../../src/data/rubricData';
import { boot, demo, expect, go, persisted, selectStudent, steps, students, test } from './fixtures';

// Assertions use the production demo data, never a second hand-maintained demo.
test('protected behavior files still match the pre-refactor hashes', async () => {
  const hashes = JSON.parse(await readFile(new URL('./behavior-baseline.json', import.meta.url), 'utf8')) as Record<string, string>;
  for (const [file, hash] of Object.entries(hashes)) {
    expect(createHash('sha256').update(await readFile(file)).digest('hex'), file).toBe(hash);
  }

});

test('all six steps navigate forward/back; checklist and student panels work', async ({ page }) => {
  await boot(page);
  const initial = await persisted(page);
  await expect(page.getByRole('heading', { name: initial.activityTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bảng kiểm', exact: true })).toBeVisible();
  const checklist = page.getByRole('region', { name: 'Bảng kiểm', exact: true });
  for (const rubric of RUBRIC_INDICATORS) {
    const tab = checklist.getByRole('tab', { name: new RegExp(`^${rubric.criterionCode} ${rubric.indicatorCode}`) });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    const panel = checklist.getByRole('tabpanel');
    await expect(panel).toHaveCount(1);
    await expect(panel).toHaveAttribute('id', `checklist-panel-${rubric.criterionCode}`);
    await expect(panel).toHaveAttribute('aria-labelledby', `checklist-tab-${rubric.criterionCode}`);
    for (const text of [rubric.aiLookFor, rubric.requiredEvidence, rubric.componentName, rubric.indicatorTitle, ...Object.values(rubric.levels)]) {
      await expect(panel).toContainText(text);
    }
    if (rubric.note) await expect(panel).toContainText(rubric.note);
  }
  const group = page.getByRole('region', { name: 'Nhóm thực hành', exact: true });
  for (const student of initial.students) {
    const seat = group.getByRole('button').and(page.locator(`[data-student-code="${student.code}"]`));
    await seat.click();
    await expect(seat).toHaveAttribute('aria-pressed', 'true');
    const panel = group.locator('#student-detail-panel');
    for (const text of [student.seatLabel, student.visualPosition, student.mainObservedRole]) await expect(panel).toContainText(text);
  }
  await page.getByText('Chi tiết nguồn · VID01', { exact: true }).click();
  await expect(page.getByText(initial.sources[0].filename, { exact: true })).toBeVisible();
  const next = ['Bắt đầu phân tích minh chứng', 'Cho học sinh tự kiểm chứng', 'Tiếp: Kiểm chứng chéo', 'Chuyển cho giáo viên', 'Xem hồ sơ năng lực'];
  for (let step = 2; step <= 6; step++) {
    await page.getByRole('button', { name: next[step - 2], exact: true }).click();
    await expect(page.getByRole('button', { name: `Bước ${step}: ${steps[step - 1]}`, exact: true })).toHaveAttribute('aria-current', 'step');
  }
  for (let step = 5; step >= 1; step--) {
    await page.getByRole('button', { name: steps[step - 1], exact: true }).click();
    await expect(page.getByRole('button', { name: `Bước ${step}: ${steps[step - 1]}`, exact: true })).toHaveAttribute('aria-current', 'step');
  }
  expect(await persisted(page)).toEqual(initial);
});

test('every student tab in self review, peer review, teacher decisions and portfolio', async ({ page }) => {
  await boot(page);
  await go(page, 3);
  for (const code of students) {
    await selectStudent(page, code, 'Em là ai trong nhóm?');
    await expect(page.getByLabel(`Minh chứng liên quan đến ${code}`, { exact: true })).toBeVisible();
  }
  await go(page, 4);
  for (const code of students) {
    await selectStudent(page, code, 'Ai đang kiểm chứng?');
    await expect(page.getByLabel(`Minh chứng ${code} có thể kiểm chứng`, { exact: true })).toBeVisible();
  }
  await go(page, 5);
  await page.getByRole('tab', { name: 'Chốt năng lực', exact: true }).click();
  for (const code of students) {
    await selectStudent(page, code);
    await expect(page.getByRole('tabpanel')).toContainText(demo().students.find((student) => student.code === code)!.seatLabel);
  }
  await go(page, 6);
  for (const code of students) {
    await selectStudent(page, code);
    await expect(page.getByRole('heading', { name: code, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: `In hồ sơ ${code}`, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tổng quan năng lực', exact: true })).toBeVisible();
  }
});

test('all six real MP4 assets decode, thumbnails load, and HTTP Range supports seeking', async ({ page, request }) => {
  await boot(page);
  for (const source of demo().sources) {
    const thumb = await request.get(source.thumbnailUrl);
    expect(thumb.status(), source.thumbnailUrl).toBe(200);
    expect(thumb.headers()['content-type']).toMatch(/^image\/jpeg/);
    expect((await thumb.body()).length).toBeGreaterThan(1000);
    const range = await request.get(source.videoUrl, { headers: { Range: 'bytes=0-1023' } });
    expect(range.status(), source.id).toBe(206);
    expect(range.headers()['accept-ranges']).toBe('bytes');
    expect(range.headers()['content-range']).toMatch(/^bytes 0-1023\/\d+$/);
    expect((await range.body()).length).toBe(1024);
  }
  await go(page, 2);
  for (const source of demo().sources) {
    await page.getByRole('group', { name: 'Chọn nguồn minh chứng', exact: true }).getByRole('button', { name: new RegExp(`^${source.id}`) }).click();
    const video = page.getByLabel(`${source.id} — ${source.title}`, { exact: true });
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => ({ ready: el.readyState >= 1, error: el.error?.message || null }))).toEqual({ ready: true, error: null });
    const duration = await video.evaluate((el: HTMLVideoElement) => el.duration);
    expect(Math.abs(duration - source.durationSeconds), source.id).toBeLessThan(1);
    await page.getByRole('slider', { name: `Tua video ${source.id}`, exact: true }).fill('3');
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeCloseTo(3, 0);
    await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(2);
  }
});

test('evidence markers, source-changing clip playback, transcript seeking and all evidence filters', async ({ page }) => {
  await boot(page);
  await go(page, 2);
  const source = demo().sources[0];
  const video = page.getByLabel(`${source.id} — ${source.title}`, { exact: true });
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState)).toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: 'EV-01 · TC1 · 00:01–00:20', exact: true }).click();
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThanOrEqual(1);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(false);
  await video.evaluate((el: HTMLVideoElement) => el.pause());
  await page.getByText('Lời thoại đồng bộ · VID01', { exact: true }).click();
  const segment = source.transcriptSegments![1];
  const transcriptButton = page.getByRole('button').filter({ hasText: segment.text });
  await transcriptButton.click();
  await expect(transcriptButton).toHaveAttribute('aria-current', 'true');
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThanOrEqual(segment.startSeconds);
  // Shorten real playback by seeking within the chosen interval; timeupdate must stop at its end.
  await video.evaluate((el: HTMLVideoElement, end) => { el.currentTime = end - 0.2; }, segment.endSeconds);
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
  await page.getByRole('button', { name: /^Xem EV-02 trên VID02,/ }).click();
  const secondVideo = page.locator('video');
  await expect(secondVideo).toHaveAttribute('src', demo().sources[1].videoUrl);
  await expect.poll(() => secondVideo.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThanOrEqual(3);
  await secondVideo.evaluate((el: HTMLVideoElement) => el.pause());
  const filters = page.getByRole('group', { name: 'Lọc minh chứng theo tiêu chí hoặc độ rõ' });
  for (const criterion of ['TC1', 'TC2', 'TC3', 'TC4', 'TC5']) {
    await filters.getByRole('button', { name: criterion, exact: true }).click();
    const expected = demo().evidences.filter((ev) => ev.criterionCode === criterion);
    await expect(page.getByRole('article')).toHaveCount(expected.length);
    for (const evidence of expected) await expect(page.getByRole('button', { name: new RegExp(`^Xem ${evidence.id} trên`) })).toBeVisible();
  }
  await filters.getByRole('button', { name: 'Chưa rõ', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(demo().evidences.filter((ev) => ev.clarity !== 'clear' || ev.subjectScope === 'unknown' || !ev.studentCodes.length).length);
  await filters.getByRole('button', { name: 'Tất cả', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(demo().evidences.length);
});

for (const width of [390, 768, 1440]) {
  test(`responsive all six steps: ${width}px has no body overflow${width === 768 ? '' : ' and saves screenshots'}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await boot(page);
    for (let step = 1; step <= 6; step++) {
      await go(page, step);
      await page.evaluate(() => document.fonts.ready);
      const dimensions = await page.evaluate(() => ({
        viewport: innerWidth, body: document.body.scrollWidth, document: document.documentElement.scrollWidth,
      }));
      expect.soft(dimensions.body, `step ${step} body width`).toBeLessThanOrEqual(width);
      expect.soft(dimensions.document, `step ${step} document width`).toBeLessThanOrEqual(width);
      if (width !== 768) {
        await page.screenshot({ path: `.ui-refactor/screenshots/${width === 390 ? 'mobile' : 'desktop'}-step-${step}.png`, fullPage: true, animations: 'disabled' });
      }
    }
  });
}
