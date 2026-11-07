import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { openingHoursSchema, restaurantSettingsSchema, specialClosureSchema } from '@dantes/shared';
import { settingsApi } from '../../api/endpoints';
import type { Closure, HoursDay, RestaurantSettings } from '../../api/types';
import { Async, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Textarea, Toggle } from '../../components/ui';
import { fmtDate, todayISO } from '../../lib/format';
import { useAction } from '../../lib/hooks';
import { sharedResolver } from '../../lib/resolver';
import { useSaveSettings, useSettings } from './shared';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function HoursTab({ readOnly }: { readOnly: boolean }) {
  const s = useSettings();
  const h = useQuery({ queryKey: ['hours'], queryFn: settingsApi.hours });
  return (
    <div className="space-y-4">
      <Async q={s}>{(settings) => <OrderingCard s={settings} readOnly={readOnly} />}</Async>
      <Async q={h}>{(hours) => <HoursForm hours={hours} readOnly={readOnly} />}</Async>
      <Async q={s}>{(settings) => <CutoffCard s={settings} readOnly={readOnly} />}</Async>
      <ClosuresCard readOnly={readOnly} />
    </div>
  );
}

function OrderingCard({ s, readOnly }: { s: RestaurantSettings; readOnly: boolean }) {
  const [msg, setMsg] = useState(s.pauseMessage);
  const [confirm, setConfirm] = useState(false);
  const save = useSaveSettings(s, { success: 'Ordering settings updated', onSuccess: () => setConfirm(false) });
  return (
    <Card title="Ordering controls">
      <div className={`mb-4 rounded-lg border-2 p-4 ${s.orderingPaused ? 'border-tomato bg-red-50' : 'border-emerald-300 bg-emerald-50'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-bold">{s.orderingPaused ? 'Ordering is PAUSED' : 'Ordering is live'}</div>
            <div className="text-sm text-zinc-600">{s.orderingPaused ? 'Customers cannot place new orders.' : 'Switch on to stop all new orders immediately.'}</div>
          </div>
          <label className="flex items-center gap-2 font-semibold">
            Pause ordering
            <Toggle label="Pause ordering" checked={s.orderingPaused} disabled={readOnly || save.isPending} onChange={(v) => (v ? setConfirm(true) : save.mutate({ orderingPaused: false }))} />
          </label>
        </div>
        <div className="mt-3">
          <Field label="Message shown to customers" hint={`${msg.length}/200`}>
            {(id) => <Textarea id={id} rows={2} maxLength={200} value={msg} disabled={readOnly} onChange={(e) => setMsg(e.target.value)} placeholder="We're very busy right now — back shortly!" />}
          </Field>
          {s.orderingPaused && msg !== s.pauseMessage && <Button className="mt-2" size="sm" loading={save.isPending} disabled={readOnly} onClick={() => save.mutate({ pauseMessage: msg })}>Update message</Button>}
        </div>
      </div>
      <fieldset disabled={readOnly || save.isPending} className="grid gap-3 sm:grid-cols-3">
        {([['deliveryEnabled', 'Delivery enabled'], ['collectionEnabled', 'Collection enabled'], ['scheduledOrderingEnabled', 'Allow scheduled orders (outside hours)']] as const).map(([k, label]) => (
          <label key={k} className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2">{label}<Toggle label={label} checked={s[k]} onChange={(v) => save.mutate({ [k]: v })} /></label>
        ))}
      </fieldset>
      <ConfirmDialog open={confirm} danger title="Pause ordering?" message={<>New orders will be blocked immediately. Customers will see: <em>“{msg || 'Ordering is temporarily paused.'}”</em></>} confirmLabel="Pause ordering" loading={save.isPending} onCancel={() => setConfirm(false)} onConfirm={() => save.mutate({ orderingPaused: true, pauseMessage: msg })} />
    </Card>
  );
}

const cutoffSchema = restaurantSettingsSchema.pick({ lastOrderMinutesBeforeClose: true });
function CutoffCard({ s, readOnly }: { s: RestaurantSettings; readOnly: boolean }) {
  const save = useSaveSettings(s);
  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<{ lastOrderMinutesBeforeClose: string }, unknown, { lastOrderMinutesBeforeClose: number }>({
    resolver: sharedResolver<{ lastOrderMinutesBeforeClose: string }>(cutoffSchema, (v) => ({ lastOrderMinutesBeforeClose: v.lastOrderMinutesBeforeClose.trim() === '' ? Number.NaN : Number(v.lastOrderMinutesBeforeClose) })),
    defaultValues: { lastOrderMinutesBeforeClose: String(s.lastOrderMinutesBeforeClose) },
  });
  return (
    <Card title="Last-order cut-off" className="max-w-xl">
      <form onSubmit={handleSubmit((p) => save.mutate(p))} noValidate>
        <fieldset disabled={readOnly || save.isPending} className="flex items-end gap-3">
          <Field label="Minutes before closing" error={errors.lastOrderMinutesBeforeClose?.message} className="flex-1">{(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" {...register('lastOrderMinutesBeforeClose')} />}</Field>
          <Button type="submit" variant="primary" loading={save.isPending} disabled={!isDirty}>Save</Button>
        </fieldset>
      </form>
    </Card>
  );
}

const formSchema = z.object({ days: openingHoursSchema });
interface HV { days: HoursDay[] }
function HoursForm({ hours, readOnly }: { hours: HoursDay[]; readOnly: boolean }) {
  const sorted = Array.from({ length: 7 }, (_, d) => hours.find((x) => x.dayOfWeek === d) ?? { dayOfWeek: d, openTime: '10:00', closeTime: '22:00', closed: false });
  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isDirty } } = useForm<HV>({
    resolver: sharedResolver<HV>(formSchema),
    defaultValues: { days: sorted },
  });
  const save = useAction((b: HV) => settingsApi.putHours(b.days), { success: 'Opening hours saved', invalidate: [['hours']], onSuccess: () => reset(undefined, { keepValues: true }) });
  return (
    <Card title="Opening hours (Africa/Nairobi)">
      <form onSubmit={handleSubmit((p) => save.mutate(p))} noValidate>
        <fieldset disabled={readOnly || save.isPending} className="space-y-2">
          {DISPLAY_ORDER.map((d) => {
            const closed = watch(`days.${d}.closed`);
            const err = errors.days?.[d]?.closeTime?.message;
            return (
              <div key={d} className="grid grid-cols-[7rem_1fr] items-center gap-2 sm:grid-cols-[7rem_5rem_1fr_1fr]">
                <span className="font-medium">{DAYS[d]}</span>
                <label className="flex items-center gap-2 text-sm"><Toggle size="sm" label={`${DAYS[d]} closed`} checked={closed} onChange={(v) => setValue(`days.${d}.closed`, v, { shouldDirty: true })} />Closed</label>
                <Input aria-label={`${DAYS[d]} opens`} type="time" disabled={closed} {...register(`days.${d}.openTime`)} />
                <div>
                  <Input aria-label={`${DAYS[d]} closes`} type="time" disabled={closed} aria-invalid={!!err} {...register(`days.${d}.closeTime`)} />
                  {err && <p role="alert" className="text-xs text-tomato">{err}</p>}
                </div>
              </div>
            );
          })}
          <Button type="submit" variant="primary" loading={save.isPending} disabled={!isDirty} className="mt-2">Save opening hours</Button>
        </fieldset>
      </form>
    </Card>
  );
}

const HOLIDAYS = [
  { label: 'New Year’s Day', m: 1, d: 1 },
  { label: 'Labour Day', m: 5, d: 1 },
  { label: 'Madaraka Day', m: 6, d: 1 },
  { label: 'Mashujaa Day', m: 10, d: 20 },
  { label: 'Jamhuri Day', m: 12, d: 12 },
  { label: 'Christmas Day', m: 12, d: 25 },
  { label: 'Boxing Day', m: 12, d: 26 },
];
export function nextOccurrence(m: number, d: number, today = todayISO()): string {
  const year = Number(today.slice(0, 4));
  const mk = (y: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return mk(mk(year) >= today ? year : year + 1);
}

interface CV { date: string; label: string; closed: boolean; openTime: string; closeTime: string }
function ClosuresCard({ readOnly }: { readOnly: boolean }) {
  const q = useQuery({ queryKey: ['closures'], queryFn: settingsApi.closures });
  const [removing, setRemoving] = useState<Closure | null>(null);
  const add = useAction((b: unknown) => settingsApi.addClosure(b), { success: 'Closure added', invalidate: [['closures']] });
  const del = useAction((id: string) => settingsApi.removeClosure(id), { success: 'Closure removed', invalidate: [['closures']], onSuccess: () => setRemoving(null) });
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<CV>({
    resolver: sharedResolver<CV>(specialClosureSchema, (v) => ({ date: v.date, label: v.label, closed: v.closed, openTime: v.closed ? null : v.openTime || null, closeTime: v.closed ? null : v.closeTime || null })),
    defaultValues: { date: '', label: '', closed: true, openTime: '12:00', closeTime: '18:00' },
  });
  const closed = watch('closed');
  return (
    <Card title="Special closures & holiday hours">
      <fieldset disabled={readOnly} className="space-y-4">
        <div className="flex flex-wrap gap-2" aria-label="Public holiday quick-add">
          {HOLIDAYS.map((h) => (
            <Button key={h.label} size="sm" disabled={add.isPending} onClick={() => add.mutate({ date: nextOccurrence(h.m, h.d), label: h.label, closed: true, openTime: null, closeTime: null })}>+ {h.label}</Button>
          ))}
        </div>
        <form onSubmit={handleSubmit((p) => add.mutate(p, { onSuccess: () => reset() }))} noValidate className="grid items-start gap-3 sm:grid-cols-6">
          <Field label="Date" error={errors.date?.message} className="sm:col-span-1">{(id, d) => <Input id={id} type="date" aria-describedby={d} {...register('date')} />}</Field>
          <Field label="Label" error={errors.label?.message} className="sm:col-span-2">{(id, d) => <Input id={id} aria-describedby={d} placeholder="e.g. Staff party" {...register('label')} />}</Field>
          <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" {...register('closed')} /> Closed all day</label>
          {!closed && (<>
            <Field label="Opens" error={errors.openTime?.message}>{(id) => <Input id={id} type="time" {...register('openTime')} />}</Field>
            <Field label="Closes" error={errors.closeTime?.message}>{(id) => <Input id={id} type="time" {...register('closeTime')} />}</Field>
          </>)}
          <div className="sm:col-span-6"><Button type="submit" loading={add.isPending}>Add closure</Button></div>
        </form>
      </fieldset>
      <div className="mt-4">
        <Async q={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No special closures" />}>
          {(rows) => (
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {rows.slice().sort((a, b) => a.date.localeCompare(b.date)).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span><strong>{fmtDate(c.date)}</strong> — {c.label}</span>
                  <span className="flex items-center gap-2">{c.closed ? <Badge tone="red">Closed</Badge> : <Badge tone="orange">{c.openTime}–{c.closeTime}</Badge>}
                    <Button size="sm" variant="ghost" className="text-tomato" disabled={readOnly} onClick={() => setRemoving(c)}>Remove</Button></span>
                </li>
              ))}
            </ul>
          )}
        </Async>
      </div>
      <ConfirmDialog open={!!removing} danger title="Remove closure?" message={<>Remove “{removing?.label}” on {removing && fmtDate(removing.date)}?</>} confirmLabel="Remove" loading={del.isPending} onCancel={() => setRemoving(null)} onConfirm={() => removing && del.mutate(removing.id)} />
    </Card>
  );
}
