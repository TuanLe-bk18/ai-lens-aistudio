import type { Locator, Page } from '@playwright/test';
import { boot, demo, expect, go, importSession, persisted, settings, test } from './fixtures';

for (const width of [390, 1440]) {
  test(`shared class overrides preserve header export visibility, lesson width and settings alignment at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await boot(page);
    await page.evaluate(() => document.fonts.ready);
    const header = page.getByRole('banner');
    // Keep the hidden button in the locator so absence cannot pass as correct responsive hiding.
    const exportReport = header.getByRole('button', { includeHidden: true }).filter({ hasText: /^Xuất báo cáo$/ });
    await expect(exportReport).toHaveCount(1);
    if (width === 390) {
      await expect(exportReport).toBeHidden();
      await expect(exportReport).toHaveCSS('display', 'none');
    } else {
      await expect(exportReport).toBeVisible();
      // An inline-flex button is blockified to flex when it is itself a flex item.
      await expect(exportReport).toHaveCSS('display', /^(inline-)?flex$/);
    }
    const lesson = header.getByText(`${demo().gradeSubject} · ${demo().lessonTitle}`, { exact: true });
    await expect(lesson).toBeVisible();
    await expect(lesson).toHaveCSS('overflow', 'hidden');
    await expect(lesson).toHaveCSS('text-overflow', 'ellipsis');
    const bounds = await lesson.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width, 'The header must leave usable space for the lesson, not only a few characters').toBeGreaterThan(80);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    const settingsButton = header.getByRole('button', { name: 'Thiết lập', exact: true });
    const settingsBounds = await settingsButton.boundingBox();
    expect(settingsBounds).not.toBeNull();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(settingsBounds!.x);
    await settings(page);
    const menu = header.locator('#session-settings');
    await expect(menu).toBeVisible();
    for (const name of ['Cấu hình Gemini API Key', 'Xuất JSON', 'In / Xuất PDF', 'Khôi phục dữ liệu gốc']) {
      const button = menu.getByRole('button', { name, exact: true });
      await expect(button).toBeVisible();
      await expect(button).toHaveCSS('display', 'inline-flex');
      await expect(button).toHaveCSS('justify-content', 'flex-start');
    }
    const dimensions = await page.evaluate(() => ({
      body: document.body.scrollWidth, document: document.documentElement.scrollWidth,
    }));
    expect(dimensions.body).toBeLessThanOrEqual(width);
    expect(dimensions.document).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    await expect(settingsButton).toHaveAttribute('aria-expanded', 'false');
  });
}

async function openDecisionPanel(page: Page) {
  await go(page, 5);
  await page.getByRole('tab', { name: 'Chốt năng lực', exact: true }).click();
  await page.getByRole('tabpanel').getByRole('button', { name: /^TC1/ }).click();
  const panel = page.locator('div.rounded-2xl').filter({
    has: page.getByRole('button', { name: 'Đóng bảng chốt mức', exact: true }),
  }).last();
  await expect(panel.getByText('HS01 · TC1 · 2.3', { exact: true })).toBeVisible();
  return panel;
}

async function expectChosenLevel(panel: Locator, chosen?: 'M1' | 'M2' | 'M3') {
  for (const level of ['M1', 'M2', 'M3'] as const) {
    await expect(panel.getByRole('button', { name: new RegExp(`^${level} `) })).toHaveAttribute('aria-pressed', String(level === chosen));
  }
  await expect(panel.getByRole('button', { name: 'Chưa đủ minh chứng', exact: true })).toHaveAttribute('aria-pressed', 'false');
}

for (const change of ['changed level', 'removed decision', 'stale reference'] as const) {
  test(`open decision panel discards its draft on same-cell JSON import: ${change}`, async ({ page }) => {
    await boot(page);
    const panel = await openDecisionPanel(page);
    await expectChosenLevel(panel, 'M2');
    await panel.getByRole('button', { name: /^M3 / }).click();
    await expectChosenLevel(panel, 'M3');
    expect((await persisted(page)).decisions.find((decision) => decision.studentCode === 'HS01' && decision.indicatorCode === '2.3')?.level).toBe('M2');
    // Keep a handle solely to prove that import updates this mounted panel, not a reopened one.
    const mountedPanel = await panel.elementHandle();
    expect(mountedPanel).not.toBeNull();
    const imported = await persisted(page);
    imported.sessionId = `E2E-OPEN-PANEL-IMPORT-${change}`;
    imported.sessionRevision += 1;
    const decision = imported.decisions.find((item) => item.studentCode === 'HS01' && item.indicatorCode === '2.3')!;
    decision.level = 'M1';
    decision.rationale = `E2E imported decision: ${change}`;
    decision.isStale = false;
    if (change === 'removed decision') {
      imported.decisions = imported.decisions.filter((item) => item !== decision);
    } else if (change === 'stale reference') {
      imported.evidences.find((item) => item.id === 'EV-01')!.revision += 1;
    }
    await importSession(page, JSON.stringify(imported));
    await expect.poll(async () => (await persisted(page))?.sessionId).toBe(imported.sessionId);
    await expect(page.getByRole('tab', { name: 'Chốt năng lực', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(panel.getByText('HS01 · TC1 · 2.3', { exact: true })).toBeVisible();
    expect(await mountedPanel!.evaluate((element) => element.isConnected)).toBe(true);
    await expectChosenLevel(panel, change === 'changed level' ? 'M1' : undefined);
    const saved = (await persisted(page)).decisions.find((item) => item.studentCode === 'HS01' && item.indicatorCode === '2.3');
    if (change === 'removed decision') {
      expect(saved).toBeUndefined();
      await expect(panel.getByRole('button', { name: 'Chốt mức', exact: true })).toBeDisabled();
    } else {
      expect(saved).toMatchObject({ level: 'M1', rationale: decision.rationale, isStale: change === 'stale reference' });
      const save = panel.getByRole('button', { name: 'Chốt lại quyết định', exact: true });
      if (change === 'stale reference') {
        await expect(panel.getByRole('status').filter({ hasText: 'Kết luận trước đã hết hiệu lực.' })).toBeVisible();
        await expect(save).toBeDisabled();
      } else {
        await expect(save).toBeEnabled();
        await panel.getByText('Nhận định đã lưu (chỉ đọc)', { exact: true }).click();
        await expect(panel.getByText(decision.rationale, { exact: true })).toBeVisible();
      }
    }
  });
}

test('reset from a mutated persisted session updates the loaded choice and discards the open panel draft', async ({ page }) => {
  const seed = demo();
  seed.sessionId = 'E2E-MUTATED-SESSION-BEFORE-RESET';
  seed.sessionRevision = 42;
  const changed = seed.decisions.find((decision) => decision.studentCode === 'HS01' && decision.indicatorCode === '2.3')!;
  changed.level = 'M3';
  changed.rationale = 'E2E saved M3 before reset';
  await boot(page, seed);
  const panel = await openDecisionPanel(page);
  await expectChosenLevel(panel, 'M3');
  await panel.getByRole('button', { name: /^M1 / }).click();
  await expectChosenLevel(panel, 'M1');
  expect((await persisted(page)).decisions.find((decision) => decision.studentCode === 'HS01' && decision.indicatorCode === '2.3')?.level).toBe('M3');
  const mountedPanel = await panel.elementHandle();
  expect(mountedPanel).not.toBeNull();
  await settings(page);
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Khôi phục dữ liệu gốc', exact: true }).click();
  await expect.poll(async () => (await persisted(page))?.sessionId).toBe(demo().sessionId);
  await expect(page.getByRole('tab', { name: 'Chốt năng lực', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(panel.getByText('HS01 · TC1 · 2.3', { exact: true })).toBeVisible();
  expect(await mountedPanel!.evaluate((element) => element.isConnected)).toBe(true);
  await expectChosenLevel(panel, 'M2');
  const reset = await persisted(page);
  expect(reset.sessionRevision).toBe(1);
  expect(reset.decisions).toEqual(demo().decisions);
  await panel.getByText('Nhận định đã lưu (chỉ đọc)', { exact: true }).click();
  await expect(panel.getByText(demo().decisions[0].rationale, { exact: true })).toBeVisible();
  await expect(panel.getByText(changed.rationale, { exact: true })).toHaveCount(0);
});

test('teacher tablist supports roving Tab focus and automatic Left/Right/Home/End activation with wrapping', async ({ page }) => {
  await boot(page);
  const before = await persisted(page);
  await go(page, 5);
  const tablist = page.getByRole('tablist', { name: 'Giáo viên xử lý và chốt mức', exact: true });
  const queue = tablist.getByRole('tab', { name: /^Cần xử lý \(/ });
  const decide = tablist.getByRole('tab', { name: 'Chốt năng lực', exact: true });
  const addEvidence = page.getByRole('button', { name: 'Bổ sung minh chứng', exact: true });
  async function expectActive(active: Locator, inactive: Locator) {
    await expect(active).toBeFocused();
    await expect(active).toHaveAttribute('aria-selected', 'true');
    await expect(active).toHaveAttribute('tabindex', '0');
    await expect(inactive).toHaveAttribute('aria-selected', 'false');
    await expect(inactive).toHaveAttribute('tabindex', '-1');
    await expect(tablist.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
    const panel = page.getByRole('tabpanel');
    await expect(panel).toHaveAttribute('id', (await active.getAttribute('aria-controls'))!);
    await expect(panel).toHaveAttribute('aria-labelledby', (await active.getAttribute('id'))!);
  }
  await addEvidence.focus();
  await page.keyboard.press('Shift+Tab');
  await expectActive(queue, decide);
  for (const [key, active, inactive] of [
    ['ArrowRight', decide, queue], ['ArrowRight', queue, decide],
    ['ArrowLeft', decide, queue], ['ArrowLeft', queue, decide],
    ['End', decide, queue], ['End', decide, queue],
    ['Home', queue, decide], ['Home', queue, decide],
  ] as const) {
    await page.keyboard.press(key);
    await expectActive(active, inactive);
  }
  await page.keyboard.press('Tab');
  await expect(addEvidence).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expectActive(queue, decide);
  await page.keyboard.press('End');
  await expectActive(decide, queue);
  await page.keyboard.press('Tab');
  await expect(addEvidence).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expectActive(decide, queue);
  expect(await persisted(page)).toEqual(before);
});

test('Step2 evidence cards show full non-duplicated action and dialogue with interactive time links', async ({ page }) => {
  await boot(page);
  await go(page, 2);
  const article = page.getByRole('article').filter({
    has: page.getByRole('button', { name: /^Xem EV-01 trên VID01,/ }),
  });
  await expect(article).toContainText('HS02 (ngồi Trái-Trong, đeo kính gọng đen)');
  await expect(article).toContainText('Lời thoại:');
  await expect(article).not.toContainText('Nguồn gốc');
  await expect(article).not.toContainText('Agentic Zoom');

  const video = page.locator('video');
  await article.getByRole('button', { name: '00:12–00:20', exact: true }).click();
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThanOrEqual(12);
  await video.evaluate((el: HTMLVideoElement) => el.pause());
});
