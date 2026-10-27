# AI-LENS Chrome E2E regression suite

## Run

```sh
npm run test:e2e -- --timeout=120000 --global-timeout=540000
```

The parent-provided `npm run test:e2e` alias runs `playwright test`. The equivalent direct command is `npx playwright test --timeout=120000 --global-timeout=540000`.

Google Chrome must be installed (`channel: 'chrome'`; on this Mac it is at `/Applications/Google Chrome.app`). Playwright alone starts `npm run dev` on `http://127.0.0.1:3100` and stops it afterward. It refuses to reuse an existing server. Do not start a separate server.

The 53 tests comprise 52 browser scenarios and one protected-file hash check. Every scenario gets a fresh browser context and a Node-imported clone of production `INITIAL_DEMO_SESSION`; reloads retain the real persisted session. Mutations happen through user-facing controls, with localStorage and IndexedDB inspected as additional assertions. The permanent hash fixture is `tests/e2e/behavior-baseline.json`, moved unchanged from the original refactor artifacts. No old App snapshot is required; `.ui-refactor/` is now output-only for the suite.

## Coverage

- All six steps forward/back; source disclosures; every Step 1 student seat and checklist tab; every student tab at steps 3, 4, 5 and 6. Selecting setup panels does not mutate the persisted session.
- Focused setup regressions (`setup-panels.spec.ts`), with seating geometry, complete selected content, keyboard operation and overflow checked at 390/768/1440px:
  - Fixed seat mapping: HS02 top-left/far, HS04 top-right/far, HS01 bottom-left/near, HS03 bottom-right/near; an accessible experiment table, far-side label above and camera below. Exactly four clickable seats with stable dimensions/order/positions, correct IDs, `data-student-code`, pressed state and detail-panel relationships. No student summaries or long descriptions inside the seats.
  - One full, unclipped student detail region, initially HS01; only that student's production `seatLabel`, `visualPosition` and `mainObservedRole` appear there. Seat and checklist selections remain independent. Diagram/detail are left/right from 768px and top/bottom below 768px; the checklist follows the entire group card.
  - One mounted checklist tabpanel, initially TC1; all five tabs carry criterion/indicator/short-name labels and matching IDs/ARIA relationships. Full AI look-for text, required evidence, component, indicator title, M1/M2/M3 descriptors and optional note remain visible without an evaluation-standard toggle. Rubric principles remain a disclosure.
  - Horizontal scroll-contained tabs above content below 768px, vertical tabs left of content from 768px; orientation updates across live viewport changes without losing selection. Roving `tabIndex`, a single Tab stop, click/focus activation, wrapping Up/Down/Left/Right and Home/End activation. Focused mobile tabs remain inside the viewport. Student seats also activate with Enter/Space.
  - Reversed JSON-imported student records retain the fixed visual mapping while showing the imported full descriptions. Incomplete/empty imported student lists clear stale details without an uncaught error. Source thumbnails retain the existing selected ring/full-opacity versus unselected opacity and follow the selected source disclosure without persisting UI selection.
- Focused UI-fix regressions (`ui-fixes.spec.ts`): computed clamp display compared with a clean inline-style reference (`-webkit-box`, serialized as `flow-root` by current Chrome), vertical orientation, hidden overflow, three-line Step 2 evidence summaries, actual clipped heights, and full unclipped text in disclosures at 390/768/1440px. The obsolete Step 1 seat-role clamp checks were removed because seats no longer contain those descriptions.
- Shared class-override regressions at 390/1440px: the header export button remains present but `display: none` on mobile and visible with flex layout on desktop (Chrome blockifies an inline-flex flex item to `flex`); the lesson label retains more than 80px of usable width without overlapping settings; all settings-menu buttons compute `justify-content: flex-start` rather than inheriting the base center alignment; the open menu does not cause body/document overflow.
- Teacher tablist roving `tabIndex`, a single Tab stop, Left/Right wrapping, Home/End activation, focus and selected state, and matching tabpanel relationships. Importing a changed/removed/stale decision for the same open student/indicator discards the old local draft without remounting the panel; resetting a mutated persisted session similarly restores the demo's saved selection.
- All six real bundled MP4s: successful image asset responses, HTTP 206 Range response contracts, Chrome metadata/frame readiness and seeking. Evidence markers, cross-source clip playback, transcript seeking/highlighting and stop-at-end behavior; all evidence filters.
- Manual evidence: negative/reversed/equal/out-of-duration rejection, blank description rejection, success, unassigned subject, per-step origin and approval behavior, persisted reload.
- Multiple self-review authors and teacher-assisted attribution; changing only one's own review; missing-attribution disclosure and proposals without mutating AI attribution before teacher approval.
- Peer independence: sole-owner, whole-card and explicit-self blocks; multi-person targeted-other permission; proposal-author block; multiple reviewers and per-target records survive reload.
- Teacher proposal acceptance, unchanged acceptance and rejection; evidence revision bumps, resolved review records, stale decision references and portfolio disclosure.
- Unknown-context blocks; guided M1 allowed with M2/M3 blocked; independent M2/M3 save; missing evidence and pending-conflict blocks; insufficient-evidence save with unknown context; persisted rationale and exact evidence references.
- Real `/api/health`, `/api/analyze` and legacy `/api/analyze-video` no-key contracts, missing source and unknown source errors, visible API failure with unchanged session.
- **MOCK API ONLY:** delayed success/loading, explicit and generic error responses/retry, response application including transcript/trace, reanalysis preserving accepted teacher and pending student manual evidence while invalidating old AI references.
- **MOCK API ONLY:** exact real uploaded JPEG/MP4 bytes sent as base64 after IndexedDB rehydration, with source/MIME/duration/student/mode contract.
- **MOCK API ONLY:** password input, trimmed key in `x-gemini-api-key` only, absent from body/URL/localStorage/sessionStorage/JSON export and lost on reload.
- JSON syntax/top-level schema rejection, valid import/export/download round-trip, reload, reconciliation of obsolete references.
- Real JPEG and MP4 uploads into IndexedDB, decoded image/video after reload with fresh object URLs, missing-media warnings after simulated storage eviction, local missing-file analysis error without an API call, reset cancellation/confirmation and clearing uploaded media/custom session state. Reset intentionally persists the fresh demo again; it does not leave localStorage empty.
- Every step at 390, 768 and 1440 pixels without body/document overflow; twelve refreshed desktop/mobile full-page screenshots plus three dedicated group/checklist captures at 390/768/1440px. Dedicated captures select HS02 (the longest observed-role description) and TC4 (the optional rubric note).
- `beforeprint`/`afterprint`, print CSS emulation, expanded nested transcripts/rationale/references, hidden actions, restored disclosures, real Chrome PDF generation. Report export/menu/selected-student print actions are separately exercised using a test-only `window.print` spy (no OS dialog).

## Safety and environment

- The dedicated server gets empty `GEMINI_API_KEY` and `GOOGLE_API_KEY`. The real API test first asserts `hasServerApiKey: false`.
- Unexpected analysis calls and non-local HTTP requests are blocked. Every intended success/error analysis response is explicitly labeled **MOCK** and supplied with test-only `page.route`. No paid Gemini request is made.
- Every browser test fails on uncaught `pageerror` and attaches a browser-safety summary.
- **Test-only Vite HMR transport MOCK:** Vite uses fixed WebSocket port 24678, already occupied by another development server in this workspace. The browser fixture intercepts only local development WebSockets and sends Vite's `connected` handshake. Production application scripts, assets, media and persistence remain real. No browser errors are filtered or ignored. The server may still print its port-24678 warning; HMR itself is not under test.
- This setup-panel follow-up changes only `tests/e2e/journey.spec.ts`, `tests/e2e/ui-fixes.spec.ts`, `tests/e2e/setup-panels.spec.ts` and this README. Existing fixtures, protected hashes, other test files and Playwright configuration are reused unchanged. Production code/data and `docs/UI_UX_REFACTOR.md` belong to the parent implementation task. The production tsconfig excludes these tests. A separate strict no-emit check validates the suite:

```sh
npx tsc --noEmit --strict --skipLibCheck --moduleResolution bundler --module esnext --target es2022 --jsx react-jsx --allowImportingTsExtensions --esModuleInterop playwright.config.ts tests/e2e/fixtures.ts tests/e2e/journey.spec.ts tests/e2e/reviews.spec.ts tests/e2e/api.spec.ts tests/e2e/storage-print.spec.ts tests/e2e/ui-fixes.spec.ts tests/e2e/setup-panels.spec.ts
```

## Current follow-up validation

- Strict test-only TypeScript check: passed against the implemented setup components.
- Full Google Chrome run on 2026-10-25: **53 passed, 0 failed, 0 skipped, 0 flaky** in **34.7 seconds**, using two workers and no retries. The count is 52 browser scenarios plus one protected-file hash check across six files; all 13 new setup-panel scenarios passed.
- The run used `npm run test:e2e -- --timeout=120000 --global-timeout=540000`. The JSON reporter contains no run-level errors, and browser-safety assertions passed. The existing development HMR port-24678 warning did not affect the run.
- All 12 six-step responsive screenshots, three dedicated group/checklist captures, the print screenshot and the portfolio PDF were refreshed: **16 PNG files and one PDF**. The three dedicated captures were also visually inspected at their 390/768/1440px viewport sizes.
- No test-selector fixes or concrete production contract failures were found. Production code/data, protected hashes, shared fixtures, configuration and unrelated tests were not changed by this test-only follow-up.

## Artifacts

All paths below are relative to the project root:

- `.ui-refactor/e2e-results.json` — machine-readable final results.
- `.ui-refactor/playwright-report/index.html` — HTML report.
- `.ui-refactor/test-results/` — attachments and failure traces/screenshots, if any.
- `.ui-refactor/screenshots/desktop-step-1.png` through `desktop-step-6.png` — 1440px main steps.
- `.ui-refactor/screenshots/mobile-step-1.png` through `mobile-step-6.png` — 390px main steps.
- `.ui-refactor/screenshots/group-checklist-390.png`, `group-checklist-768.png`, `group-checklist-1440.png` — focused setup sections with HS02 and TC4 selected.
- `.ui-refactor/screenshots/desktop-portfolio-print.png` — expanded print rendering.
- `.ui-refactor/screenshots/HS01-portfolio.pdf` — real Chrome PDF.

## Explicit limits

No live Gemini success/paid model quality, provider file-upload/fallback/rate-limit behavior, native OS print-dialog interaction, Firefox/WebKit/Safari, physical touch devices, other upload codecs/formats (WebM/MOV/PNG/WebP), quota/private-mode/unsupported-IndexedDB failures, deeply malformed nested session objects, or multi-tab concurrency is tested. The mandated `npm run dev` server is used, not production-mode static bundle serving. Screenshots are inspection artifacts, not pixel-diff comparisons against the old App (no old screenshot baseline was provided).

The focused regressions guard the parent's corrected setup-panel mapping/layout, shared-class conflicts, evidence clamp, keyboard-tab, and stale decision-draft issues. Keep any genuine remaining application failures visible and report them rather than editing production code from this test-only scope.
