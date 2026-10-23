// path: components/marketing/blocks/icons.tsx
import {
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  Calculator,
  Check,
  Clock,
  Cloud,
  CreditCard,
  Eye,
  FileText,
  Globe,
  Key,
  Layers,
  LifeBuoy,
  Link2,
  Lock,
  Mail,
  Plug,
  Receipt,
  Repeat,
  Search,
  Server,
  Shield,
  Smartphone,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { IconName } from '@/lib/cms/blocks';

const MAP: Record<IconName, LucideIcon> = {
  'file-text': FileText,
  'credit-card': CreditCard,
  users: Users,
  wallet: Wallet,
  calculator: Calculator,
  'bar-chart': BarChart3,
  shield: Shield,
  lock: Lock,
  key: Key,
  globe: Globe,
  mail: Mail,
  bell: Bell,
  cloud: Cloud,
  repeat: Repeat,
  check: Check,
  zap: Zap,
  layers: Layers,
  plug: Plug,
  clock: Clock,
  briefcase: Briefcase,
  building: Building2,
  receipt: Receipt,
  search: Search,
  'life-buoy': LifeBuoy,
  eye: Eye,
  server: Server,
  smartphone: Smartphone,
  link: Link2,
};

export function BlockIcon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}): JSX.Element {
  const Icon = MAP[name];
  return <Icon className={className ?? 'h-6 w-6'} aria-hidden="true" />;
}
