import { useEffect, useState, type KeyboardEvent } from 'react';
import { ChevronRight, ClipboardList, ScanEye, Sparkles, FileText } from 'lucide-react';
import { RUBRIC_INDICATORS, RUBRIC_PRINCIPLES } from '../../data/rubricData';
import type { CriterionCode, RubricIndicator } from '../../types';
import { Card, Code, cn } from './kit';

export function Checklist({
  gradeSubject,
  indicators,
  onOpenWorkspace,
}: {
  gradeSubject: string;
  indicators?: RubricIndicator[];
  onOpenWorkspace?: () => void;
}) {
  const activeList = indicators && indicators.length > 0 ? indicators : RUBRIC_INDICATORS;
  const isCustom = Boolean(indicators && indicators.length > 0);

  const [selectedCode, setSelectedCode] = useState<CriterionCode>(
    activeList[0]?.criterionCode || 'TC1'
  );
  const [vertical, setVertical] = useState(() => window.matchMedia('(min-width: 768px)').matches);

  // If the activeList changes (e.g. after approval), keep selectedCode in sync
  useEffect(() => {
    if (!activeList.some((ind) => ind.criterionCode === selectedCode)) {
      if (activeList[0]) setSelectedCode(activeList[0].criterionCode);
    }
  }, [activeList, selectedCode]);

  const selected =
    activeList.find((indicator) => indicator.criterionCode === selectedCode) || activeList[0];

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const updateOrientation = () => setVertical(query.matches);
    updateOrientation();
    query.addEventListener('change', updateOrientation);
    return () => query.removeEventListener('change', updateOrientation);
  }, []);

  const navigateTabs = (event: KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
        ? tabs.length - 1
        : event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
        ? (index - 1 + tabs.length) % tabs.length
        : null;
    if (next === null) return;
    event.preventDefault();
    if (activeList[next]) {
      setSelectedCode(activeList[next].criterionCode);
    }
    tabs[next]?.focus();
    tabs[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <section aria-labelledby="rubric-title">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="rubric-title" className="text-base font-semibold">
              Bảng kiểm Rubric
            </h2>
            {isCustom && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                Đã tùy biến ({activeList.length} tiêu chí)
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Chọn một trong {activeList.length} tiêu chí để xem biểu hiện và chuẩn M1–M3
          </p>
        </div>
        {onOpenWorkspace && (
          <button
            type="button"
            onClick={onOpenWorkspace}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Sparkles className="size-4" />
            <span>Tùy biến Rubric & AI Cố vấn</span>
          </button>
        )}
      </div>

      <Card className="grid overflow-hidden md:grid-cols-[minmax(14rem,3fr)_minmax(0,7fr)]">
        <div
          role="tablist"
          aria-label="Tiêu chí trong bảng kiểm"
          aria-orientation={vertical ? 'vertical' : 'horizontal'}
          onKeyDown={navigateTabs}
          className="flex min-w-0 items-start gap-2 overflow-x-auto border-b border-border bg-background/50 p-3 md:flex-col md:overflow-visible md:border-r md:border-b-0 md:p-4"
        >
          {activeList.map((indicator) => {
            const active = selectedCode === indicator.criterionCode;
            return (
              <button
                key={indicator.criterionCode}
                type="button"
                role="tab"
                id={`checklist-tab-${indicator.criterionCode}`}
                aria-controls={`checklist-panel-${indicator.criterionCode}`}
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setSelectedCode(indicator.criterionCode)}
                className={cn(
                  'flex w-40 shrink-0 items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:w-full',
                  active
                    ? 'border-primary/30 bg-primary-soft text-accent-foreground'
                    : 'border-transparent hover:border-border hover:bg-card'
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Code>{indicator.criterionCode}</Code>
                    <span className="text-xs text-muted-foreground">{indicator.indicatorCode}</span>
                  </div>
                  <span className="mt-1.5 block text-sm font-medium leading-snug">
                    {indicator.checklistTitle.replace(/^\d+\.\d+\.\s*/, '')}
                  </span>
                </div>
                <ChevronRight
                  className={cn(
                    'hidden size-4 shrink-0 md:block',
                    !active && 'text-muted-foreground/50'
                  )}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id={`checklist-panel-${selected.criterionCode}`} aria-labelledby={`checklist-tab-${selected.criterionCode}`} tabIndex={0} className="min-w-0 space-y-6 p-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 sm:p-6">
          <div>
            <p className="text-xs text-muted-foreground">{selected.componentName}</p>
            <h3 className="mt-2 text-lg font-semibold leading-relaxed">{selected.indicatorTitle}</h3>
          </div>
          <div className="grid gap-4 text-sm lg:grid-cols-2">
            <div className="rounded-xl bg-ai-soft p-4">
              <h4 className="mb-2 flex items-center gap-2 font-semibold"><ScanEye className="size-4 shrink-0 text-ai" aria-hidden="true" />AI cần tìm</h4>
              <p className="leading-relaxed">{selected.aiLookFor}</p>
            </div>
            <div className="rounded-xl border border-border p-4">
              <h4 className="mb-2 flex items-center gap-2 font-semibold"><ClipboardList className="size-4 shrink-0 text-primary" aria-hidden="true" />Minh chứng cần có</h4>
              <p className="leading-relaxed text-muted-foreground">{selected.requiredEvidence}</p>
            </div>
          </div>
          <div>
            <h4 className="mb-3 text-sm font-semibold">Chuẩn đánh giá năng lực</h4>
            <div className="grid gap-3 lg:grid-cols-3">
              {(['M1', 'M2', 'M3'] as const).map((level) => (
                <div key={level} className="rounded-xl border border-border bg-background p-4">
                  <span className="inline-flex rounded-lg bg-secondary px-2.5 py-1 text-sm font-semibold text-secondary-foreground">{level}</span>
                  <p className="mt-3 text-sm leading-relaxed">{selected.levels[level]}</p>
                </div>
              ))}
            </div>
          </div>
          {selected.note && <p className="rounded-xl bg-warning-soft p-4 text-xs leading-relaxed text-warning-foreground">{selected.note}</p>}
          <p className="border-t border-border pt-4 text-xs text-muted-foreground">AI chỉ tìm minh chứng theo bảng kiểm; giáo viên quyết định mức M1–M3.</p>
        </div>
      </Card>
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium">Nguyên tắc sử dụng rubric · {gradeSubject}</summary>
        <div className="mt-2 space-y-2 leading-relaxed">
          <p>Trích nguyên văn từ tài liệu chuyên môn của giáo viên. Giáo viên quyết định mức M1–M3.</p>
          <p>{RUBRIC_PRINCIPLES.coreRule}</p>
          <p>{RUBRIC_PRINCIPLES.usagePrinciple}</p>
        </div>
      </details>
    </section>
  );
}
