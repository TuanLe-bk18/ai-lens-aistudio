import { useState } from 'react';
import { Camera, Pencil, ScanEye, UserRound, Users, X } from 'lucide-react';
import { formatTime, type AiLensController } from '../../hooks/useAiLens';
import type { StudentCode, StudentSeatProfile } from '../../types';
import { Card, cn } from './kit';

// Screen coordinates follow the camera: inner seats are behind the table,
// outer seats are closest to the camera. Never infer geometry from array order.
const SEATS: { code: StudentCode; label: string; row: number; column: number }[] = [
  { code: 'HS02', label: 'Trái - Trong', row: 1, column: 1 },
  { code: 'HS04', label: 'Phải - Trong', row: 1, column: 3 },
  { code: 'HS01', label: 'Trái - Ngoài', row: 2, column: 1 },
  { code: 'HS03', label: 'Phải - Ngoài', row: 2, column: 3 },
];

export function StudentSeating({ app }: { app: AiLensController }) {
  const { session } = app;
  const students = session.students;
  const [selectedCode, setSelectedCode] = useState<StudentCode>('HS01');
  const [editingStudent, setEditingStudent] = useState<StudentSeatProfile | null>(null);

  const selected =
    students.find((student) => student.code === selectedCode) ??
    SEATS.map((seat) => students.find((student) => student.code === seat.code)).find(Boolean);

  // Concise bullet summary focusing ONLY on this student's actions
  const conciseBullets = selected?.mainObservedRole
    ? selected.mainObservedRole
        .split(/\n|;\s*/)
        .map((line) => line.replace(/^[-•*]\s*/, '').trim())
        .filter(Boolean)
    : [];

  const getDisplayActions = (): string[] => {
    if (session.sources.length === 0) return [];
    if (conciseBullets.length > 0) return conciseBullets;

    if (!selected) return [];
    const studentEvs = session.evidences.filter((e) => e.studentCodes.includes(selected.code));
    const extracted: string[] = [];
    for (const ev of studentEvs) {
      const parts = ev.observableBehavior.split(/[;.]\s+/);
      for (const part of parts) {
        if (part.includes(selected.code)) {
          const cleaned = part
            .replace(new RegExp(`^.*?(?=${selected.code})`, 'i'), '')
            .replace(/\(\d{2}:\d{2}[–-]\d{2}:\d{2}\)/g, '')
            .trim();
          if (cleaned && !extracted.includes(cleaned)) {
            extracted.push(cleaned);
          }
        }
      }
    }
    return extracted.slice(0, 4);
  };

  const displayActions = getDisplayActions();

  return (
    <section aria-labelledby="group-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="group-title" className="text-base font-semibold">Nhóm thực hành</h2>
          <p className="text-sm text-muted-foreground">
            Chọn học sinh trên sơ đồ để xem nhận diện và thao tác bên cạnh
          </p>
        </div>
        {session.sources.length === 0 && (
          <span className="rounded-lg bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning-foreground">
            Chờ video nguồn để nhận diện
          </span>
        )}
      </div>

      <Card className="overflow-hidden">
        {session.sources.length === 0 && (
          <div className="border-b border-warning/30 bg-warning-soft/60 px-5 py-3 text-xs leading-relaxed text-warning-foreground">
            <strong>Thông báo đồng bộ:</strong> Tất cả video mẫu đã được xoá. Thông tin nhận diện và thao tác của học sinh bên dưới đã được chuyển sang dạng vị trí chuẩn để chờ video mới. Bạn có thể bấm <strong>"Chỉnh sửa"</strong> để cập nhật tên và đặc điểm của học sinh trong nhóm thực tế.
          </div>
        )}

        <div className="grid md:grid-cols-[minmax(18rem,5fr)_minmax(0,7fr)]">
          <div className="min-w-0 border-b border-border bg-background/50 p-4 md:border-r md:border-b-0 md:p-6">
            <div role="group" aria-label="Chọn học sinh theo vị trí quanh bàn" aria-describedby="seat-map-perspective" className="mx-auto w-full max-w-md">
              <p className="mb-5 text-center text-xs font-medium text-muted-foreground">Phía trong · xa máy quay</p>
              <div className="grid grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)] grid-rows-[6rem_6rem] gap-x-3 gap-y-5">
                <div aria-label="Bàn thí nghiệm" className="col-start-2 row-span-2 row-start-1 flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-secondary/70 px-2 py-4 text-center">
                  <span className="h-8 w-px bg-primary/25" aria-hidden="true" />
                  <span className="text-xs font-semibold leading-relaxed text-secondary-foreground">Bàn<br />thí nghiệm</span>
                  <span className="text-[10px] leading-relaxed text-muted-foreground">Đường chạy xe</span>
                  <span className="h-8 w-px bg-primary/25" aria-hidden="true" />
                </div>
                {SEATS.map((seat) => {
                  const student = students.find((profile) => profile.code === seat.code);
                  const active = selected?.code === seat.code;
                  return student ? (
                    <button
                      key={seat.code}
                      type="button"
                      id={`seat-${seat.code}`}
                      data-student-code={seat.code}
                      aria-label={`${seat.code} · ${seat.label}`}
                      aria-pressed={active}
                      aria-controls="student-detail-panel"
                      onClick={() => setSelectedCode(seat.code)}
                      style={{ gridRow: seat.row, gridColumn: seat.column }}
                      className={cn(
                        'relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                        active ? 'border-primary bg-primary-soft text-accent-foreground shadow-soft' : 'border-border bg-card hover:border-primary/40 hover:bg-primary-soft/30',
                      )}
                    >
                      <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
                      <span className="text-lg font-bold">{seat.code}</span>
                      <span className="text-xs">{seat.label}</span>
                      {active && <span className="absolute top-2 right-2 size-1.5 rounded-full bg-primary" aria-hidden="true" />}
                    </button>
                  ) : (
                    <div key={seat.code} style={{ gridRow: seat.row, gridColumn: seat.column }} className="flex items-center justify-center rounded-xl border border-dashed border-border p-2 text-center text-xs text-muted-foreground">
                      Chưa có học sinh
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground">
                <Camera className="size-4" aria-hidden="true" />
                <span>Máy quay · phía ngoài</span>
              </div>
            </div>
            <p id="seat-map-perspective" className="mx-auto mt-4 max-w-md text-center text-xs leading-relaxed text-muted-foreground">Trái / phải theo hướng nhìn từ máy quay vào bàn.</p>
          </div>

          <div
            id="student-detail-panel"
            role="region"
            aria-labelledby={selected ? `seat-${selected.code}` : undefined}
            aria-label={selected ? undefined : 'Thông tin học sinh'}
            className="min-w-0 space-y-5 p-5 sm:p-6"
          >
            {selected ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <Users className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-xl font-bold">{selected.code}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {selected.seatLabel}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingStudent({ ...selected })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted"
                  >
                    <Pencil className="size-3.5" />
                    <span>Chỉnh sửa</span>
                  </button>
                </div>

                <dl className="space-y-5 border-t border-border pt-5 text-sm leading-relaxed">
                  <div>
                    <dt className="mb-2 flex items-center gap-2 font-semibold">
                      <ScanEye className="size-4 text-primary" aria-hidden="true" />
                      Đặc điểm nhận diện
                    </dt>
                    <dd className="whitespace-pre-wrap wrap-break-word text-muted-foreground">
                      {selected.visualPosition}
                    </dd>
                  </div>
                  <div>
                    <dt className="mb-2 font-semibold">Thao tác chính</dt>
                    {session.sources.length === 0 ? (
                      <dd className="rounded-xl border border-dashed border-border bg-muted/40 p-3 text-xs italic text-muted-foreground">
                        Chưa có video đầu vào. Hãy tải video hoặc ảnh phiếu để AI tiến hành nhận diện thao tác của học sinh {selected.code}.
                      </dd>
                    ) : displayActions.length > 0 ? (
                      <dd>
                        <ul className="space-y-2 text-sm">
                          {displayActions.map((action, idx) => (
                            <li key={idx} className="flex items-start gap-2.5 text-foreground/90 leading-relaxed">
                              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                              <span>{action}</span>
                            </li>
                          ))}
                        </ul>
                      </dd>
                    ) : (
                      <dd className="rounded-xl border border-dashed border-border bg-muted/40 p-3 text-xs italic text-muted-foreground">
                        Chưa có thao tác nào được ghi nhận cho {selected.code}.
                      </dd>
                    )}
                  </div>
                </dl>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Phiên chưa có thông tin học sinh để hiển thị.</p>
            )}
          </div>
        </div>

        <div className="border-t border-border px-5 py-3 text-xs leading-relaxed text-muted-foreground">
          <b className="font-medium text-foreground">Giới hạn nhận diện:</b> Định danh theo vị trí ngồi và góc máy cố định, không cần tài khoản. Khi góc quay bị khuất hoặc không chắc chắn, AI-LENS giữ trạng thái <code>unknown</code> để học sinh và giáo viên xác minh.
        </div>
      </Card>

      {/* Modal Chỉnh sửa thông tin học sinh */}
      {editingStudent && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-player/70 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl sm:p-6 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground">
                Chỉnh sửa thông tin học sinh {editingStudent.code}
              </h3>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm">
              <label className="block space-y-1.5">
                <span className="font-medium">Tên / Vị trí học sinh</span>
                <input
                  type="text"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={editingStudent.seatLabel}
                  onChange={(e) =>
                    setEditingStudent({ ...editingStudent, seatLabel: e.target.value })
                  }
                  placeholder="Ví dụ: Vị trí Trái - Ngoài (Nguyễn Văn A)"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="font-medium">Đặc điểm nhận diện (quần áo, kính, tóc, vị trí)</span>
                <textarea
                  rows={2}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={editingStudent.visualPosition}
                  onChange={(e) =>
                    setEditingStudent({ ...editingStudent, visualPosition: e.target.value })
                  }
                  placeholder="Mô tả đặc điểm ngoại hình hoặc trang phục để nhận diện trên video..."
                />
              </label>

              <label className="block space-y-1.5">
                <span className="font-medium">Thao tác chính tóm tắt (mỗi dòng một ý ngắn gọn)</span>
                <textarea
                  rows={3}
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={editingStudent.mainObservedRole}
                  onChange={(e) =>
                    setEditingStudent({ ...editingStudent, mainObservedRole: e.target.value })
                  }
                  placeholder="Ví dụ:&#10;• Bấm đồng hồ đo thời gian&#10;• Dán vạch đích 40 cm"
                />
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="rounded-xl border border-input bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={() => {
                  app.handleUpdateStudent(editingStudent.code, {
                    seatLabel: editingStudent.seatLabel,
                    visualPosition: editingStudent.visualPosition,
                    mainObservedRole: editingStudent.mainObservedRole,
                  });
                  setEditingStudent(null);
                }}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
