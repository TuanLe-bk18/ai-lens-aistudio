import { useState } from 'react';
import { Camera, ScanEye, UserRound, Users } from 'lucide-react';
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

export function StudentSeating({ students }: { students: StudentSeatProfile[] }) {
  const [selectedCode, setSelectedCode] = useState<StudentCode>('HS01');
  const selected = students.find((student) => student.code === selectedCode)
    ?? SEATS.map((seat) => students.find((student) => student.code === seat.code)).find(Boolean);

  return (
    <section aria-labelledby="group-title">
      <div className="mb-3">
        <h2 id="group-title" className="text-base font-semibold">Nhóm thực hành</h2>
        <p className="text-sm text-muted-foreground">Chọn học sinh trên sơ đồ để xem nhận diện và thao tác bên cạnh</p>
      </div>
      <Card className="overflow-hidden">
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
            {selected ? <>
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><Users className="size-5" aria-hidden="true" /></span>
                <div className="min-w-0">
                  <h3 className="text-xl font-bold">{selected.code}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{selected.seatLabel}</p>
                </div>
              </div>
              <dl className="space-y-5 border-t border-border pt-5 text-sm leading-relaxed">
                <div>
                  <dt className="mb-2 flex items-center gap-2 font-semibold"><ScanEye className="size-4 text-primary" aria-hidden="true" />Đặc điểm nhận diện</dt>
                  <dd className="whitespace-pre-wrap wrap-break-word text-muted-foreground">{selected.visualPosition}</dd>
                </div>
                <div>
                  <dt className="mb-2 font-semibold">Thao tác chính</dt>
                  <dd className="whitespace-pre-wrap wrap-break-word">{selected.mainObservedRole}</dd>
                </div>
              </dl>
            </> : <p className="text-sm text-muted-foreground">Phiên chưa có thông tin học sinh để hiển thị.</p>}
          </div>
        </div>
        <div className="border-t border-border px-5 py-3 text-xs leading-relaxed text-muted-foreground">
          <b className="font-medium text-foreground">Giới hạn nhận diện:</b> Định danh theo vị trí ngồi và góc máy cố định, không cần tài khoản. Khi góc quay bị khuất hoặc không chắc chắn, AI-LENS giữ trạng thái <code>unknown</code> để học sinh và giáo viên xác minh.
        </div>
      </Card>
    </section>
  );
}
