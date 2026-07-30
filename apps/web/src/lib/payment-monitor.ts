// Payment monitoring service to check status and handle timeouts
import prisma from './prisma';
import { telegramNotifications } from './telegram-notifications';

const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io';
const PAYMENT_TIMEOUT_MINUTES = 15; // Payment expires after 15 minutes

interface PaymentStatusResponse {
  payment_id: number;
  payment_status: string;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  pay_currency: string;
  order_id: string;
  order_description: string;
  created_at: string;
  updated_at: string;
}

export class PaymentMonitorService {
  private static instance: PaymentMonitorService;
  private isRunning = false;

  private constructor() {}

  static getInstance(): PaymentMonitorService {
    if (!PaymentMonitorService.instance) {
      PaymentMonitorService.instance = new PaymentMonitorService();
    }
    return PaymentMonitorService.instance;
  }

  /**
   * Start the payment monitoring service
   */
  start(): void {
    if (this.isRunning) {
      console.log('⚠️ Payment monitor already running');
      return;
    }

    this.isRunning = true;
    console.log('🔍 Starting payment monitor service...');
    
    // Check payments every 2 minutes
    setInterval(async () => {
      await this.checkPendingPayments();
    }, 2 * 60 * 1000);

    // Run initial check
    this.checkPendingPayments();
  }

  /**
   * Stop the payment monitoring service
   */
  stop(): void {
    this.isRunning = false;
    console.log('🛑 Payment monitor service stopped');
  }

  /**
   * Check all pending payments
   */
  async checkPendingPayments(): Promise<void> {
    try {
      // Get payments that are not completed and don't have a failed/expired status
      const pendingPayments = await prisma.topUp.findMany({
        where: {
          completed: false,
          status: {
            notIn: ['failed', 'expired', 'refunded']
          },
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
        select: {
          id: true,
          reference: true,
          amount: true,
          userId: true,
          status: true,
          createdAt: true,
          user: {
            select: {
              username: true,
              telegram: true,
            },
          },
        },
      });

      console.log(`🔍 Checking ${pendingPayments.length} pending payments...`);

      for (const payment of pendingPayments) {
        await this.checkPaymentStatus(payment);
      }
    } catch (error) {
      console.error('❌ Error checking pending payments:', error);
    }
  }

  /**
   * Check individual payment status
   */
  async checkPaymentStatus(payment: any): Promise<void> {
    try {
      const paymentAge = Date.now() - payment.createdAt.getTime();
      const isExpired = paymentAge > PAYMENT_TIMEOUT_MINUTES * 60 * 1000;

      // Check with NowPayments API
      const response = await fetch(`${NOWPAYMENTS_API_URL}/v1/payment/${payment.reference}`, {
        headers: {
          'x-api-key': process.env.NOWPAYMENTS_API_KEY!,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`⚠️ Payment ${payment.reference} not found on NowPayments`);
          
          // If payment is older than timeout, mark as expired
          if (isExpired) {
            await this.markPaymentAsExpired(payment);
          }
          return;
        }
        
        console.error(`❌ Failed to check payment ${payment.reference}: ${response.status}`);
        return;
      }

      const paymentData: PaymentStatusResponse = await response.json();
      console.log(`📊 Payment ${payment.reference} status: ${paymentData.payment_status}`);

      // Handle different payment statuses
      switch (paymentData.payment_status) {
        case 'confirmed':
          if (!payment.completed) {
            console.log(`✅ Payment ${payment.reference} confirmed, processing...`);
            await this.processConfirmedPayment(payment, paymentData);
          }
          break;

        case 'failed':
        case 'refunded':
          await this.markPaymentAsFailed(payment, paymentData.payment_status);
          break;

        case 'expired':
          await this.markPaymentAsExpired(payment);
          break;

        case 'waiting':
        case 'confirming':
          // Check if payment has timed out
          if (isExpired) {
            console.log(`⏰ Payment ${payment.reference} expired (${PAYMENT_TIMEOUT_MINUTES} minutes timeout)`);
            await this.markPaymentAsExpired(payment);
          }
          break;
      }
    } catch (error) {
      console.error(`❌ Error checking payment ${payment.reference}:`, error);
    }
  }

  /**
   * Process confirmed payment
   */
  async processConfirmedPayment(payment: any, paymentData: PaymentStatusResponse): Promise<void> {
    try {
      // Update topUp and user balance in transaction
      await prisma.$transaction([
        prisma.topUp.update({
          where: { id: payment.id },
          data: { 
            completed: true,
            status: 'confirmed'
          },
        }),
        prisma.user.update({
          where: { id: payment.userId },
          data: {
            balance: { increment: payment.amount },
          },
        }),
      ]);

      console.log(`✅ Payment ${payment.reference} processed successfully`);

      // Send confirmation notifications
      await telegramNotifications.notifyPaymentConfirmed({
        id: payment.reference,
        amount: payment.amount,
        currency: 'USD',
        userId: payment.userId,
      });

      // Send personal notification to user
      await telegramNotifications.sendPaymentConfirmation(payment.reference);
    } catch (error) {
      console.error(`❌ Error processing confirmed payment ${payment.reference}:`, error);
    }
  }

  /**
   * Mark payment as failed
   */
  async markPaymentAsFailed(payment: any, status: string): Promise<void> {
    try {
      console.log(`❌ Marking payment ${payment.reference} as ${status}`);

      // Update database status (only if not already failed)
      if (payment.status !== 'failed') {
        await prisma.topUp.update({
          where: { id: payment.id },
          data: { status: 'failed' },
        });

        // Send failure notifications ONLY once
        await telegramNotifications.notifyPaymentFailed({
          id: payment.reference,
          amount: payment.amount,
          currency: 'USD',
          userId: payment.userId,
          status: status,
        });

        // Send personal failure notification
        await telegramNotifications.sendPaymentFailure(payment.reference, status);
      }
    } catch (error) {
      console.error(`❌ Error marking payment ${payment.reference} as failed:`, error);
    }
  }

  /**
   * Mark payment as expired
   */
  async markPaymentAsExpired(payment: any): Promise<void> {
    try {
      console.log(`⏰ Marking payment ${payment.reference} as expired`);

      // Update database status (only if not already expired)
      if (payment.status !== 'expired') {
        await prisma.topUp.update({
          where: { id: payment.id },
          data: { status: 'expired' },
        });

        // Send expiration notifications ONLY once
        await telegramNotifications.notifyPaymentFailed({
          id: payment.reference,
          amount: payment.amount,
          currency: 'USD',
          userId: payment.userId,
          status: 'expired',
          reason: 'Payment timeout (15 minutes)',
        });

        // Send personal expiration notification
        await telegramNotifications.sendPaymentFailure(payment.reference, 'expired');
      }
    } catch (error) {
      console.error(`❌ Error marking payment ${payment.reference} as expired:`, error);
    }
  }
}

export const paymentMonitor = PaymentMonitorService.getInstance();
