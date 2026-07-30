import prisma from '$lib/prisma';
import { json, type RequestHandler } from '@sveltejs/kit';
import { telegramNotifications } from '$lib/telegram-notifications';
import { emitPaymentConfirmed, emitPaymentFailed } from '$lib/paymentEvents';
import { verifyIpnSignature } from '$lib/nowpayments.server';
import { notifyEscrow } from '$lib/escrow.server';
import { getFeeConfig } from '$lib/escrow-fee.server';
import { computeFee } from '$lib/escrow-fee';
import { notify } from '$lib/notify.server';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  // Verify IPN secret is configured
  if (!process.env.NOWPAYMENTS_IPN_SECRET) {
    console.error('NOWPAYMENTS_IPN_SECRET not configured');
    return json({ error: 'Server configuration error' }, { status: 500 });
  }

  try {
    const body = await request.json();

    // Verify HMAC signature (recursively key-sorted JSON, per NOWPayments spec)
    const receivedSignature = request.headers.get('x-nowpayments-sig');
    if (!verifyIpnSignature(body, receivedSignature, process.env.NOWPAYMENTS_IPN_SECRET)) {
      console.error('Invalid IPN signature', {
        received: receivedSignature,
        clientIP: getClientAddress(),
      });
      return json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Log the IPN for debugging
    console.log('Received valid IPN:', {
      payment_id: body.payment_id,
      payment_status: body.payment_status,
      order_id: body.order_id,
      timestamp: new Date().toISOString(),
    });

    const isSuccess = body.payment_status === 'confirmed' || body.payment_status === 'finished';

    // Escrow funding payments (guest real-time funding) carry order_id "escrow_<id>".
    const orderId: string = body.order_id || '';
    if (orderId.startsWith('escrow_')) {
      if (isSuccess) {
        const escrowId = Number(orderId.split('_')[1]);
        const esc = await prisma.escrow.findUnique({
          where: { id: escrowId },
          select: { id: true, amount: true, status: true },
        });
        if (esc && esc.status !== 'FUNDED' && esc.status !== 'COMPLETED') {
          const fee = computeFee(esc.amount, await getFeeConfig());
          await prisma.escrow.update({
            where: { id: esc.id },
            data: {
              status: 'FUNDED',
              fundedAt: new Date(),
              fee,
              fundingRef: String(body.payment_id),
              events: { create: { type: 'FUNDED', message: `Buyer funded the escrow ($${esc.amount.toFixed(2)}).` } },
            },
          });
          await notifyEscrow(`💰 Escrow #${esc.id} funded via crypto ($${esc.amount.toFixed(2)}).`);
        }
      }
      return json({ ok: true });
    }

    // Process successful payments. NOWPayments' terminal success status is
    // `finished`; `confirmed` is the blockchain-confirmed intermediate. Credit on either.
    if (body.payment_status === 'confirmed' || body.payment_status === 'finished') {
      const topUp = await prisma.topUp.findUnique({
        where: {
          reference: body.payment_id ? body.payment_id.toString() : body.invoice_id,
        },
        select: {
          id: true,
          amount: true,
          completed: true,
          userId: true,
        },
      });

      if (!topUp) {
        console.error('TopUp not found for payment:', body.payment_id || body.invoice_id);
        return json({ error: 'Payment not found' }, { status: 404 });
      }

      if (topUp.completed) {
        console.log('Payment already processed:', topUp.id);
        return json({ ok: true, message: 'Already processed' });
      }

      // Update topUp and user balance in transaction
      await prisma.$transaction([
        prisma.topUp.update({
          where: { id: topUp.id },
          data: { completed: true, status: body.payment_status },
        }),
        prisma.user.update({
          where: { id: topUp.userId },
          data: {
            balance: { increment: topUp.amount },
          },
        }),
      ]);

      await notify(topUp.userId, 'deposit', 'Deposit confirmed', `$${topUp.amount.toFixed(2)} was added to your balance.`, `/balance/history/${topUp.id}`);

      console.log('Payment processed successfully:', {
        topUpId: topUp.id,
        userId: topUp.userId,
        amount: topUp.amount,
      });

      // Send systematic notifications
      await telegramNotifications.notifyPaymentConfirmed({
        id: body.payment_id ? body.payment_id.toString() : body.invoice_id,
        amount: topUp.amount,
        currency: 'USD', // We store in USD
        userId: topUp.userId
      });

      // Send personal Telegram notification if queued
      await telegramNotifications.sendPaymentConfirmation(body.payment_id?.toString() || body.invoice_id);

      // TODO: Emit event for real-time updates (WebSocket/Redis pub-sub)
      // This can be used for Telegram bot integration in the future
      emitPaymentConfirmed(
        topUp.userId, 
        body.payment_id ? body.payment_id.toString() : body.invoice_id,
        topUp.amount
      );
    }

    // Handle other payment statuses
    if (['failed', 'expired', 'refunded'].includes(body.payment_status)) {
      console.log('Payment failed/expired/refunded:', {
        payment_id: body.payment_id,
        status: body.payment_status,
        reason: body.outcome?.reason || 'N/A',
      });

      // Try to find the topUp to emit failure event and send notifications
      const topUp = await prisma.topUp.findUnique({
        where: {
          reference: body.payment_id ? body.payment_id.toString() : body.invoice_id,
        },
        select: {
          userId: true,
          amount: true,
        },
      });

      if (topUp) {
        // Send systematic failure notifications
        await telegramNotifications.notifyPaymentFailed({
          id: body.payment_id ? body.payment_id.toString() : body.invoice_id,
          amount: topUp.amount,
          currency: 'USD',
          userId: topUp.userId,
          status: body.payment_status,
          reason: body.outcome?.reason
        });

        // Emit failure event for real-time updates
        emitPaymentFailed(
          topUp.userId,
          body.payment_id ? body.payment_id.toString() : body.invoice_id,
          topUp.amount,
          body.payment_status
        );
      }
    }

    return json({ ok: true });
  } catch (error) {
    console.error('IPN processing error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};
