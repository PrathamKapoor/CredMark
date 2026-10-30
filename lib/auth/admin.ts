import type { User } from '@supabase/supabase-js';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/auth/roles';

type RequireAdminResult =
    | { ok: true; user: User }
    | { ok: false; status: 401 | 403; error: string };

type VerifyAdminPasswordResult =
    | { ok: true }
    | { ok: false; error: string };

export async function requireAdminUser(): Promise<RequireAdminResult> {
    const supabase = await createClient();
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    if (error || !user) {
        return { ok: false, status: 401, error: 'Unauthorized' };
    }

    if (!isAdminUser(user)) {
        return { ok: false, status: 403, error: 'Forbidden' };
    }

    return { ok: true, user };
}

export async function requireAdminOrThrow(): Promise<User> {
    const adminCheck = await requireAdminUser();

    if (!adminCheck.ok) {
        throw new Error('Forbidden');
    }

    return adminCheck.user;
}

export async function verifyAdminPassword(
    email: string,
    password: string,
    expectedUserId: string
): Promise<VerifyAdminPasswordResult> {
    if (!email || !password || !expectedUserId) {
        return { ok: false, error: 'Invalid admin credentials' };
    }

    const supabase = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
                detectSessionInUrl: false,
            },
        }
    );

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error || !data.user) {
        return { ok: false, error: 'Invalid admin credentials' };
    }

    if (data.user.id !== expectedUserId || !isAdminUser(data.user)) {
        await supabase.auth.signOut();
        return { ok: false, error: 'Invalid admin credentials' };
    }

    await supabase.auth.signOut();
    return { ok: true };
}
