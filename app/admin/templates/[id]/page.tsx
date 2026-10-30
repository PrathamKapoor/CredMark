import { notFound } from 'next/navigation';
import { getTemplate } from '@/app/actions/templates';
import EditTemplateForm from './EditTemplateForm';

interface EditTemplatePageProps {
    params: Promise<{ id: string }>;
}

export default async function EditTemplatePage({ params }: EditTemplatePageProps) {
    const { id } = await params;
    const template = await getTemplate(id);

    if (!template) {
        notFound();
    }

    return <EditTemplateForm template={template} />;
}
