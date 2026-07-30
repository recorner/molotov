import { userFromToken } from '$lib/util';
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { listConversations } from '$lib/chat.server';

export const load: LayoutServerLoad = async ({ cookies }) => {
  const me = userFromToken(cookies.get('__token'));
  if (!me?.id) throw redirect(302, '/auth/login');
  return { conversations: await listConversations(me.id), meId: me.id };
};
