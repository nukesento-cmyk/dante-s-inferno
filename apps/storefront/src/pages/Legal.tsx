import type { ReactNode } from 'react';
import { useTitle } from '../hooks/useTitle';

function Doc({ title, children }: { title: string; children: ReactNode }) {
  useTitle(title);
  return (
    <div className="page container-x" style={{ maxWidth: 780 }}>
      <h1>{title}</h1>
      <p className="muted">Last updated: placeholder text, to be reviewed by the restaurant's legal advisor before launch.</p>
      {children}
    </div>
  );
}

export function Privacy() {
  return (
    <Doc title="Privacy policy">
      <h2 style={{ fontSize: '1.1rem' }}>What we collect</h2>
      <p>To fulfil an order we collect your name, phone number, delivery address and, optionally, your email. We do not store card details; card payments are handled by our payment provider and M-Pesa payments by Safaricom.</p>
      <h2 style={{ fontSize: '1.1rem' }}>How we use it</h2>
      <p>We use your details to prepare and deliver your order, to send order updates by SMS, WhatsApp or email, and to resolve problems with your order.</p>
      <h2 style={{ fontSize: '1.1rem' }}>Your rights</h2>
      <p>You may ask us to correct or delete your personal data in line with the Kenya Data Protection Act, 2019. Contact us using the details on the contact page.</p>
    </Doc>
  );
}

export function Terms() {
  return (
    <Doc title="Terms and conditions">
      <h2 style={{ fontSize: '1.1rem' }}>Orders and prices</h2>
      <p>All prices are in Kenyan shillings. The total shown at checkout, including any delivery fee, packaging and VAT, is the amount you pay.</p>
      <h2 style={{ fontSize: '1.1rem' }}>Payment</h2>
      <p>Orders start once payment is confirmed. If a payment fails you can retry from your order page.</p>
      <h2 style={{ fontSize: '1.1rem' }}>Delivery and collection</h2>
      <p>Delivery times are estimates. Delivery areas, fees and minimum orders are shown at checkout. Collection is from our restaurant address.</p>
      <h2 style={{ fontSize: '1.1rem' }}>Cancellations</h2>
      <p>Once the kitchen starts preparing your pizza we cannot cancel or refund it, except where the order is wrong or unsafe to eat.</p>
    </Doc>
  );
}
