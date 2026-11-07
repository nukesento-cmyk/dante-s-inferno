import { useState } from 'react';
import { useMe } from '../lib/auth';
import { PageHeader, Tabs } from '../components/ui';
import { PricingTab } from './settings/Pricing';
import { ContactTab } from './settings/Contact';
import { HoursTab } from './settings/Hours';
import { NotificationsTab } from './settings/Notifications';
import { GeneralTab } from './settings/General';

type Tab = 'pricing' | 'contact' | 'hours' | 'notifications' | 'general';

export function SettingsPage() {
  const me = useMe();
  const readOnly = me.role !== 'OWNER';
  const [tab, setTab] = useState<Tab>('pricing');
  return (
    <>
      <PageHeader title="Settings" subtitle="Restaurant configuration — nothing here is hardcoded in the storefront" />
      {readOnly && <div role="note" className="mb-3 rounded-md border border-amber-300 bg-cream px-3 py-2 text-sm">You have read-only access to settings. Only the owner can make changes.</div>}
      <Tabs label="Settings sections" value={tab} onChange={setTab} tabs={[{ key: 'pricing', label: 'Pricing' }, { key: 'contact', label: 'Contact' }, { key: 'hours', label: 'Opening hours' }, { key: 'notifications', label: 'Notifications' }, { key: 'general', label: 'General' }]} />
      <div className="mt-4" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'pricing' && <PricingTab readOnly={readOnly} />}
        {tab === 'contact' && <ContactTab readOnly={readOnly} />}
        {tab === 'hours' && <HoursTab readOnly={readOnly} />}
        {tab === 'notifications' && <NotificationsTab readOnly={readOnly} />}
        {tab === 'general' && <GeneralTab readOnly={readOnly} />}
      </div>
    </>
  );
}
