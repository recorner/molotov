// Payment event system for real-time updates
// This can be extended with WebSocket or Redis pub/sub for Telegram bot integration

export interface PaymentEvent {
  type: 'payment_created' | 'payment_confirmed' | 'payment_failed';
  userId: number;
  paymentId: string;
  amount: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

class PaymentEventEmitter {
  private listeners: Map<string, Set<(event: PaymentEvent) => void>> = new Map();

  subscribe(eventType: string, callback: (event: PaymentEvent) => void) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(eventType)?.delete(callback);
    };
  }

  emit(event: PaymentEvent) {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(event);
        } catch (error) {
          console.error('Error in payment event listener:', error);
        }
      });
    }

    // Also emit to 'all' listeners
    const allListeners = this.listeners.get('all');
    if (allListeners) {
      allListeners.forEach(callback => {
        try {
          callback(event);
        } catch (error) {
          console.error('Error in payment event listener:', error);
        }
      });
    }

    // Log for debugging
    console.log('Payment event emitted:', {
      type: event.type,
      userId: event.userId,
      paymentId: event.paymentId,
      amount: event.amount,
    });
  }
}

export const paymentEvents = new PaymentEventEmitter();

// Example usage for Telegram integration:
// paymentEvents.subscribe('payment_confirmed', (event) => {
//   // Send notification to Telegram bot
//   telegramBot.sendMessage(event.userId, `Payment confirmed: $${event.amount}`);
// });

export function emitPaymentCreated(userId: number, paymentId: string, amount: number) {
  paymentEvents.emit({
    type: 'payment_created',
    userId,
    paymentId,
    amount,
    timestamp: new Date(),
  });
}

export function emitPaymentConfirmed(userId: number, paymentId: string, amount: number) {
  paymentEvents.emit({
    type: 'payment_confirmed',
    userId,
    paymentId,
    amount,
    timestamp: new Date(),
  });
}

export function emitPaymentFailed(userId: number, paymentId: string, amount: number, reason?: string) {
  paymentEvents.emit({
    type: 'payment_failed',
    userId,
    paymentId,
    amount,
    timestamp: new Date(),
    metadata: { reason },
  });
}
