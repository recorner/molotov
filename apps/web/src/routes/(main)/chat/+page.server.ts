import prisma from '$lib/prisma';
import { userFromToken } from '$lib/util';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { findOrCreateDM } from '$lib/chat.server';

export const actions: Actions = {
  async startDM({ cookies, request }) {
    const me = userFromToken(cookies.get('__token'));
    if (!me?.id) return fail(401, { error: 'unauthorized' });

    const username = (((await request.formData()).get('username') as string) || '').trim().replace(/^@/, '');
    if (!username) return fail(400, { error: 'Enter a username.' });

    const other = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!other) return fail(400, { error: `No user named “${username}”.` });
    if (other.id === me.id) return fail(400, { error: 'You can’t message yourself.' });

    const id = await findOrCreateDM(me.id, other.id);
    throw redirect(303, `/chat/${id}`);
  },
};
