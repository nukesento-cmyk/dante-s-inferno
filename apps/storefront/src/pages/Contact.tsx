import { formatKenyanPhone } from '@dantes/shared';
import { useSettings } from '../hooks/queries';
import { useTitle } from '../hooks/useTitle';
import { weeklyHours } from '../lib/hours';
import { OpenBadge } from '../components/OpenBadge';
import { ErrorBox, Loading } from '../components/States';

export default function Contact() {
  useTitle('Contact');
  const { data: s, isLoading, error, refetch } = useSettings();
  return (
    <div className="page container-x">
      <h1>Find us</h1>
      {isLoading && <Loading />}
      {error && <ErrorBox error={error} onRetry={() => refetch()} />}
      {s && (
        <div className="split split-eq">
          <div className="panel">
            <OpenBadge settings={s} />
            <h2 style={{ fontSize: '1.1rem', marginTop: 16 }}>Address</h2>
            <p>{s.address}</p>
            {s.mapUrl && <a className="btn btn-ghost btn-sm" href={s.mapUrl} target="_blank" rel="noreferrer">Open in maps</a>}
            <h2 style={{ fontSize: '1.1rem', marginTop: 24 }}>Get in touch</h2>
            <ul className="plain">
              <li>Call <a href={`tel:${s.phone}`}>{formatKenyanPhone(s.phone)}</a></li>
              {s.orderLinePhone && <li>Order line <a href={`tel:${s.orderLinePhone}`}>{formatKenyanPhone(s.orderLinePhone)}</a></li>}
              {s.whatsappPhone && <li>WhatsApp <a href={`https://wa.me/${s.whatsappPhone.replace(/^\+/, '')}`} target="_blank" rel="noreferrer">{formatKenyanPhone(s.whatsappPhone)}</a></li>}
              <li>Email <a href={`mailto:${s.email}`}>{s.email}</a></li>
            </ul>
          </div>
          <div className="panel">
            <h2 style={{ fontSize: '1.1rem' }}>Opening hours</h2>
            <ul className="plain hours" style={{ maxWidth: 320 }}>
              {weeklyHours(s.hours).map((h) => <li key={h.day}><span>{h.day}</span><span>{h.text}</span></li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
