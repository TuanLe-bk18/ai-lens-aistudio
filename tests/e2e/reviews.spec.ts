import { addManual, boot, demo, expect, go, manualDialog, persisted, queueCard, selectStudent, test } from './fixtures';

for (const step of [2, 3, 5] as const) {
  test(`manual evidence at step ${step}: correct origin, attribution, acceptance and persistence`, async ({ page }) => {
    await boot(page);
    const before = await persisted(page);
    const added = await addManual(page, step, `E2E manual behavior from step ${step}`);
    expect(added).toMatchObject({
      sourceId: 'VID01', startSeconds: 2, endSeconds: 4, criterionCode: 'TC1', indicatorCode: '2.3', revision: 1,
      origin: step === 3 ? 'student_added' : 'teacher_added', teacherStatus: step === 5 ? 'accepted' : 'pending',
      subjectScope: 'individual', studentCodes: [step === 3 ? 'HS04' : 'HS01'], selfReviews: [], peerReviews: [],
    });
    expect(added.resolvedAtRevision).toBe(step === 5 ? 1 : undefined);
    expect((await persisted(page)).sessionRevision).toBe(before.sessionRevision + 1);
    await page.reload();
    expect((await persisted(page)).evidences.find((ev) => ev.id === added.id)).toEqual(added);
    await go(page, 2);
    await expect(page.getByRole('article').filter({ hasText: added.observableBehavior })).toBeVisible();
  });
}

test('manual evidence rejects negative, reversed, equal, beyond-duration and blank descriptions; valid unassigned evidence succeeds', async ({ page }) => {
  await boot(page);
  const before = await persisted(page);
  const dialog = await manualDialog(page, 2);
  await dialog.getByLabel('Mô tả hành vi quan sát được').fill('Bounded manual observation');
  for (const [start, end, message] of [
    ['-1', '3', 'Mốc thời gian không hợp lệ'], ['5', '4', 'Mốc thời gian không hợp lệ'],
    ['5', '5', 'Mốc thời gian không hợp lệ'], ['2', '1000', 'vượt quá thời lượng video'],
  ]) {
    await dialog.getByLabel('Giây bắt đầu').fill(start);
    await dialog.getByLabel('Giây kết thúc').fill(end);
    await dialog.getByRole('button', { name: 'Lưu minh chứng' }).click();
    await expect(dialog.getByRole('alert')).toContainText(message);
    expect((await persisted(page)).evidences).toEqual(before.evidences);
  }
  await dialog.getByLabel('Giây bắt đầu').fill('1');
  await dialog.getByLabel('Giây kết thúc').fill('2');
  await dialog.getByLabel('Mô tả hành vi quan sát được').fill('   ');
  await dialog.getByRole('button', { name: 'Lưu minh chứng' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Vui lòng nhập mô tả');
  await dialog.getByRole('button', { name: 'HS01', exact: true }).click();
  await dialog.getByLabel('Mô tả hành vi quan sát được').fill('Unassigned observation requiring teacher attribution');
  await dialog.getByRole('button', { name: 'Lưu minh chứng' }).click();
  await expect(dialog).toBeHidden();
  const added = (await persisted(page)).evidences.at(-1)!;
  expect(added).toMatchObject({ studentCodes: [], subjectScope: 'unknown', teacherStatus: 'pending', origin: 'teacher_added' });
  await expect(page.getByRole('article').filter({ hasText: added.observableBehavior })).toContainText('Chưa rõ chủ thể (unknown)');
});

test('self reviews preserve multiple students and re-review replaces only its author', async ({ page }) => {
  await boot(page);
  await go(page, 3);
  await selectStudent(page, 'HS01', 'Em là ai trong nhóm?');
  await page.getByRole('button', { name: 'Xác nhận đúng minh chứng EV-01 cho HS01', exact: true }).click();
  await selectStudent(page, 'HS02', 'Em là ai trong nhóm?');
  await page.getByRole('button', { name: 'Xác nhận lại minh chứng EV-01 cho HS02', exact: true }).click();
  await expect.poll(async () => (await persisted(page)).evidences[0].selfReviews?.length).toBe(2);
  const reviews = (await persisted(page)).evidences[0].selfReviews!;
  expect(reviews).toEqual(expect.arrayContaining([
    expect.objectContaining({ reviewerCode: 'HS01', recordedBy: 'student', status: 'confirmed' }),
    expect.objectContaining({ reviewerCode: 'HS02', recordedBy: 'student', status: 'confirmed' }),
  ]));
  await selectStudent(page, 'HS01', 'Em là ai trong nhóm?');
  const card = page.getByRole('article', { name: 'EV-01', exact: true });
  await card.getByText('Phản hồi của các bạn khác (1)', { exact: true }).click();
  await expect(card.getByText('HS02 đã xác nhận đúng', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Xác nhận lại minh chứng EV-01 cho HS01', exact: true }).click();
  const updated = (await persisted(page)).evidences[0].selfReviews!;
  expect(updated).toHaveLength(2);
  expect(updated.find((r) => r.reviewerCode === 'HS02')).toEqual(reviews.find((r) => r.reviewerCode === 'HS02'));
  await page.reload();
  expect((await persisted(page)).evidences[0].selfReviews).toEqual(updated);
});

test('missing-attribution disclosure supports a non-attributed student proposal and prevents self peer-verification', async ({ page }) => {
  await boot(page);
  await go(page, 3);
  await expect(page.getByRole('article', { name: 'EV-01', exact: true })).toHaveCount(0);
  const disclosure = page.getByRole('button', { name: /^Minh chứng khác \/ Báo AI gán thiếu/ });
  await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  const card = page.getByRole('article', { name: 'EV-01', exact: true });
  await expect(card).toContainText('Chưa được gán tên em');
  await expect(card.getByRole('button', { name: /Xác nhận đúng/ })).toHaveCount(0);
  await card.getByRole('button', { name: 'Đề nghị chỉnh sửa minh chứng EV-01 bởi HS04', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Đề nghị sửa EV-01 · HS04', exact: true });
  await expect(editor.getByRole('button', { name: 'HS04', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await editor.getByLabel('Vì sao cần sửa? / Mô tả bổ sung (không bắt buộc)', { exact: true }).fill('');
  await editor.getByRole('button', { name: /^TC2 ·/ }).click();
  await editor.getByRole('button', { name: 'Gửi đề nghị', exact: true }).click();
  const evidence = (await persisted(page)).evidences[0];
  expect(evidence.studentCodes).toEqual(['HS01', 'HS02']);
  expect(evidence.criterionCode).toBe('TC1');
  expect(evidence.selfReviews).toEqual(expect.arrayContaining([expect.objectContaining({
    reviewerCode: 'HS04', status: 'propose_edit', proposedStudentCodes: ['HS01', 'HS02', 'HS04'], proposedCriterionCode: 'TC2',
    note: 'Đề nghị chỉnh sửa thông tin gán minh chứng.',
  })]));
  await expect(page.getByLabel('Minh chứng liên quan đến HS04', { exact: true }).getByRole('article', { name: 'EV-01', exact: true })).toBeVisible();
  await go(page, 4);
  await selectStudent(page, 'HS04', 'Ai đang kiểm chứng?');
  await page.getByRole('button', { name: /^Minh chứng chưa thể kiểm chứng/ }).click();
  const peerCard = page.getByRole('article', { name: 'EV-01', exact: true });
  await expect(peerCard.getByRole('button', { name: /HS04 xác nhận đồng ý/ })).toBeDisabled();
  await expect(peerCard.getByRole('status')).toContainText('vừa gửi đề nghị chỉnh sửa');
  await peerCard.getByLabel('Em đang kiểm chứng cho ai?', { exact: true }).selectOption('HS01');
  await expect(peerCard.getByRole('button', { name: /HS04 xác nhận đồng ý/ })).toBeDisabled();
});

test('peer independence blocks self/whole-card, allows targeted other student and preserves reviewers and targets', async ({ page }) => {
  await boot(page);
  await go(page, 4);
  // Single-person EV-02 belongs to HS03 and is entirely locked for HS03.
  await page.getByRole('button', { name: /^Minh chứng chưa thể kiểm chứng/ }).click();
  const single = page.getByRole('article', { name: 'EV-02', exact: true });
  await expect(single.getByRole('button', { name: /HS03 xác nhận đồng ý/ })).toBeDisabled();
  await expect(single.getByRole('status')).toContainText('phải khác với học sinh đang được đánh giá chính');
  await selectStudent(page, 'HS01', 'Ai đang kiểm chứng?');
  const card = page.getByRole('article', { name: 'EV-01', exact: true });
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: /HS01 xác nhận đồng ý/ })).toBeDisabled();
  await card.getByLabel('Em đang kiểm chứng cho ai?', { exact: true }).selectOption('HS01');
  await expect(card.getByRole('button', { name: /HS01 xác nhận đồng ý/ })).toBeDisabled();
  await expect(card.getByRole('status')).toContainText('không được tự kiểm chứng chéo');
  await card.getByLabel('Em đang kiểm chứng cho ai?', { exact: true }).selectOption('HS02');
  await expect(card.getByRole('button', { name: /HS01 xác nhận đồng ý riêng cho HS02/ })).toBeEnabled();
  await card.getByLabel('Ghi chú của HS01 riêng cho HS02 (không bắt buộc)', { exact: true }).fill('HS01 independently verifies HS02');
  await card.getByRole('button', { name: /HS01 xác nhận đồng ý riêng cho HS02/ }).click();
  await selectStudent(page, 'HS03', 'Ai đang kiểm chứng?');
  await card.getByLabel('Em đang kiểm chứng cho ai?', { exact: true }).selectOption('HS02');
  await card.getByLabel('Ghi chú của HS03 riêng cho HS02 (không bắt buộc)', { exact: true }).fill('HS03 asks teacher to check the gesture');
  await card.getByRole('button', { name: 'Đề nghị giáo viên xem lại riêng cho HS02 trên minh chứng EV-01', exact: true }).click();
  await card.getByLabel('Em đang kiểm chứng cho ai?', { exact: true }).selectOption('HS01');
  await card.getByRole('button', { name: /HS03 xác nhận đồng ý riêng cho HS01/ }).click();
  const reviews = (await persisted(page)).evidences[0].peerReviews!;
  expect(reviews).toHaveLength(3);
  expect(reviews).toEqual(expect.arrayContaining([
    expect.objectContaining({ reviewerCode: 'HS01', targetStudentCode: 'HS02', status: 'agreed', note: 'HS01 independently verifies HS02' }),
    expect.objectContaining({ reviewerCode: 'HS03', targetStudentCode: 'HS02', status: 'disputed', recordedBy: 'student' }),
    expect.objectContaining({ reviewerCode: 'HS03', targetStudentCode: 'HS01', status: 'agreed' }),
  ]));
  await expect(card.getByText('3 ý kiến kiểm chứng chéo', { exact: true })).toBeVisible();
  await page.reload();
  expect((await persisted(page)).evidences[0].peerReviews).toEqual(reviews);
});

test('teacher resolves a student proposal, accepts unchanged evidence, rejects a referenced card, and portfolio shows stale conclusions', async ({ page }) => {
  await boot(page);
  await go(page, 5);
  const proposal = queueCard(page, 'EV-03');
  await expect(proposal).toContainText('HS04 (tự)');
  await proposal.getByRole('button', { name: 'Chấp nhận điều chỉnh (HS04)', exact: true }).click();
  const accepted = (await persisted(page)).evidences.find((ev) => ev.id === 'EV-03')!;
  expect(accepted).toMatchObject({ revision: 2, teacherStatus: 'modified_accepted', resolvedAtRevision: 2 });
  expect(accepted.studentCodes).toEqual(['HS01', 'HS03', 'HS04']);
  expect(accepted.selfReviews!.every((review) => review.resolvedByTeacher)).toBe(true);
  expect(accepted.peerReviews!.every((review) => review.resolvedByTeacher)).toBe(true);
  await expect(proposal).toHaveCount(0);
  await page.getByRole('button', { name: /^Tất cả \(/ }).click();
  const unchanged = queueCard(page, 'EV-02');
  await unchanged.getByRole('button', { name: 'Duyệt nguyên trạng', exact: true }).click();
  expect((await persisted(page)).evidences.find((ev) => ev.id === 'EV-02')).toMatchObject({ teacherStatus: 'accepted', revision: 2 });
  const rejected = queueCard(page, 'EV-01');
  await rejected.getByRole('button', { name: 'Bác bỏ', exact: true }).click();
  const session = await persisted(page);
  expect(session.evidences[0]).toMatchObject({ teacherStatus: 'rejected', revision: 2 });
  expect(session.decisions.find((d) => d.studentCode === 'HS01' && d.indicatorCode === '2.3')?.isStale).toBe(true);
  await go(page, 6);
  await expect(page.getByRole('status').filter({ hasText: 'chỉ số cần giáo viên duyệt lại' })).toBeVisible();
  const row = page.locator('details.portfolio-indicator').filter({ has: page.locator('summary').filter({ hasText: 'TC1' }) });
  await expect(row).toHaveAttribute('open', '');
  await expect(row).toContainText('Cần duyệt lại');
  await expect(row).toContainText('Mức trước đó: M2 (đã hết hiệu lực)');
  await expect(row).toContainText('nguồn hiện tại v2, không phải bản tham chiếu cũ');
  await page.getByRole('button', { name: 'Về Bước 5', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Chốt năng lực', exact: true })).toBeVisible();
});

for (const level of ['M2', 'M3'] as const) {
  test(`teacher ${level}: unknown blocked, guided allows only M1, independent can conclude with evidence references`, async ({ page }) => {
    const seed = demo();
    seed.decisions = [];
    await boot(page, seed);
    await go(page, 5);
    await page.getByRole('tab', { name: 'Chốt năng lực', exact: true }).click();
    await page.getByRole('tabpanel').getByRole('button', { name: /^TC1/ }).click();
    const panel = page.locator('div.rounded-2xl').filter({ has: page.getByRole('button', { name: 'Đóng bảng chốt mức', exact: true }) }).last();
    await expect(panel.getByRole('button', { name: /^M1 / })).toBeDisabled();
    await expect(panel.getByRole('button', { name: /^M2 / })).toBeDisabled();
    await expect(panel.getByRole('button', { name: /^M3 / })).toBeDisabled();
    await expect(panel.getByRole('button', { name: 'Chốt mức', exact: true })).toBeDisabled();
    await panel.getByRole('button', { name: 'Có hướng dẫn', exact: true }).click();
    await expect(panel.getByRole('button', { name: /^M1 / })).toBeEnabled();
    await expect(panel.getByRole('button', { name: /^M2 / })).toBeDisabled();
    await expect(panel.getByRole('button', { name: /^M3 / })).toBeDisabled();
    await panel.getByRole('button', { name: /^M1 / }).click();
    await panel.getByRole('button', { name: 'Chốt mức', exact: true }).click();
    expect((await persisted(page)).decisions[0]).toMatchObject({ level: 'M1', assistanceContext: 'guided' });
    await panel.getByRole('button', { name: 'Tự thực hiện', exact: true }).click();
    await panel.getByRole('button', { name: new RegExp(`^${level} `) }).click();
    await panel.getByRole('button', { name: 'Chốt lại quyết định', exact: true }).click();
    const decision = (await persisted(page)).decisions[0];
    expect(decision).toMatchObject({ studentCode: 'HS01', indicatorCode: '2.3', level, assistanceContext: 'independent', acceptedEvidenceRefs: [{ id: 'EV-01', revision: 1 }], isStale: false });
    expect(decision.rationale).not.toBe('');
    await go(page, 6);
    await page.locator('details.portfolio-indicator').filter({ hasText: 'TC1' }).locator('summary').click();
    await expect(page.getByText('Nhận định chuyên môn đã lưu', { exact: true })).toBeVisible();
    await expect(page.getByText(decision.rationale, { exact: true })).toBeVisible();
  });
}

test('teacher cannot conclude with missing evidence or pending conflicts; insufficient evidence always allowed', async ({ page }) => {
  await boot(page);
  await go(page, 5);
  await page.getByRole('tab', { name: 'Chốt năng lực', exact: true }).click();
  await page.getByRole('tabpanel').getByRole('button', { name: /^TC3/ }).click();
  for (const level of ['M1', 'M2', 'M3']) await expect(page.getByRole('button', { name: new RegExp(`^${level} `) })).toBeDisabled();
  await page.getByRole('button', { name: 'Tự thực hiện', exact: true }).click();
  await expect(page.getByRole('button', { name: /^M3 / })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Chưa có minh chứng cá nhân được duyệt');
  await page.getByRole('button', { name: 'Chưa đủ minh chứng', exact: true }).click();
  await page.getByRole('button', { name: 'Chốt mức', exact: true }).click();
  expect((await persisted(page)).decisions.find((d) => d.studentCode === 'HS01' && d.indicatorCode === '2.5')).toMatchObject({ level: 'insufficient_evidence', assistanceContext: 'unknown', acceptedEvidenceRefs: [], isStale: false });
  await page.getByRole('tabpanel').getByRole('button', { name: /^TC2/ }).click();
  await page.getByRole('button', { name: 'Tự thực hiện', exact: true }).click();
  await expect(page.getByRole('button', { name: /^M2 / })).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'Còn minh chứng có đề nghị sửa' })).toBeVisible();
  await page.getByRole('button', { name: 'Chưa đủ minh chứng', exact: true }).click();
  await page.getByRole('button', { name: 'Chốt lại quyết định', exact: true }).click();
  expect((await persisted(page)).decisions.find((d) => d.studentCode === 'HS01' && d.indicatorCode === '2.4')).toMatchObject({ level: 'insufficient_evidence', assistanceContext: 'unknown', isStale: false });
});
