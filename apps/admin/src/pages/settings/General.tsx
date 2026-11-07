import { useForm } from 'react-hook-form';
import { restaurantSettingsSchema } from '@dantes/shared';
import type { RestaurantSettings } from '../../api/types';
import { Async, Button, Card, Field, Input } from '../../components/ui';
import { sharedResolver } from '../../lib/resolver';
import { useSaveSettings, useSettings } from './shared';

const schema = restaurantSettingsSchema.pick({ defaultMaxExtraToppings: true });
interface FV { defaultMaxExtraToppings: string }

export function GeneralTab({ readOnly }: { readOnly: boolean }) {
  const q = useSettings();
  return <Async q={q}>{(s) => <GeneralForm s={s} readOnly={readOnly} />}</Async>;
}

function GeneralForm({ s, readOnly }: { s: RestaurantSettings; readOnly: boolean }) {
  const save = useSaveSettings(s);
  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm<FV, unknown, { defaultMaxExtraToppings: number }>({
    resolver: sharedResolver<FV>(schema, (v) => ({ defaultMaxExtraToppings: v.defaultMaxExtraToppings.trim() === '' ? Number.NaN : Number(v.defaultMaxExtraToppings) })),
    defaultValues: { defaultMaxExtraToppings: String(s.defaultMaxExtraToppings) },
  });
  return (
    <Card title="General" className="max-w-xl">
      <form onSubmit={handleSubmit((p) => save.mutate(p))} noValidate>
        <fieldset disabled={readOnly || save.isPending} className="space-y-3">
          <Field label="Default max extra toppings" hint="Used by products that don't set their own limit (0–12)" error={errors.defaultMaxExtraToppings?.message}>
            {(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" {...register('defaultMaxExtraToppings')} />}
          </Field>
          <Button type="submit" variant="primary" loading={isSubmitting || save.isPending} disabled={!isDirty}>Save</Button>
        </fieldset>
      </form>
    </Card>
  );
}
