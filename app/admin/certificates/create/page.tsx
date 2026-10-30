import { getTemplates } from '@/app/actions/templates';
import { getFolders } from '@/app/actions/certificates';
import CreateCertificateForm from './CreateCertificateForm';

export default async function CreateCertificatePage() {
    const [templates, folders] = await Promise.all([getTemplates(), getFolders()]);

    return <CreateCertificateForm templates={templates} folders={folders} />;
}
