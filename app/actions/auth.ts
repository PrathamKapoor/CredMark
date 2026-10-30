'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import {
    checkRateLimit,
    clearRateLimit,
    getClientIdentifier
} from '@/lib/utils/rate-limit';
import { isAdminUser } from '@/lib/auth/roles';

export async function signIn(formData: FormData) {
    // Get client identifier for rate limiting
    const headersList = await headers();
    const clientId = getClientIdentifier(headersList);

    // Check rate limit before processing
    const rateLimitCheck = await checkRateLimit(clientId);

    if (!rateLimitCheck.allowed) {
        return {
            error: rateLimitCheck.message || 'Too many login attempts. Please try again later.',
            rateLimited: true,
            retryAfter: rateLimitCheck.retryAfter
        };
    }

    const supabase = await createClient();

    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!email || !password) {
        return { error: 'Email and password are required' };
    }

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        const remainingMsg = rateLimitCheck.remainingAttempts !== undefined && rateLimitCheck.remainingAttempts > 0
            ? ` (${rateLimitCheck.remainingAttempts} attempt${rateLimitCheck.remainingAttempts !== 1 ? 's' : ''} remaining)`
            : '';

        return {
            error: 'Invalid email or password' + remainingMsg,
            remainingAttempts: rateLimitCheck.remainingAttempts
        };
    }

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!isAdminUser(user)) {
        await supabase.auth.signOut();
        return { error: 'Admin access required' };
    }

    // Clear local fallback and Redis rate-limit key for this identifier.
    await clearRateLimit(clientId);

    revalidatePath('/', 'layout');
    redirect('/admin');
}

export async function signOut() {
    const supabase = await createClient();
    await supabase.auth.signOut();
    revalidatePath('/', 'layout');
    redirect('/login');
}

export async function getUser() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

