import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  NOTIFICATION_AUDIENCES, NOTIFICATION_CHANNELS, NOTIFICATION_EVENTS, TEMPLATE_PLACEHOLDERS, renderTemplate, restaurantSettingsSchema, testNotificationSchema,
  type NotificationAudience, type NotificationChannel, type NotificationEvent,
} from '@dantes/shared';
import { settingsApi } from '../../api/endpoints';
import type { NotificationsPayload, RestaurantSettings } from '../../api/types';
import { Async, Badge, Button, Card, Field, Input, Select, Tabs, Textarea, Toggle } from '../../components/ui';
import { humanize } from '../../lib/format';
import { useAction, useDebounced } from '../../lib/hooks';
import { toast } from '../../store/toast';
import { useSaveSettings, useSettings } from './shared';

const key = (c: NotificationChannel, e: NotificationEvent, a: NotificationAudience) => `${a}|${e}|${c}`;

export function NotificationsTab({ readOnly }: { readOnly: boolean }) {
  const q = useQuery({ queryKey: ['notifications'], queryFn: settingsApi.notifications });
  const s = useSettings();
  return (
    <div className="space-y-4">
      <Async q={q}>
        {(n) => (
          <>
            <ChannelsCard n={n} readOnly={readOnly} />
            <MatrixCard n={n} readOnly={readOnly} />
          </>
        )}
      </Async>
      <Async q={s}>{(settings) => <AlertsCard s={settings} readOnly={readOnly} />}</Async>
      <Async q={q}>{(n) => <TemplateEditor n={n} readOnly={readOnly} />}</Async>
    </div>
  );
}

function ChannelsCard({ n, readOnly }: { n: NotificationsPayload; readOnly: boolean }) {
  const save = useAction((channels: { channel: NotificationChannel; enabled: boolean }[]) => settingsApi.putChannels(channels), { success: 'Channels updated', invalidate: [['notifications']] });
  const toggle = (channel: NotificationChannel, enabled: boolean) => save.mutate(n.channels.map((c) => ({ channel: c.channel, enabled: c.channel === channel ? enabled : c.enabled })));
  return (
    <Card title="Channels">
      <div className="grid gap-3 sm:grid-cols-3">
        {NOTIFICATION_CHANNELS.map((ch) => {
          const c = n.channels.find((x) => x.channel === ch);
          return (
            <div key={ch} className="rounded-lg border border-zinc-200 p-3">
              <div className="flex items-center justify-between"><span className="font-semibold">{humanize(ch)}</span><Toggle label={`${humanize(ch)} enabled`} checked={c?.enabled ?? false} disabled={readOnly || save.isPending} onChange={(v) => toggle(ch, v)} /></div>
              {c && !c.configured && <p className="mt-2 text-xs text-amber-800"><Badge tone="orange">Not configured</Badge> — messages will only be logged</p>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function MatrixCard({ n, readOnly }: { n: NotificationsPayload; readOnly: boolean }) {
  const baseline = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const a of NOTIFICATION_AUDIENCES) for (const e of NOTIFICATION_EVENTS) for (const c of NOTIFICATION_CHANNELS) m[key(c, e, a)] = n.settings.find((s) => s.channel === c && s.event === e && s.audience === a)?.enabled ?? false;
    return m;
  }, [n.settings]);
  const [draft, setDraft] = useState(baseline);
  useEffect(() => setDraft(baseline), [baseline]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const save = useAction(() => settingsApi.putNotificationSettings(Object.entries(draft).map(([k, enabled]) => { const [audience, event, channel] = k.split('|'); return { audience, event, channel, enabled }; })), { success: 'Notification matrix saved', invalidate: [['notifications']] });
  return (
    <Card title="Which events notify whom" actions={<Button variant="primary" size="sm" disabled={!dirty || readOnly} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save matrix</Button>}>
      <div className="grid gap-6 xl:grid-cols-2">
        {NOTIFICATION_AUDIENCES.map((a) => (
          <div key={a} className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="mb-1 text-left text-xs font-semibold uppercase text-zinc-600">{humanize(a)} messages</caption>
              <thead><tr><th scope="col" className="p-1 text-left">Event</th>{NOTIFICATION_CHANNELS.map((c) => <th scope="col" key={c} className="p-1 text-center text-xs">{humanize(c)}</th>)}</tr></thead>
              <tbody>
                {NOTIFICATION_EVENTS.map((e) => (
                  <tr key={e} className="border-t border-zinc-100">
                    <th scope="row" className="p-1 text-left font-normal">{humanize(e)}</th>
                    {NOTIFICATION_CHANNELS.map((c) => (
                      <td key={c} className="p-1 text-center"><input type="checkbox" disabled={readOnly} aria-label={`${humanize(a)}: ${humanize(e)} via ${humanize(c)}`} checked={draft[key(c, e, a)] ?? false} onChange={(ev) => setDraft((d) => ({ ...d, [key(c, e, a)]: ev.target.checked }))} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Card>
  );
}

const alertSchema = restaurantSettingsSchema.pick({ staffAlertPhones: true, staffAlertEmails: true });
function AlertsCard({ s, readOnly }: { s: RestaurantSettings; readOnly: boolean }) {
  const [phones, setPhones] = useState(s.staffAlertPhones);
  const [emails, setEmails] = useState(s.staffAlertEmails);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setPhones(s.staffAlertPhones); setEmails(s.staffAlertEmails); }, [s.staffAlertPhones, s.staffAlertEmails]);
  const save = useSaveSettings(s, { success: 'Staff alert recipients saved' });
  const dirty = JSON.stringify([phones, emails]) !== JSON.stringify([s.staffAlertPhones, s.staffAlertEmails]);
  function submit() {
    const r = alertSchema.safeParse({ staffAlertPhones: phones, staffAlertEmails: emails });
    if (!r.success) { setError(`${r.error.issues[0]?.path.join(' ')}: ${r.error.issues[0]?.message}`); return; }
    setError(null);
    save.mutate(r.data);
  }
  return (
    <Card title="Staff alert recipients" actions={<Button variant="primary" size="sm" disabled={!dirty || readOnly} loading={save.isPending} onClick={submit}>Save recipients</Button>}>
      <div className="grid gap-6 md:grid-cols-2">
        <ListEditor label="Alert phones" placeholder="0712 345 678" items={phones} onChange={setPhones} disabled={readOnly} />
        <ListEditor label="Alert emails" placeholder="kitchen@example.com" items={emails} onChange={setEmails} disabled={readOnly} />
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-tomato">{error}</p>}
    </Card>
  );
}

function ListEditor({ label, items, onChange, placeholder, disabled }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder: string; disabled?: boolean }) {
  const [v, setV] = useState('');
  const add = () => { const t = v.trim(); if (t && !items.includes(t)) onChange([...items, t]); setV(''); };
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">{label}</div>
      <ul className="mb-2 space-y-1">
        {items.map((it, i) => (
          <li key={it + i} className="flex items-center justify-between rounded border border-zinc-200 px-2 py-1 text-sm">{it}<button type="button" disabled={disabled} aria-label={`Remove ${it}`} className="px-1 text-tomato disabled:opacity-40" onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button></li>
        ))}
        {items.length === 0 && <li className="text-sm text-zinc-500">None added.</li>}
      </ul>
      <div className="flex gap-2">
        <Input aria-label={`Add to ${label}`} value={v} placeholder={placeholder} disabled={disabled} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <Button disabled={disabled || !v.trim()} onClick={add}>Add</Button>
      </div>
    </div>
  );
}

const SAMPLE: Record<string, string> = {
  customerName: 'Wanjiru', orderReference: 'DP-1042', total: 'KES 1,850', restaurantName: "Dante's Pizza", restaurantPhone: '+254 712 345 678', estimatedTime: '35 minutes', orderStatusUrl: 'https://example.com/order/DP-1042',
};

function TemplateEditor({ n, readOnly }: { n: NotificationsPayload; readOnly: boolean }) {
  const [audience, setAudience] = useState<NotificationAudience>('CUSTOMER');
  const [event, setEvent] = useState<NotificationEvent>('ORDER_RECEIVED');
  const [channel, setChannel] = useState<NotificationChannel>('SMS');
  const tpl = n.templates.find((t) => t.audience === audience && t.event === event && t.channel === channel);
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState('');
  const [recipient, setRecipient] = useState('');
  const [recipientErr, setRecipientErr] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setBody(tpl?.body ?? ''); setSubject(tpl?.subject ?? ''); }, [tpl?.body, tpl?.subject, audience, event, channel]);
  const dBody = useDebounced(body, 400);
  const preview = useQuery({ queryKey: ['tpl-preview', dBody], queryFn: () => settingsApi.preview(dBody), enabled: dBody.trim() !== '', retry: false });
  const rendered = preview.data?.rendered ?? (dBody ? renderTemplate(dBody, SAMPLE) : '');
  const tooLong = body.length > 1000;
  const save = useAction(() => settingsApi.putTemplate(channel, event, audience, { subject: channel === 'EMAIL' ? subject || null : null, body }), { success: 'Template saved', invalidate: [['notifications']] });
  const test = useAction(() => settingsApi.testNotification(channel, recipient), { onSuccess: (r) => toast.success(r?.message ?? `Test ${humanize(channel)} message sent`) });

  function insert(name: string) {
    const el = area.current;
    const token = `{${name}}`;
    if (!el) { setBody((b) => b + token); return; }
    const a = el.selectionStart ?? body.length;
    const z = el.selectionEnd ?? body.length;
    setBody(body.slice(0, a) + token + body.slice(z));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + token.length, a + token.length); });
  }
  function sendTest() {
    const r = testNotificationSchema.safeParse({ channel, recipient });
    if (!r.success) { setRecipientErr(r.error.issues[0]?.message ?? 'Invalid recipient'); return; }
    setRecipientErr(null);
    test.mutate(undefined);
  }

  return (
    <Card title="Message templates">
      <Tabs label="Audience" value={audience} onChange={setAudience} tabs={NOTIFICATION_AUDIENCES.map((a) => ({ key: a, label: `${humanize(a)} messages` }))} />
      <div className="my-3 grid gap-3 sm:grid-cols-2">
        <Field label="Event">{(id) => <Select id={id} value={event} onChange={(e) => setEvent(e.target.value as NotificationEvent)}>{NOTIFICATION_EVENTS.map((e) => <option key={e} value={e}>{humanize(e)}</option>)}</Select>}</Field>
        <Field label="Channel">{(id) => <Select id={id} value={channel} onChange={(e) => setChannel(e.target.value as NotificationChannel)}>{NOTIFICATION_CHANNELS.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</Select>}</Field>
      </div>
      <fieldset disabled={readOnly} className="space-y-3">
        {channel === 'EMAIL' && <Field label="Subject">{(id) => <Input id={id} value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} />}</Field>}
        <Field label="Message body" error={body.trim() === '' ? 'A message body is required' : tooLong ? 'Max 1000 characters' : undefined} hint={`${body.length}/1000`}>
          {(id, d) => <Textarea id={id} ref={area} rows={5} aria-describedby={d} value={body} onChange={(e) => setBody(e.target.value)} />}
        </Field>
        <div role="group" aria-label="Insert placeholder" className="flex flex-wrap gap-1.5">
          {TEMPLATE_PLACEHOLDERS.map((p) => <button key={p} type="button" onClick={() => insert(p)} className="rounded-full border border-brand/40 bg-cream px-2.5 py-0.5 text-xs font-medium text-amber-900 hover:bg-orange-100">{`{${p}}`}</button>)}
        </div>
        <div className="rounded-lg bg-zinc-100 p-3">
          <div className="mb-1 text-xs font-semibold uppercase text-zinc-500">Live preview{preview.isError && ' (sample data, server preview unavailable)'}</div>
          <p className="whitespace-pre-wrap text-sm" aria-live="polite">{rendered || 'Nothing to preview.'}</p>
        </div>
        <Button variant="primary" loading={save.isPending} disabled={body.trim() === '' || tooLong} onClick={() => save.mutate(undefined)}>Save template</Button>
      </fieldset>
      <div className="mt-5 border-t border-zinc-100 pt-4">
        <div className="mb-1 text-xs font-semibold uppercase text-zinc-600">Send test message via {humanize(channel)}</div>
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-60 flex-1">
            <Input aria-label="Test recipient" aria-invalid={!!recipientErr} value={recipient} disabled={readOnly} placeholder={channel === 'EMAIL' ? 'you@example.com' : '0712 345 678'} onChange={(e) => setRecipient(e.target.value)} />
            {recipientErr && <p role="alert" className="mt-1 text-xs text-tomato">{recipientErr}</p>}
          </div>
          <Button loading={test.isPending} disabled={readOnly} onClick={sendTest}>Send test message</Button>
        </div>
        {n.channels.find((c) => c.channel === channel)?.configured === false && <p className="mt-1 text-xs text-amber-800">This channel is not configured — the message will only be logged.</p>}
      </div>
    </Card>
  );
}
