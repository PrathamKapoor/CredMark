import { getTemplates } from '@/app/actions/templates';
import { getFolders } from '@/app/actions/certificates';
import BulkImportForm from './BulkImportForm';

export default async function BulkImportPage() {
    const [templates, folders] = await Promise.all([getTemplates(), getFolders()]);

    return <BulkImportForm templates={templates} folders={folders} />;
}
