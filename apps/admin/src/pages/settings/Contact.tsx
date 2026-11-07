import { useForm } from 'react-hook-form';
import { formatKenyanPhone, restaurantSettingsSchema } from '@dantes/shared';
import type { RestaurantSettings } from '../../api/types';
import { Async, Button, Card, Field, Input, Textarea } from '../../components/ui';
import { sharedResolver } from '../../lib/resolver';
import { useSaveSettings, useSettings } from './shared';

const schema = restaurantSettingsSchema.pick({ name: true, phone: true, whatsappPhone: true, orderLinePhone: true, email: true, address: true, mapUrl: true });
interface FV { name: string; phone: string; whatsappPhone: string; orderLinePhone: string; email: string; address: string; mapUrl: string }
const blankNull = (s: string) => (s.trim() === '' ? null : s.trim());

export function ContactTab({ readOnly }: { readOnly: boolean }) {
  const q = useSettings();
  return <Async q={q}>{(s) => <ContactForm s={s} readOnly={readOnly} />}</Async>;
}

function ContactForm({ s, readOnly }: { s: RestaurantSettings; readOnly: boolean }) {
  const save = useSaveSettings(s);
  const f = (p: string | null) => (p ? formatKenyanPhone(p) : '');
  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm<FV>({
    resolver: sharedResolver<FV>(schema, (v) => ({ name: v.name, phone: v.phone, whatsappPhone: blankNull(v.whatsappPhone), orderLinePhone: blankNull(v.orderLinePhone), email: v.email, address: v.address, mapUrl: blankNull(v.mapUrl) })),
    defaultValues: { name: s.name, phone: f(s.phone), whatsappPhone: f(s.whatsappPhone), orderLinePhone: f(s.orderLinePhone), email: s.email, address: s.address, mapUrl: s.mapUrl ?? '' },
  });
  return (
    <Card title="Contact details" className="max-w-3xl">
      <form onSubmit={handleSubmit((p) => save.mutate(p))} noValidate>
        <fieldset disabled={readOnly || save.isPending} className="grid gap-3 sm:grid-cols-2">
          <Field label="Restaurant name" error={errors.name?.message}>{(id, d) => <Input id={id} aria-describedby={d} {...register('name')} />}</Field>
          <Field label="Email" error={errors.email?.message}>{(id, d) => <Input id={id} type="email" aria-describedby={d} {...register('email')} />}</Field>
          <Field label="Main phone" hint="e.g. 0712 345 678 (stored as +254…)" error={errors.phone?.message}>{(id, d) => <Input id={id} type="tel" aria-describedby={d} {...register('phone')} />}</Field>
          <Field label="WhatsApp number" hint="Optional" error={errors.whatsappPhone?.message}>{(id, d) => <Input id={id} type="tel" aria-describedby={d} {...register('whatsappPhone')} />}</Field>
          <Field label="Order line" hint="Optional" error={errors.orderLinePhone?.message}>{(id, d) => <Input id={id} type="tel" aria-describedby={d} {...register('orderLinePhone')} />}</Field>
          <Field label="Map link" hint="Optional Google Maps URL" error={errors.mapUrl?.message}>{(id, d) => <Input id={id} type="url" aria-describedby={d} {...register('mapUrl')} />}</Field>
          <Field label="Address" className="sm:col-span-2" error={errors.address?.message}>{(id, d) => <Textarea id={id} rows={2} aria-describedby={d} {...register('address')} />}</Field>
          <div className="sm:col-span-2"><Button type="submit" variant="primary" loading={isSubmitting || save.isPending} disabled={!isDirty}>Save contact details</Button></div>
        </fieldset>
      </form>
    </Card>
  );
}
