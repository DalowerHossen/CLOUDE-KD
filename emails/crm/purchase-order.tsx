// path: emails/crm/purchase-order.tsx
import { Text } from '@react-email/components';
import { BaseLayout } from '../layout/base-layout';

export interface PurchaseOrderEmailProps {
  supplierName: string;
  companyName: string;
  number: string;
  orderDate: string;
  expectedDate: string;
  total: string;
  shipTo: string;
  notes: string;
  /** One line per item, for example "3 x Blue Widget at $2.50 = $7.50". */
  lines: string;
}

export function PurchaseOrderEmail(p: PurchaseOrderEmailProps): JSX.Element {
  return (
    <BaseLayout preview={`Purchase order ${p.number} from ${p.companyName}`}>
      <Text style={{ fontSize: 15, lineHeight: '22px' }}>Hello {p.supplierName},</Text>
      <Text style={{ fontSize: 15, lineHeight: '22px' }}>
        {p.companyName} sends you purchase order {p.number} dated {p.orderDate}.
        {p.expectedDate ? ` Please deliver by ${p.expectedDate}.` : ''} All amounts are in US
        dollars.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: '22px', whiteSpace: 'pre-line' }}>{p.lines}</Text>
      <Text style={{ fontSize: 15, fontWeight: 700 }}>Total: {p.total}</Text>
      {p.shipTo ? <Text style={{ fontSize: 14 }}>Deliver to: {p.shipTo}</Text> : null}
      {p.notes ? <Text style={{ fontSize: 14, whiteSpace: 'pre-line' }}>{p.notes}</Text> : null}
      <Text style={{ fontSize: 13, color: '#555555' }}>
        Please confirm this order by replying to this message.
      </Text>
    </BaseLayout>
  );
}
