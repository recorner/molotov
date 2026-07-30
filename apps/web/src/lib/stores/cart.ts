import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { toast } from '@zerodevx/svelte-toast';
import toastThemes from '$lib/toastThemes';

export interface CartItem {
  id: number;
  quantity: number;
  name?: string;
  price?: number;
  stock?: string | number;
  type?: string;
  category?: {
    id: number;
    name: string;
  };
}

/** Per-type purchase cap: licenses & services = 1 (one-per-customer); downloads are
 *  digital with unlimited stock, so they have no practical per-order cap. */
export function maxQtyForType(type?: string): number {
  if (type === 'LICENSE' || type === 'SERVICE') return 1;
  return 99; // DOWNLOAD (and unknown) — effectively unlimited
}

// Initialize cart from localStorage or empty array
function createCartStore() {
  let initialValue: CartItem[] = [];
  
  if (browser) {
    // Try localStorage first, then cookies as fallback
    const localCart = localStorage.getItem('cart');
    if (localCart) {
      try {
        initialValue = JSON.parse(localCart);
      } catch (e) {
        console.error('Failed to parse cart from localStorage:', e);
        initialValue = [];
      }
    } else {
      // Check cookies as fallback
      const cookieCart = document.cookie
        .split('; ')
        .find(row => row.startsWith('cart='))
        ?.split('=')[1];
      
      if (cookieCart) {
        try {
          initialValue = JSON.parse(decodeURIComponent(cookieCart));
        } catch (e) {
          console.error('Failed to parse cart from cookies:', e);
          initialValue = [];
        }
      }
    }
  }
  
  const { subscribe, set, update } = writable<CartItem[]>(initialValue);

  return {
    subscribe,
    set,
    update,
    addItem: (productId: number, quantity: number = 1, productData?: Partial<CartItem>, options?: { 
      showToast?: boolean; 
      preventDuplicates?: boolean;
      toastMessage?: string;
    }) => {
      const { showToast = true, preventDuplicates = false, toastMessage } = options || {};
      
      let wasAdded = false;
      let wasUpdated = false;
      let productName = productData?.name || `Product #${productId}`;
      
      update(cart => {
        const existingIndex = cart.findIndex(item => item.id === productId);
        
        if (existingIndex >= 0) {
          if (preventDuplicates) {
            // Don't add if item already exists and duplicates are prevented
            if (showToast) {
              toast.push(`${productName} is already in your cart`, {
                theme: toastThemes.error
              });
            }
            return cart;
          } else {
            // Update quantity (capped by product type)
            cart[existingIndex].quantity += quantity;
            wasUpdated = true;
          }

          // Update product data if provided
          if (productData) {
            cart[existingIndex] = { ...cart[existingIndex], ...productData };
          }
          // enforce per-type cap
          const capE = maxQtyForType(cart[existingIndex].type);
          if (cart[existingIndex].quantity > capE) cart[existingIndex].quantity = capE;
        } else {
          // Add new item (capped by product type)
          cart.push({
            id: productId,
            quantity: Math.min(quantity, maxQtyForType(productData?.type)),
            ...productData,
          });
          wasAdded = true;
        }
        
        // Sync to cookies for server-side access
        if (browser) {
          document.cookie = `cart=${encodeURIComponent(JSON.stringify(cart))}; path=/; max-age=2592000`; // 30 days
        }
        
        // Show success toast
        if (showToast && (wasAdded || wasUpdated)) {
          const message = toastMessage || 
            (wasAdded ? `${productName} added to cart` : 
             `${productName} quantity updated in cart`);
          
          toast.push(message, {
            theme: toastThemes.success
          });
        }
        
        return cart;
      });
    },
    removeItem: (productId: number, options?: { showToast?: boolean }) => {
      const { showToast = true } = options || {};
      
      update(cart => {
        const itemToRemove = cart.find(item => item.id === productId);
        const newCart = cart.filter(item => item.id !== productId);
        
        // Show toast notification
        if (showToast && itemToRemove) {
          const productName = itemToRemove.name || `Product #${productId}`;
          toast.push(`${productName} removed from cart`, {
            theme: toastThemes.success
          });
        }
        
        // Sync to cookies
        if (browser) {
          document.cookie = `cart=${encodeURIComponent(JSON.stringify(newCart))}; path=/; max-age=2592000`;
        }
        return newCart;
      });
    },
    updateQuantity: (productId: number, quantity: number, options?: { showToast?: boolean }) => {
      const { showToast = false } = options || {};
      
      update(cart => {
        const existingIndex = cart.findIndex(item => item.id === productId);
        if (existingIndex >= 0) {
          const productName = cart[existingIndex].name || `Product #${productId}`;
          
          if (quantity <= 0) {
            cart.splice(existingIndex, 1);
            if (showToast) {
              toast.push(`${productName} removed from cart`, {
                theme: toastThemes.success
              });
            }
          } else {
            const cap = maxQtyForType(cart[existingIndex].type);
            cart[existingIndex].quantity = Math.min(quantity, cap);
            if (showToast) {
              toast.push(`${productName} quantity updated`, {
                theme: toastThemes.success
              });
            }
          }
        }
        // Sync to cookies
        if (browser) {
          document.cookie = `cart=${encodeURIComponent(JSON.stringify(cart))}; path=/; max-age=2592000`;
        }
        return cart;
      });
    },
    clear: (options?: { showToast?: boolean; toastMessage?: string }) => {
      const { showToast = false, toastMessage = 'Cart cleared' } = options || {};
      
      set([]);
      if (browser) {
        // Clear both localStorage and cookies
        localStorage.setItem('cart', JSON.stringify([]));
        document.cookie = `cart=[]; path=/; max-age=2592000`;
      }
      
      if (showToast) {
        toast.push(toastMessage, {
          theme: toastThemes.success
        });
      }
    },
    syncFromCookies: () => {
      if (browser) {
        // Force sync from cookies (useful after server-side updates)
        const cookieCart = document.cookie
          .split('; ')
          .find(row => row.startsWith('cart='))
          ?.split('=')[1];
        
        if (cookieCart) {
          try {
            const parsedCart = JSON.parse(decodeURIComponent(cookieCart));
            set(parsedCart);
            localStorage.setItem('cart', JSON.stringify(parsedCart));
          } catch (e) {
            console.error('Failed to parse cart from cookies:', e);
            set([]);
            localStorage.setItem('cart', JSON.stringify([]));
          }
        } else {
          set([]);
          localStorage.setItem('cart', JSON.stringify([]));
        }
      }
    },
    // Sync cart with server data
    syncWithProducts: (products: any[]) => {
      update(cart => {
        return cart.map(cartItem => {
          const product = products.find(p => p.id === cartItem.id);
          if (product) {
            return {
              ...cartItem,
              name: product.name,
              price: product.price,
              stock: product.stock,
              type: product.type,
              category: product.category
            };
          }
          return cartItem;
        });
      });
    },
    // Initialize from server data (for SSR)
    initFromServer: (serverCart: { id: number; quantity: number }[]) => {
      if (browser) {
        // Only sync if local cart is empty or server has newer data
        const localCart = JSON.parse(localStorage.getItem('cart') || '[]');
        if (localCart.length === 0 && serverCart.length > 0) {
          set(serverCart);
          localStorage.setItem('cart', JSON.stringify(serverCart));
        } else {
          // Use local cart as it's more recent
          set(localCart);
        }
      } else {
        set(serverCart);
      }
    }
  };
}

export const cart = createCartStore();

// Persist cart to localStorage whenever it changes
if (browser) {
  cart.subscribe(value => {
    localStorage.setItem('cart', JSON.stringify(value));
  });
}

// Derived store for cart totals
export const cartTotals = derived(cart, $cart => ({
  items: $cart.length,
  quantity: $cart.reduce((total, item) => total + item.quantity, 0),
  total: $cart.reduce((total, item) => total + (item.price || 0) * item.quantity, 0)
}));

// Derived store to check if item is in cart
export const isInCart = derived(cart, $cart => (productId: number) => 
  $cart.some(item => item.id === productId)
);
