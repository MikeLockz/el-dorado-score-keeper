import { staticExportParams } from '@/lib/static-export';

import RestoreGameModalClient from './RestoreGameModalClient';

export function generateStaticParams() {
  return staticExportParams('gameId');
}

export default function RestoreGameModalPage() {
  return <RestoreGameModalClient />;
}
