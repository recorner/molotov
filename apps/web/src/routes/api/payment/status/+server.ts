import { json, type RequestHandler } from '@sveltejs/kit';
import { userFromToken } from '$lib/util';
import prisma from '$lib/prisma';
import { isStalePending } from '$lib/txStatus';

export const GET: RequestHandler = async ({ url, cookies }) => {
  const user = userFromToken(cookies.get('__token'));
  if (!user?.id) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const paymentId = url.searchParams.get('id');
  if (!paymentId) {
    return json({ error: 'Payment ID required' }, { status: 400 });
  }

  try {
    // Get local topUp record
    const topUp = await prisma.topUp.findFirst({
      where: {
        reference: paymentId,
        userId: user.id,
      },
      select: {
        id: true,
        amount: true,
        completed: true,
        status: true,
        createdAt: true,
      },
    });

    if (!topUp) {
      return json({ error: 'Payment not found' }, { status: 404 });
    }

    // Get payment status from NowPayments
    const response = await fetch(`https://api.nowpayments.io/v1/payment/${paymentId}`, {
      headers: {
        'x-api-key': process.env.NOWPAYMENTS_API_KEY!,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      
      if (response.status === 404) {
        console.log(`⚠️ Payment ${paymentId} not found on NowPayments - might be processing or expired`);
        
        // Check if payment is old enough to be considered expired
        const paymentAge = Date.now() - topUp.createdAt.getTime();
        const isExpired = paymentAge > 15 * 60 * 1000; // 15 minutes
        
        // If expired and not completed, we could optionally mark it somehow
        // For now, we'll just return the status without DB changes
        
        return json({
          payment: {
            id: paymentId,
            status: isExpired ? 'expired' : 'waiting',
            amount: topUp.amount,
            created_at: topUp.createdAt,
            local_completed: topUp.completed,
            local_status: topUp.status,
            api_error: false,
            message: isExpired ? 'Payment expired (15 minute timeout)' : 'Payment still processing',
          },
        });
      }
      
      console.error(`Failed to fetch payment status from NowPayments: ${response.status} ${response.statusText}`, errorText);
      
      // Return local data if NowPayments API fails
      return json({
        payment: {
          id: paymentId,
          status: topUp.completed ? 'confirmed' : 'waiting',
          amount: topUp.amount,
          created_at: topUp.createdAt,
          local_completed: topUp.completed,
          api_error: true,
        },
      });
    }

    const paymentData = await response.json();

    // Update local database if payment status changed
    const paymentStatus = paymentData.payment_status;
    let updatedTopUp = topUp;
    let effectiveStatus = paymentStatus;

    // Check if we need to update the local record
    if (['confirmed', 'finished'].includes(paymentStatus) && !topUp.completed) {
      // Payment confirmed - update balance and mark as completed
      await prisma.$transaction(async (tx) => {
        // Update the topUp record
        updatedTopUp = await tx.topUp.update({
          where: { id: topUp.id },
          data: {
            completed: true,
            status: paymentStatus,
            // Store the payment data for reference
            reference: paymentData.payment_id, // ensure reference is set
          },
          select: {
            id: true,
            amount: true,
            completed: true,
            status: true,
            createdAt: true,
          },
        });

        // Update user balance
        await tx.user.update({
          where: { id: user.id },
          data: {
            balance: {
              increment: parseFloat(paymentData.price_amount),
            },
          },
        });
      });

      console.log(`✅ Payment ${paymentId} confirmed - Updated user balance (+$${paymentData.price_amount})`);
      
    } else if (['failed', 'expired', 'refunded'].includes(paymentStatus) && !topUp.completed) {
      // Payment failed/expired - update status but don't complete
      updatedTopUp = await prisma.topUp.update({
        where: { id: topUp.id },
        data: { status: paymentStatus },
        select: {
          id: true,
          amount: true,
          completed: true,
          status: true,
          createdAt: true,
        },
      });
      console.log(`❌ Payment ${paymentId} ${paymentStatus} - Status updated`);
    } else if (!topUp.completed && isStalePending(paymentStatus, topUp.completed, topUp.createdAt)) {
      // NOWPayments still reports a pending state, but the payment window has
      // long passed with no funds — expire it on our side.
      effectiveStatus = 'expired';
      updatedTopUp = await prisma.topUp.update({
        where: { id: topUp.id },
        data: { status: 'expired' },
        select: { id: true, amount: true, completed: true, status: true, createdAt: true },
      });
      console.log(`⌛ Payment ${paymentId} expired locally (stale, status was ${paymentStatus})`);
    } else if (topUp.status !== paymentStatus) {
      // Update status if it changed
      updatedTopUp = await prisma.topUp.update({
        where: { id: topUp.id },
        data: { status: paymentStatus },
        select: {
          id: true,
          amount: true,
          completed: true,
          status: true,
          createdAt: true,
        },
      });
    }

    return json({
      payment: {
        id: paymentData.payment_id,
        status: effectiveStatus,
        amount: paymentData.price_amount,
        currency: paymentData.price_currency,
        pay_amount: paymentData.pay_amount,
        pay_currency: paymentData.pay_currency,
        pay_address: paymentData.pay_address,
        created_at: paymentData.created_at,
        updated_at: paymentData.updated_at,
        local_completed: updatedTopUp.completed,
      },
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('Error fetching payment status:', error);
    return json({ error: 'Failed to fetch payment status' }, { status: 500 });
  }
};
