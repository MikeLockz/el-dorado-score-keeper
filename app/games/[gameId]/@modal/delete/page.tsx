import { staticExportParams } from '@/lib/static-export';

import DeleteGameModalClient from './DeleteGameModalClient';

export async function generateStaticParams() {
  return staticExportParams('gameId');
}

export default function DeleteGameModalPage() {
  return <DeleteGameModalClient />;
}
