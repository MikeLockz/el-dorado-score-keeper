import { staticExportParams } from '@/lib/static-export';

import RestoreGameModalClient from './RestoreGameModalClient';

export async function generateStaticParams() {
  return staticExportParams('gameId');
}

export default function RestoreGameModalPage() {
  return <RestoreGameModalClient />;
}
