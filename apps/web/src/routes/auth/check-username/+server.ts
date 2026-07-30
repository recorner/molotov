import { json } from '@sveltejs/kit';
import prisma from '$lib/prisma';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { username } = await request.json();
    
    if (!username || typeof username !== 'string' || username.length < 3) {
      return json({ available: false, error: 'Invalid username' });
    }

    const existingUser = await prisma.user.findUnique({
      where: { username },
      select: { id: true }
    });

    return json({ available: !existingUser });
  } catch (error) {
    console.error('Username check error:', error);
    return json({ available: false, error: 'Server error' }, { status: 500 });
  }
};
