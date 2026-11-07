import { useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../../api/endpoints';
import type { RestaurantSettings } from '../../api/types';
import { useAction } from '../../lib/hooks';

export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });

/** PUT /admin/settings takes the whole restaurantSettingsSchema, so merge the edited slice into the current settings. */
export function useSaveSettings(current: RestaurantSettings, opts: { success?: string; onSuccess?: () => void } = {}) {
  const qc = useQueryClient();
  return useAction((partial: Partial<RestaurantSettings>) => settingsApi.put({ ...current, ...partial }), {
    success: opts.success ?? 'Settings saved',
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings'] });
      opts.onSuccess?.();
    },
  });
}
