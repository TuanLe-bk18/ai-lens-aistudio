import type { Locator, Page } from '@playwright/test';
import { RUBRIC_INDICATORS, RUBRIC_PRINCIPLES } from '../../src/data/rubricData';
import type { CriterionCode, StudentCode, StudentSeatProfile } from '../../src/types';
import { boot, demo, expect, importSession, persisted, test } from './fixtures';

// Spatial order is intentional, not the order of the imported student records.
const seats = [
  { code: 'HS02', label: 'HS02 · Trái - Trong' },
  { code: 'HS04', label: 'HS04 · Phải - Trong' },
  { code: 'HS01', label: 'HS01 · Trái - Ngoài' },
  { code: 'HS03', label: 'HS03 · Phải - Ngoài' },
] as const;
const groupName = 'Chọn học sinh theo vị trí quanh bàn';
const checklistName = 'Tiêu chí trong bảng kiểm';

function setupPanels(page: Page) {
  const group = page.getByRole('region', { name: 'Nhóm thực hành', exact: true });
  const diagram = group.getByRole('group', { name: groupName, exact: true });
  const detail = group.locator('#student-detail-panel');
  const checklist = page.getByRole('region', { name: 'Bảng kiểm', exact: true });
  const tablist = checklist.getByRole('tablist', { name: checklistName, exact: true });
  return { group, diagram, detail, checklist, tablist };
}

function seatButton(diagram: Locator, code: StudentCode) {
  return diagram.getByRole('button', { name: seats.find((seat) => seat.code === code)!.label, exact: true });
}

function checklistTab(tablist: Locator, code: CriterionCode) {
  return tablist.getByRole('tab').and(tablist.locator(`#checklist-tab-${code}`));
}

async function rect(locator: Locator) {
  await expect(locator).toBeVisible();
  // Document coordinates remain comparable after Playwright scrolls a control into view.
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height };
  });
}

async function seatGeometry(diagram: Locator) {
  return Promise.all(seats.map(({ code }) => rect(seatButton(diagram, code))));
}

function expectStableGeometry(actual: Awaited<ReturnType<typeof seatGeometry>>, before: Awaited<ReturnType<typeof seatGeometry>>) {
  actual.forEach((box, index) => {
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(box[key] - before[index][key]), `${seats[index].code} ${key} must not shift when selection changes`).toBeLessThanOrEqual(1);
    }
  });
}

async function expectNoOverflow(page: Page, width: number) {
  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth, document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.body).toBeLessThanOrEqual(width);
  expect(dimensions.document).toBeLessThanOrEqual(width);
}

async function expectReadableText(panel: Locator, text: string) {
  await expect(panel).toContainText(text);
  const content = panel.getByText(text, { exact: false }).last();
  await expect(content).toBeVisible();
  const metrics = await content.evaluate((element) => ({
    clamp: getComputedStyle(element).webkitLineClamp,
    clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
    concealed: Boolean(element.closest('[hidden], details:not([open])')),
  }));
  expect(metrics.clamp, 'Selected panel content must not be line-clamped').toBe('none');
  expect(metrics.concealed, 'Selected content must not need another disclosure').toBe(false);
  expect(metrics.scrollHeight, 'Full selected text must not be vertically clipped').toBeLessThanOrEqual(metrics.clientHeight + 1);
}

async function expectStudentDetail(page: Page, code: StudentCode, profiles = demo().students) {
  const { group, diagram, detail } = setupPanels(page);
  const selected = profiles.find((student) => student.code === code)!;
  const button = seatButton(diagram, code);
  await expect(detail).toHaveCount(1);
  await expect(detail).toHaveRole('region');
  await expect(detail).toHaveAttribute('aria-labelledby', `seat-${code}`);
  await expect(group.getByRole('region', { name: seats.find((seat) => seat.code === code)!.label, exact: true })).toHaveAttribute('id', 'student-detail-panel');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(diagram.locator('button[aria-pressed="true"]')).toHaveCount(1);
  for (const text of [selected.seatLabel, selected.visualPosition]) await expectReadableText(detail, text);
  const roleLines = selected.mainObservedRole.split(/\n|;\s*/).map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
  for (const line of roleLines) await expectReadableText(detail, line);
  for (const other of profiles.filter((student) => student.code !== code)) {
    for (const text of [other.seatLabel, other.visualPosition]) await expect(detail).not.toContainText(text);
    const otherLines = other.mainObservedRole.split(/\n|;\s*/).map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
    for (const line of otherLines) await expect(detail).not.toContainText(line);
  }
}

async function expectSeatMapping(diagram: Locator) {
  await expect(diagram.getByRole('button')).toHaveCount(4);
  expect(await diagram.getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-student-code')))).toEqual(seats.map((seat) => seat.code));
  await expect(diagram.locator('summary, details')).toHaveCount(0);
  for (const { code } of seats) {
    const button = seatButton(diagram, code);
    await expect(button).toHaveAttribute('id', `seat-${code}`);
    await expect(button).toHaveAttribute('data-student-code', code);
    await expect(button).toHaveAttribute('aria-controls', 'student-detail-panel');
    const box = await rect(button);
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  for (const student of demo().students) {
    for (const text of [student.seatLabel, student.visualPosition]) await expect(diagram).not.toContainText(text);
    const lines = student.mainObservedRole.split(/\n|;\s*/).map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
    for (const line of lines) await expect(diagram).not.toContainText(line);
  }
  const [farLeft, farRight, nearLeft, nearRight] = await seatGeometry(diagram);
  const table = await rect(diagram.getByLabel('Bàn thí nghiệm', { exact: true }));
  const farLabel = await rect(diagram.getByText('Phía trong · xa máy quay', { exact: true }));
  const camera = await rect(diagram.getByText(/máy quay/i).filter({ hasNotText: 'Phía trong' }).last());
  expect(Math.abs(farLeft.y - farRight.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(nearLeft.y - nearRight.y)).toBeLessThanOrEqual(1);
  expect(farLeft.x + farLeft.width).toBeLessThanOrEqual(farRight.x);
  expect(nearLeft.x + nearLeft.width).toBeLessThanOrEqual(nearRight.x);
  expect(Math.abs(farLeft.x - nearLeft.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(farRight.x - nearRight.x)).toBeLessThanOrEqual(1);
  expect(farLabel.y + farLabel.height).toBeLessThanOrEqual(Math.min(farLeft.y, farRight.y) + 1);
  const tableCenter = { x: table.x + table.width / 2, y: table.y + table.height / 2 };
  for (const box of [farLeft, nearLeft]) expect(box.x + box.width / 2).toBeLessThan(tableCenter.x);
  for (const box of [farRight, nearRight]) expect(box.x + box.width / 2).toBeGreaterThan(tableCenter.x);
  for (const box of [farLeft, farRight]) expect(box.y + box.height / 2).toBeLessThan(tableCenter.y);
  for (const box of [nearLeft, nearRight]) expect(box.y + box.height / 2).toBeGreaterThan(tableCenter.y);
  expect(Math.max(nearLeft.y + nearLeft.height, nearRight.y + nearRight.height)).toBeLessThanOrEqual(camera.y + 1);
}

async function expectSelectedCriterion(page: Page, code: CriterionCode, focused = false) {
  const { checklist, tablist } = setupPanels(page);
  for (const rubric of RUBRIC_INDICATORS) {
    const tab = checklistTab(tablist, rubric.criterionCode);
    const selected = rubric.criterionCode === code;
    await expect(tab).toHaveAttribute('aria-selected', String(selected));
    await expect(tab).toHaveAttribute('tabindex', selected ? '0' : '-1');
    await expect(tab).toHaveAttribute('aria-controls', `checklist-panel-${rubric.criterionCode}`);
    if (!selected) await expect(checklist.locator(`#checklist-panel-${rubric.criterionCode}`)).toHaveCount(0);
  }
  await expect(tablist.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
  const panel = checklist.getByRole('tabpanel');
  await expect(panel).toHaveCount(1);
  await expect(checklist.locator('[role="tabpanel"]')).toHaveCount(1);
  await expect(panel).toHaveAttribute('id', `checklist-panel-${code}`);
  await expect(panel).toHaveAttribute('aria-labelledby', `checklist-tab-${code}`);
  if (focused) await expect(checklistTab(tablist, code)).toBeFocused();
  return panel;
}

async function screenshotSetup(page: Page, width: number) {
  const { group, checklist } = setupPanels(page);
  const [first, last] = await Promise.all([rect(group), rect(checklist)]);
  const x = Math.floor(Math.min(first.x, last.x));
  const y = Math.floor(first.y);
  await page.screenshot({
    path: `.ui-refactor/screenshots/group-checklist-${width}.png`, fullPage: true, animations: 'disabled',
    clip: { x, y, width: Math.ceil(Math.max(first.x + first.width, last.x + last.width)) - x, height: Math.ceil(last.y + last.height) - y },
  });
}

for (const width of [390, 768, 1440]) {
  test(`fixed student seats map around the table, show one independent detail panel and stay stable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await boot(page);
    await page.evaluate(() => document.fonts.ready);
    const before = await persisted(page);
    const { group, diagram, detail, checklist, tablist } = setupPanels(page);
    await expect(group).toHaveAttribute('aria-labelledby', 'group-title');
    await expect(group.getByRole('heading', { name: 'Nhóm thực hành', exact: true })).toHaveAttribute('id', 'group-title');
    await expectSeatMapping(diagram);
    await expectStudentDetail(page, 'HS01');
    await expectSelectedCriterion(page, 'TC1');
    const initialGeometry = await seatGeometry(diagram);
    const [diagramBox, detailBox, groupBox, checklistBox] = await Promise.all([rect(diagram), rect(detail), rect(group), rect(checklist)]);
    if (width < 768) {
      expect(diagramBox.y + diagramBox.height).toBeLessThanOrEqual(detailBox.y);
    } else {
      expect(diagramBox.x + diagramBox.width).toBeLessThanOrEqual(detailBox.x);
    }
    expect(groupBox.y + groupBox.height, 'Checklist must sit below the entire group card').toBeLessThanOrEqual(checklistBox.y);
    for (const { code } of seats) {
      await seatButton(diagram, code).click();
      await expectStudentDetail(page, code);
      await expectSelectedCriterion(page, 'TC1');
      expectStableGeometry(await seatGeometry(diagram), initialGeometry);
      await expectNoOverflow(page, width);
    }
    await checklistTab(tablist, 'TC4').click();
    await expectSelectedCriterion(page, 'TC4');
    await expectStudentDetail(page, 'HS03');
    expectStableGeometry(await seatGeometry(diagram), initialGeometry);
    await seatButton(diagram, 'HS02').click();
    await expectStudentDetail(page, 'HS02');
    await expectSelectedCriterion(page, 'TC4');
    expectStableGeometry(await seatGeometry(diagram), initialGeometry);
    await expectNoOverflow(page, width);
    expect(await persisted(page)).toEqual(before);
    // Capture the longest student description and the criterion with its optional note.
    await screenshotSetup(page, width);
  });

  test(`checklist has responsive tabs and one complete unclipped content panel at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await boot(page);
    await page.evaluate(() => document.fonts.ready);
    const before = await persisted(page);
    const { checklist, tablist } = setupPanels(page);
    await expect(tablist).toHaveAttribute('aria-orientation', width < 768 ? 'horizontal' : 'vertical');
    await expect(tablist.getByRole('tab')).toHaveCount(RUBRIC_INDICATORS.length);
    await expectSelectedCriterion(page, 'TC1');
    await expect(checklist.getByRole('button', { name: /^(Xem|Ẩn) chuẩn đánh giá$/ })).toHaveCount(0);
    const tabBoxes = await Promise.all(RUBRIC_INDICATORS.map((rubric) => rect(checklistTab(tablist, rubric.criterionCode))));
    const listBox = await rect(tablist);
    const panelBox = await rect(checklist.getByRole('tabpanel'));
    if (width < 768) {
      expect(listBox.y + listBox.height).toBeLessThanOrEqual(panelBox.y);
      for (let index = 1; index < tabBoxes.length; index++) {
        expect(Math.abs(tabBoxes[index].y - tabBoxes[0].y)).toBeLessThanOrEqual(1);
        expect(tabBoxes[index].x).toBeGreaterThan(tabBoxes[index - 1].x);
      }
    } else {
      expect(listBox.x + listBox.width).toBeLessThanOrEqual(panelBox.x);
      for (let index = 1; index < tabBoxes.length; index++) {
        expect(Math.abs(tabBoxes[index].x - tabBoxes[0].x)).toBeLessThanOrEqual(1);
        expect(tabBoxes[index - 1].y + tabBoxes[index - 1].height).toBeLessThanOrEqual(tabBoxes[index].y);
      }
    }
    for (const rubric of RUBRIC_INDICATORS) {
      const tab = checklistTab(tablist, rubric.criterionCode);
      await expect(tab).toContainText(rubric.criterionCode);
      await expect(tab).toContainText(rubric.indicatorCode);
      await expect(tab).toContainText(rubric.checklistTitle.replace(/^\d+\.\d+\.\s*/, ''));
      await tab.click();
      const panel = await expectSelectedCriterion(page, rubric.criterionCode, true);
      for (const text of [rubric.aiLookFor, rubric.requiredEvidence, rubric.componentName, rubric.indicatorTitle, ...Object.values(rubric.levels)]) {
        await expectReadableText(panel, text);
      }
      for (const level of ['M1', 'M2', 'M3']) await expect(panel.getByText(level, { exact: true })).toBeVisible();
      if (rubric.note) await expectReadableText(panel, rubric.note);
      for (const other of RUBRIC_INDICATORS.filter((item) => item !== rubric)) await expect(panel).not.toContainText(other.aiLookFor);
      await expectStudentDetail(page, 'HS01');
      if (width >= 768) {
        const current = await rect(tablist);
        expect(Math.abs(current.x - listBox.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(current.y - listBox.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(current.width - listBox.width)).toBeLessThanOrEqual(1);
      }
      await expectNoOverflow(page, width);
    }
    const principles = checklist.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Nguyên tắc sử dụng rubric' }) });
    await expect(principles).toHaveCount(1);
    await expect(principles).not.toHaveAttribute('open');
    await principles.locator('summary').click();
    await expect(principles).toHaveAttribute('open', '');
    await expectReadableText(principles, RUBRIC_PRINCIPLES.coreRule);
    await expectReadableText(principles, RUBRIC_PRINCIPLES.usagePrinciple);
    await principles.locator('summary').click();
    await expect(principles).not.toHaveAttribute('open');
    expect(await persisted(page)).toEqual(before);
  });

  test(`checklist keyboard automatically selects and focuses with roving Tab, arrows, Home and End at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await boot(page);
    const before = await persisted(page);
    const { diagram, tablist } = setupPanels(page);
    await checklistTab(tablist, 'TC1').focus();
    await expectSelectedCriterion(page, 'TC1', true);
    for (const [key, code] of [
      ['ArrowUp', 'TC5'], ['ArrowDown', 'TC1'], ['ArrowLeft', 'TC5'], ['ArrowRight', 'TC1'],
      ['ArrowDown', 'TC2'], ['ArrowRight', 'TC3'], ['ArrowUp', 'TC2'], ['ArrowLeft', 'TC1'],
      ['End', 'TC5'], ['End', 'TC5'], ['Home', 'TC1'], ['Home', 'TC1'],
    ] as const) {
      await page.keyboard.press(key);
      await expectSelectedCriterion(page, code, true);
      const box = await checklistTab(tablist, code).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      await expectNoOverflow(page, width);
    }
    // There is one keyboard stop in the tablist, whichever criterion is selected.
    for (const code of ['TC1', 'TC5'] as const) {
      await checklistTab(tablist, code).click();
      await page.keyboard.press('Tab');
      expect(await tablist.evaluate((element) => element.contains(document.activeElement))).toBe(false);
      await page.keyboard.press('Shift+Tab');
      await expectSelectedCriterion(page, code, true);
    }
    await seatButton(diagram, 'HS04').focus();
    await page.keyboard.press('Enter');
    await expectStudentDetail(page, 'HS04');
    await seatButton(diagram, 'HS02').focus();
    await page.keyboard.press('Space');
    await expectStudentDetail(page, 'HS02');
    await expectSelectedCriterion(page, 'TC5');
    expect(await persisted(page)).toEqual(before);
  });
}

test('JSON-imported reversed student records retain fixed visual mapping and use the imported full details', async ({ page }) => {
  await boot(page);
  const imported = demo();
  imported.sessionId = 'E2E-REVERSED-SEATING';
  imported.students.reverse();
  for (const student of imported.students) {
    student.visualPosition = `E2E imported identity ${student.code}: ${student.visualPosition}`;
    student.mainObservedRole = `E2E imported role ${student.code}: ${student.mainObservedRole}`;
  }
  await importSession(page, JSON.stringify(imported));
  await expect.poll(async () => (await persisted(page)).sessionId).toBe(imported.sessionId);
  const before = await persisted(page);
  const { diagram } = setupPanels(page);
  await expectSeatMapping(diagram);
  for (const { code } of seats) {
    await seatButton(diagram, code).click();
    await expectStudentDetail(page, code, imported.students);
  }
  expect((await persisted(page)).students).toEqual(imported.students);
  expect(await persisted(page)).toEqual(before);
});

test('importing incomplete and empty student lists clears stale selected details without crashing', async ({ page }) => {
  await boot(page);
  await seatButton(setupPanels(page).diagram, 'HS04').click();
  const imported = demo();
  imported.sessionId = 'E2E-INCOMPLETE-SEATING';
  imported.students = imported.students.filter((student) => student.code === 'HS02' || student.code === 'HS03');
  await importSession(page, JSON.stringify(imported));
  await expect.poll(async () => (await persisted(page)).sessionId).toBe(imported.sessionId);
  const { group, diagram, detail } = setupPanels(page);
  const selected = diagram.locator('button[aria-pressed="true"]');
  await expect(selected).toHaveCount(1);
  const code = await selected.getAttribute('data-student-code') as StudentCode;
  expect(imported.students.map((student) => student.code)).toContain(code);
  await expectStudentDetail(page, code, imported.students);
  for (const student of demo().students.filter((student) => !imported.students.some((item) => item.code === student.code))) {
    await expect(detail).not.toContainText(student.visualPosition);
    const lines = student.mainObservedRole.split(/\n|;\s*/).map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
    for (const line of lines) await expect(detail).not.toContainText(line);
  }
  for (const student of imported.students) {
    await seatButton(diagram, student.code).click();
    await expectStudentDetail(page, student.code, imported.students);
  }
  const empty = { ...imported, sessionId: 'E2E-EMPTY-SEATING', students: [] as StudentSeatProfile[] };
  await importSession(page, JSON.stringify(empty));
  await expect.poll(async () => (await persisted(page)).sessionId).toBe(empty.sessionId);
  await expect(group.getByRole('heading', { name: 'Nhóm thực hành', exact: true })).toBeVisible();
  await expect(diagram.locator('button[aria-pressed="true"]')).toHaveCount(0);
  for (const student of demo().students) {
    await expect(group).not.toContainText(student.visualPosition);
    const lines = student.mainObservedRole.split(/\n|;\s*/).map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
    for (const line of lines) await expect(group).not.toContainText(line);
  }
  await expectSelectedCriterion(page, 'TC1');
  expect((await persisted(page)).students).toEqual([]);
});

test('checklist orientation follows live viewport changes across the 768px breakpoint without losing selection', async ({ page }) => {
  await boot(page);
  const { diagram, tablist } = setupPanels(page);
  await checklistTab(tablist, 'TC4').click();
  await seatButton(diagram, 'HS02').click();
  for (const width of [390, 768, 767, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(tablist).toHaveAttribute('aria-orientation', width < 768 ? 'horizontal' : 'vertical');
    await expectSelectedCriterion(page, 'TC4');
    await expectStudentDetail(page, 'HS02');
    await expectNoOverflow(page, width);
  }
});

test('Step1 source selection preserves selected thumbnail styling and follows the source without changing production data', async ({ page }) => {
  await boot(page);
  const before = await persisted(page);
  const sources = page.getByRole('region', { name: 'Nguồn minh chứng', exact: true });
  for (const source of before.sources) {
    const thumbnail = sources.getByRole('button', { name: `${source.id} — ${source.title}`, exact: true });
    await thumbnail.click();
    await expect(thumbnail.locator('img')).toHaveCSS('opacity', '1');
    await expect(thumbnail.locator('..')).not.toHaveCSS('box-shadow', 'none');
    for (const other of before.sources.filter((item) => item.id !== source.id)) {
      await expect(sources.getByRole('button', { name: `${other.id} — ${other.title}`, exact: true }).locator('img')).toHaveCSS('opacity', '0.6');
    }
    const disclosure = sources.locator('details');
    await expect(disclosure.locator('summary')).toHaveText(`Chi tiết nguồn · ${source.id}`);
    await disclosure.locator('summary').click();
    await expect(disclosure.getByText(source.filename, { exact: true })).toBeVisible();
  }
  expect(await persisted(page)).toEqual(before);
});
