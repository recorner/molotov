<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount, onDestroy, tick } from 'svelte';
  import QRCode from 'qrcode';
  import { ESCROW_STATUS, ESCROW_TONE_CLASSES, ESCROW_TONE_DOT } from '$lib/escrow';
  import type { EscrowStatus } from '$lib/escrow';
  import { POPULAR_CURRENCIES, buildPaymentUri } from '$lib/nowpayments';
  import CurrencyPicker from '$lib/components/CurrencyPicker.svelte';
  import type { ActionData, PageData } from './$types';

  export let data: PageData;
  export let form: ActionData;

  let busy = false;
  let showDispute = false;
  let fundMethod: 'balance' | 'crypto' = 'crypto';
  let fundCurrency = 'btc';
  let payoutCurrency = 'btc';
  let messageBody = '';
  let qr = '';
  let chatBox: HTMLElement;
  let poll: ReturnType<typeof setInterval>;
  let copied = '';

  $: d = data.deal;
  $: meta = ESCROW_STATUS[d.status as EscrowStatus];
  $: side = data.viewer.side;
  $: net = Math.round((d.amount - d.fee) * 100) / 100;
  $: funding = (form && (form as any).funding) || data.funding || null;
  $: if (funding?.address) makeQr(funding);
  $: shareUrl = $page.url.origin + '/escrow/' + d.publicId;
  $: counterpartyJoined = side ? (side === 'buyer' ? !!d.sellerName : !!d.buyerName) : true;
  // default an account buyer to "balance" when they can afford it
  $: if (side === 'buyer' && data.viewer.auth === 'account' && data.me && data.me.balance >= d.amount && fundMethod === 'crypto' && !funding) fundMethod = 'balance';

  async function makeQr(f: any) {
    try { qr = await QRCode.toDataURL(buildPaymentUri(f.currency, f.address, f.amount), { width: 320, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b3b34', light: '#ffffff' } }); }
    catch { qr = ''; }
  }
  onMount(() => { poll = setInterval(() => invalidateAll(), 3000); scrollChat(); });
  onDestroy(() => clearInterval(poll));
  async function scrollChat() { await tick(); if (chatBox) chatBox.scrollTop = chatBox.scrollHeight; }
  function copy(t: string, k: string) { navigator.clipboard.writeText(t).then(() => { copied = k; setTimeout(() => (copied = ''), 1500); }); }

  const initials = (n: string | null | undefined) => (n || '?').slice(0, 2).toUpperCase();
  function fmtSeen(d: string | Date | null | undefined): string {
    if (!d) return '';
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 90) return 'online';
    if (s < 3600) return `last seen ${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `last seen ${Math.floor(s / 3600)}h ago`;
    return `last seen ${Math.floor(s / 86400)}d ago`;
  }
  function tickState(m: any): 'sent' | 'delivered' | 'read' {
    if (m.readAt) return 'read';
    const ls = data.counterparty?.lastSeen;
    if (ls && new Date(ls).getTime() >= new Date(m.createdAt).getTime()) return 'delivered';
    return 'sent';
  }
  function isMine(m: any): boolean {
    if (data.me) return m.senderId === data.me.id;
    return !!side && m.senderName === (side === 'buyer' ? d.buyerName : d.sellerName) && !m.fromAdmin;
  }

  const handle = () => () => {
    busy = true;
    return async ({ result }: any) => {
      busy = false;
      if (result.type === 'success') { if (result.data?.sent) messageBody = ''; showDispute = false; await invalidateAll(); scrollChat(); }
      else if (result.type === 'failure') { /* surfaced via form */ await invalidateAll(); }
    };
  };
</script>

<svelte:head><title>{d.title} - Escrow - Sereni</title></svelte:head>

<div class="max-w-4xl mx-auto">
  <a href="/escrow" class="inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-200 mb-4">← Escrow</a>

  {#if form?.error}
    <div class="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2.5">{form.error}</div>
  {/if}

  {#if !data.isParty && !data.isAdmin && data.joinOpen}
    <!-- ============ JOIN (auth choice) ============ -->
    <div class="max-w-lg mx-auto">
      <div class="text-center mb-6">
        <span class="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 mb-3">🔒 You've been invited to an escrow deal</span>
        <h1 class="text-2xl font-montserrat font-bold">Review &amp; join</h1>
      </div>
      <div class="card mb-4">
        <div class="flex items-start justify-between gap-3">
          <div><p class="text-xs text-neutral-400">Deal</p><p class="font-semibold">{d.title}</p></div>
          <div class="text-right"><p class="text-xs text-neutral-400">Amount</p><p class="text-xl font-bold text-emerald-400">${d.amount.toFixed(2)}</p></div>
        </div>
        <p class="text-sm text-neutral-400 mt-2">You'll join as the <span class="text-emerald-300 font-medium">{data.joinSide}</span>.</p>
        {#if d.description}<p class="text-sm text-neutral-300 whitespace-pre-wrap mt-3 pt-3 border-t border-neutral-800">{d.description}</p>{/if}
      </div>

      {#if data.me}
        <!-- authed: one-click join with account -->
        <div class="card">
          <p class="text-sm text-neutral-300 mb-3">You're signed in as <strong>@{data.me.username}</strong>. Join with your account to manage this deal from your dashboard.</p>
          <form method="post" action="?/join" use:enhance={handle()}>
            <button class="btn" disabled={busy}>Join as {data.joinSide} (@{data.me.username})</button>
          </form>
        </div>
      {:else}
        <!-- guest: auth choice first -->
        <div class="card mb-3">
          <p class="text-sm font-medium mb-1">Are you an account user?</p>
          <p class="text-sm text-neutral-400 mb-3">Sign in to finish on your account and keep all deals in one place.</p>
          <div class="grid grid-cols-2 gap-2">
            <a href={`/auth/login?redirect=${encodeURIComponent('/escrow/' + d.publicId)}`} class="btn text-center">Log in to finish</a>
            <a href={`/auth/register?redirect=${encodeURIComponent('/escrow/' + d.publicId)}`} class="btn !bg-neutral-700 hover:!bg-neutral-600 text-center">Create account</a>
          </div>
        </div>
        <div class="card">
          <p class="text-sm text-neutral-300 mb-3">…or continue as a guest:</p>
          <form method="post" action="?/join" use:enhance={handle()} class="space-y-3">
            <input name="name" class="input w-full text-sm" placeholder="Your name" />
            <input name="email" type="email" class="input w-full text-sm" placeholder="Email (optional)" />
            <div class="input"><span class="text-neutral-400">@</span><input name="telegram" class="w-full bg-transparent text-sm focus:outline-none text-neutral-100" placeholder="Telegram (optional)" /></div>
            <button class="btn" disabled={busy}>Join as {data.joinSide}</button>
          </form>
        </div>
      {/if}
    </div>

  {:else if !data.isParty && !data.isAdmin}
    <div class="card text-center py-12 max-w-lg mx-auto">
      <p class="font-medium mb-1">This deal is already in progress</p>
      <p class="text-sm text-neutral-400">Only the two parties can view it. If this is your deal, open it on the device/account you used.</p>
    </div>

  {:else}
    <!-- ============ DEAL (party / admin) ============ -->
    <div class="flex items-start justify-between gap-3 mb-4">
      <div>
        <h1 class="text-2xl font-montserrat font-bold">{d.title}</h1>
        <p class="text-sm text-neutral-400">Deal {d.publicId}{side ? ` · you're the ${side}` : data.isAdmin ? ' · admin view' : ''}</p>
      </div>
      <span class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border shrink-0 {ESCROW_TONE_CLASSES[meta.tone]}"><span class="w-1.5 h-1.5 rounded-full {ESCROW_TONE_DOT[meta.tone]}"></span>{meta.label}</span>
    </div>

    {#if side && !counterpartyJoined && d.status === 'PROPOSED'}
      <div class="card mb-4 border-emerald-500/30 bg-emerald-500/5">
        <p class="font-semibold mb-1">Share this link with the other party</p>
        <p class="text-sm text-neutral-400 mb-3">They open it to review and join — with their account or as a guest.</p>
        <div class="flex gap-2"><input readonly value={shareUrl} class="input flex-1 text-sm font-mono" /><button type="button" class="btn !w-auto px-4" on:click={() => copy(shareUrl, 's')}>{copied === 's' ? 'Copied ✓' : 'Copy'}</button></div>
      </div>
    {/if}

    <div class="grid gap-4 lg:grid-cols-[1fr_20rem] items-start">
      <div class="space-y-4">
        <div class="card">
          <div class="grid grid-cols-3 gap-3">
            <div><p class="text-xs text-neutral-400">Amount</p><p class="text-xl font-bold text-emerald-400">${d.amount.toFixed(2)}</p></div>
            <div><p class="text-xs text-neutral-400">Buyer</p><p class="font-medium truncate">{d.buyerName || '—'}{side === 'buyer' ? ' (you)' : ''}</p></div>
            <div><p class="text-xs text-neutral-400">Seller</p><p class="font-medium truncate">{d.sellerName || '—'}{side === 'seller' ? ' (you)' : ''}</p></div>
          </div>
          {#if d.fee > 0}<p class="text-[11px] text-neutral-500 mt-2">Seller receives ${net.toFixed(2)} after ${d.fee.toFixed(2)} fee.</p>{/if}
          <div class="mt-3 rounded-lg bg-sky-500/5 border border-sky-500/20 px-3 py-2 text-sm text-sky-200">{meta.hint}</div>
          {#if d.description}<p class="text-sm text-neutral-300 whitespace-pre-wrap mt-3">{d.description}</p>{/if}
        </div>

        <!-- Chat -->
        <div class="card">
          <div class="flex items-center justify-between mb-3">
            <h2 class="font-semibold">Messages</h2>
            {#if side && data.counterparty}
              <span class="text-[11px] {fmtSeen(data.counterparty.lastSeen) === 'online' ? 'text-emerald-400' : 'text-neutral-500'}">{fmtSeen(data.counterparty.lastSeen)}</span>
            {/if}
          </div>
          <div bind:this={chatBox} class="space-y-2 max-h-72 overflow-y-auto pr-1 mb-3">
            {#each data.messages as m (m.id)}
              {@const mine = isMine(m)}
              <div class="flex items-end gap-2 {mine ? 'justify-end' : 'justify-start'}">
                {#if !mine}
                  {#if m.sender?.avatar}
                    <img src={m.sender.avatar} alt="" class="w-6 h-6 rounded-full object-cover shrink-0" />
                  {:else}
                    <span class="w-6 h-6 rounded-full grid place-items-center text-[9px] font-bold shrink-0 {m.fromAdmin ? 'bg-amber-500/20 text-amber-200' : 'bg-neutral-700 text-neutral-200'}">{m.fromAdmin ? '🛡' : initials(m.senderName)}</span>
                  {/if}
                {/if}
                <div class="max-w-[78%] rounded-2xl px-3 py-2 text-sm {mine ? 'bg-emerald-600 text-white rounded-br-sm' : m.fromAdmin ? 'bg-amber-500/15 text-amber-100 border border-amber-500/30' : 'bg-neutral-800 text-neutral-100 rounded-bl-sm'}">
                  {#if !mine}<p class="text-[10px] opacity-70 mb-0.5">{m.fromAdmin ? '🛡 Support' : m.senderName || 'User'}</p>{/if}
                  <p class="whitespace-pre-wrap break-words">{m.body}</p>
                  {#if mine}
                    {@const t = tickState(m)}
                    <span class="block text-right text-[10px] mt-0.5 leading-none {t === 'read' ? 'text-sky-300' : 'text-white/60'}" title={t}>{t === 'sent' ? '✓' : '✓✓'}</span>
                  {/if}
                </div>
              </div>
            {:else}
              <p class="text-sm text-neutral-500 text-center py-6">No messages yet.</p>
            {/each}
          </div>
          <form method="post" action="?/message" use:enhance={handle()} class="flex items-end gap-2">
            <textarea name="body" bind:value={messageBody} rows="1" maxlength="2000" placeholder="Type a message…" class="input flex-1 resize-none text-sm py-2"
              on:keydown={(ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); ev.currentTarget.form?.requestSubmit(); } }}></textarea>
            <button class="btn !w-auto px-4" disabled={!messageBody.trim()}>Send</button>
          </form>
        </div>
      </div>

      <!-- Action panel -->
      <div class="card lg:sticky lg:top-20 space-y-3">
        <h2 class="font-semibold">Next step</h2>

        {#if d.status === 'PROPOSED'}
          {#if side && side !== d.creatorSide}
            <p class="text-sm text-neutral-300">You were invited to this deal as the <strong>{side}</strong>.</p>
            <form method="post" action="?/accept" use:enhance={handle()}><button class="btn" disabled={busy}>Accept deal</button></form>
            <form method="post" action="?/decline" use:enhance={handle()}><button class="btn !bg-neutral-700 hover:!bg-neutral-600" disabled={busy}>Decline</button></form>
          {:else}
            <p class="text-sm text-neutral-400">Waiting for the other party to {counterpartyJoined ? 'accept' : 'join via your link'}.</p>
            {#if side === d.creatorSide}<form method="post" action="?/cancel" use:enhance={handle()}><button class="btn !bg-neutral-700 hover:!bg-neutral-600" disabled={busy}>Cancel deal</button></form>{/if}
          {/if}

        {:else if d.status === 'ACCEPTED'}
          {#if side === 'buyer'}
            {#if funding}
              <p class="text-sm text-neutral-300">Send the crypto below — confirms automatically.</p>
              {#if qr}<div class="flex justify-center"><div class="rounded-xl bg-white p-2.5"><img src={qr} alt="QR" class="w-40 h-40" /></div></div>{/if}
              <div class="rounded-lg border border-neutral-800 bg-neutral-900/60 divide-y divide-neutral-800 text-sm">
                <div class="flex items-center justify-between px-3 py-2"><span class="text-neutral-400">Send</span><button type="button" class="font-mono text-emerald-300" on:click={() => copy(String(funding.amount), 'a')}>{funding.amount} {funding.currency?.toUpperCase()}</button></div>
                <div class="px-3 py-2"><div class="flex justify-between mb-1"><span class="text-neutral-400">To</span><button type="button" class="text-[10px] text-neutral-500" on:click={() => copy(funding.address, 'd')}>{copied === 'd' ? 'copied ✓' : 'copy'}</button></div><p class="font-mono text-xs break-all text-neutral-200">{funding.address}</p></div>
              </div>
              <p class="text-xs text-amber-400">Waiting for payment…</p>
            {:else}
              <p class="text-sm text-neutral-300">Fund the escrow to start.</p>
              {#if data.viewer.auth === 'account' && data.me}
                <div class="flex gap-1 p-1 bg-neutral-800 rounded-lg text-sm">
                  <button type="button" class="flex-1 px-3 py-1 rounded-md transition {fundMethod === 'balance' ? 'bg-emerald-600 text-white' : 'text-neutral-300'}" on:click={() => (fundMethod = 'balance')}>From balance</button>
                  <button type="button" class="flex-1 px-3 py-1 rounded-md transition {fundMethod === 'crypto' ? 'bg-emerald-600 text-white' : 'text-neutral-300'}" on:click={() => (fundMethod = 'crypto')}>Send crypto</button>
                </div>
              {/if}
              {#if fundMethod === 'balance' && data.viewer.auth === 'account' && data.me}
                <p class="text-xs text-neutral-400">Balance: ${data.me.balance.toFixed(2)}{#if data.me.balance < d.amount} — <a href="/balance" class="text-emerald-400 underline">add funds</a>{/if}</p>
                <form method="post" action="?/fund" use:enhance={handle()}>
                  <input type="hidden" name="method" value="balance" />
                  <button class="btn" disabled={busy || data.me.balance < d.amount}>Fund ${d.amount.toFixed(2)} from balance</button>
                </form>
              {:else}
                <form method="post" action="?/fund" use:enhance={handle()} class="space-y-2">
                  <input type="hidden" name="method" value="crypto" />
                  <CurrencyPicker bind:value={fundCurrency} name="currency" currencies={POPULAR_CURRENCIES} />
                  <button class="btn" disabled={busy}>Fund ${d.amount.toFixed(2)} with crypto</button>
                </form>
              {/if}
            {/if}
          {:else}
            <p class="text-sm text-neutral-400">Waiting for the buyer to fund the escrow.</p>
            {#if side === 'seller' && !d.payoutAddress && data.viewer.auth === 'guest'}
              <form method="post" action="?/setPayout" use:enhance={handle()} class="space-y-2 pt-2 border-t border-neutral-800">
                <p class="text-xs text-neutral-400">Set where you'll be paid:</p>
                <CurrencyPicker bind:value={payoutCurrency} name="currency" currencies={POPULAR_CURRENCIES} />
                <input name="address" placeholder="Payout address" class="input w-full text-sm font-mono" />
                <button class="btn !bg-neutral-700 hover:!bg-neutral-600" disabled={busy}>Save payout address</button>
              </form>
            {/if}
          {/if}
          {#if side === d.creatorSide}<form method="post" action="?/cancel" use:enhance={handle()}><button class="btn !bg-neutral-700 hover:!bg-neutral-600" disabled={busy}>Cancel deal</button></form>{/if}

        {:else if d.status === 'FUNDED' || d.status === 'DELIVERED'}
          {#if side === 'seller'}
            {#if data.viewer.auth === 'guest' && !d.payoutAddress}
              <div class="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 mb-2">Set your payout address to get paid on release.</div>
              <form method="post" action="?/setPayout" use:enhance={handle()} class="space-y-2">
                <CurrencyPicker bind:value={payoutCurrency} name="currency" currencies={POPULAR_CURRENCIES} />
                <input name="address" placeholder="Payout address" value={d.payoutAddress || ''} class="input w-full text-sm font-mono" />
                <button class="btn !bg-neutral-700 hover:!bg-neutral-600" disabled={busy}>Save payout address</button>
              </form>
            {/if}
            {#if d.status === 'FUNDED'}
              <form method="post" action="?/deliver" use:enhance={handle()}><button class="btn" disabled={busy}>Mark as delivered</button></form>
            {:else}
              <p class="text-sm text-neutral-400">Delivered — waiting for the buyer to release.</p>
            {/if}
          {/if}
          {#if side === 'buyer'}
            <p class="text-sm text-neutral-400">When you've received everything, release the funds.</p>
            <form method="post" action="?/release" use:enhance={handle()}><button class="btn" disabled={busy}>Confirm delivery &amp; release</button></form>
          {/if}
          {#if side}
            {#if showDispute}
              <form method="post" action="?/dispute" use:enhance={handle()} class="space-y-2 pt-2 border-t border-neutral-800">
                <textarea name="reason" rows="3" maxlength="500" placeholder="Describe the problem…" class="input w-full resize-none text-sm"></textarea>
                <button class="btn !bg-red-600 hover:!bg-red-700" disabled={busy}>Submit dispute</button>
              </form>
            {:else}
              <button type="button" class="text-xs text-red-400 hover:text-red-300" on:click={() => (showDispute = true)}>Open a dispute</button>
            {/if}
          {/if}

        {:else if d.status === 'DISPUTED'}
          {#if data.isAdmin}
            <p class="text-sm text-neutral-400">Resolve this dispute:</p>
            <form method="post" action="?/resolveRelease" use:enhance={handle()}><button class="btn" disabled={busy}>Release to seller</button></form>
            <form method="post" action="?/resolveRefund" use:enhance={handle()}><button class="btn !bg-neutral-700 hover:!bg-neutral-600" disabled={busy}>Refund buyer</button></form>
          {:else}
            <p class="text-sm text-amber-300">Under admin review. Our team reads the chat to resolve it.</p>
          {/if}
        {:else if d.status === 'COMPLETED'}
          <p class="text-sm text-emerald-300 font-medium">✓ Completed</p>
          {#if side === 'seller'}<p class="text-sm text-neutral-400">Your funds {data.viewer.auth === 'account' ? 'were added to your balance.' : 'have been sent to your payout address.'}</p>{/if}
        {:else}
          <p class="text-sm text-neutral-400">{meta.hint}</p>
        {/if}

        {#if data.isAdmin && ['PROPOSED', 'ACCEPTED', 'FUNDED', 'DELIVERED'].includes(d.status)}
          <div class="pt-3 border-t border-neutral-800">
            <p class="text-[11px] uppercase tracking-wide text-neutral-500 mb-2">Admin</p>
            <form method="post" action="?/adminBlock" use:enhance={handle()}>
              <button class="btn !bg-amber-600 hover:!bg-amber-500" disabled={busy}>🛑 Freeze deal for review</button>
            </form>
            <p class="text-[11px] text-neutral-500 mt-1.5">Freezing pauses the deal and lets you release or refund after reviewing the chat.</p>
          </div>
        {/if}

        {#if !data.me}
          <div class="pt-3 border-t border-neutral-800"><p class="text-xs text-neutral-500">💡 <a href="/auth/register" class="text-emerald-400 hover:text-emerald-300">Create an account</a> to manage all your deals in one place.</p></div>
        {/if}
      </div>
    </div>
  {/if}
</div>
