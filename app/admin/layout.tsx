import { getUser } from '@/app/actions/auth';
import { redirect } from 'next/navigation';
import AdminLayoutClient from './AdminLayoutClient';
import { isAdminUser } from '@/lib/auth/roles';

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const user = await getUser();

    if (!user) {
        redirect('/login');
    }

    if (!isAdminUser(user)) {
        redirect('/verify');
    }

    return <AdminLayoutClient user={user}>{children}</AdminLayoutClient>;
}
