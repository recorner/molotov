<script lang="ts">
  /**
   * Single source of truth for app icons. Renders inline Lucide SVGs (instant, no
   * network fetch, no load-flash) from one consistent, high-quality set. Accepts
   * either a short name ("home") or a legacy "material-symbols:home" / "ic:baseline-telegram"
   * string so existing call sites keep working.
   */
  import {
    Home, Package, ShoppingCart, CreditCard, LayoutDashboard, Boxes, Upload, Users,
    Banknote, Settings, CircleUser, Wallet, Menu, Clock, Send, Plus, Zap, Megaphone,
    LayoutGrid, MessageCircle, Bitcoin, MonitorSmartphone, MessagesSquare, Handshake,
    History, LogOut, Bell, ReceiptText, Store, Check, Circle, Sparkles,
  } from 'lucide-svelte';

  export let name: string;
  let className: string = 'w-5 h-5';
  export { className as class };

  const MAP: Record<string, any> = {
    home: Home, 'home-rounded': Home,
    'package-2': Package,
    'shopping-cart': ShoppingCart,
    'credit-card': CreditCard, 'credit-card-outline': CreditCard,
    dashboard: LayoutDashboard, 'dashboard-outline': LayoutDashboard,
    'inventory-2': Boxes, 'inventory-2-outline': Boxes,
    upload: Upload,
    group: Users, 'group-outline': Users,
    payments: Banknote, 'payments-outline': Banknote,
    settings: Settings, 'settings-outline': Settings,
    'account-circle': CircleUser,
    'account-balance-wallet': Wallet, 'account-balance-wallet-outline': Wallet,
    menu: Menu, 'menu-rounded': Menu,
    schedule: Clock,
    telegram: Send,
    add: Plus,
    bolt: Zap,
    'campaign-outline': Megaphone,
    category: LayoutGrid, 'category-outline': LayoutGrid,
    'chat-bubble-outline': MessageCircle,
    'currency-bitcoin': Bitcoin,
    devices: MonitorSmartphone,
    'forum-outline': MessagesSquare,
    'handshake-outline': Handshake,
    history: History,
    logout: LogOut,
    'notifications-outline': Bell,
    'receipt-long-outline': ReceiptText,
    'storefront-outline': Store,
    'check-rounded': Check,
    'card-generator': Sparkles,
  };

  $: key = (name || '').replace(/^material-symbols:/, '').replace(/^ic:baseline-/, '');
  $: Cmp = MAP[key] || Circle;
</script>

<svelte:component this={Cmp} class={className} strokeWidth={1.75} />
