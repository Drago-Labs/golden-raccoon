import { AppShell } from '@/components/AppShell';
import { DriftTracker } from '@/components/research/allocation-drift/DriftTracker';
export const metadata={title:'Allocation drift | Golden Raccoon'};
export default function Page(){return <AppShell><DriftTracker/></AppShell>;}
