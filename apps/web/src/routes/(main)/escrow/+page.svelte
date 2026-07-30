<script lang="ts">
  import { enhance } from '$app/forms';
  import { ESCROW_STATUS, ESCROW_TONE_CLASSES, ESCROW_TONE_DOT, ACTIVE_STATUSES } from '$lib/escrow';
  import type { EscrowStatus } from '$lib/escrow';
  import { computeFee } from '$lib/escrow-fee';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { Shield } from '@steeze-ui/feather-icons';
  import AppIcon from '$lib/components/AppIcon.svelte';
  import { ShieldCheck, Share2, Banknote, PackageCheck } from 'lucide-svelte';
  import type { ActionData, PageData } from './$types';

  export let data: PageData;
  export let form: ActionData;

  // ---- guest create state ----
  let role: 'buyer' | 'seller' = 'buyer';
  let amountVal = 0;
  let submitting = false;
  $: fee = data.guest ? computeFee(Number(amountVal) || 0, data.feeConfig) : 0;
  $: net = Math.max(0, (Number(amountVal) || 0) - fee);

  const fmtDate = (d: string | Date) =>
    new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });

  $: rows = data.guest
    ? []
    : data.escrows.map((e) => ({
        ...e,
        role: e.buyerId === data.meId ? 'Buyer' : 'Seller',
        counterparty: e.buyerId === data.meId ? e.seller?.username : e.buyer?.username,
      }));
  $: active = rows.filter((r) => ACTIVE_STATUSES.includes(r.status as EscrowStatus));
  $: past = rows.filter((r) => !ACTIVE_STATUSES.includes(r.status as EscrowStatus));
</script>

<svelte:head><title>Escrow - Sereni</title></svelte:head>

{#if data.guest}
  <!-- Public guest entry -->
  <section class="relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-emerald-600/15 via-neutral-900 to-teal-700/10 p-8 sm:p-12 mb-8 text-center">
    <div class="absolute -right-16 -top-16 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
    <div class="relative">
      <span class="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 mb-4">
        <ShieldCheck class="w-3.5 h-3.5" /> Secure escrow — no account required
      </span>
      <h1 class="text-3xl sm:text-5xl font-montserrat font-bold tracking-tight leading-[1.05]">Trade safely with anyone</h1>
      <p class="text-neutral-300 mt-3 max-w-lg mx-auto text-lg">Create a deal, share the link, and we hold the funds until the buyer confirms delivery.</p>
    </div>
  </section>

  <div class="grid grid-cols-3 gap-3 mb-8 max-w-2xl mx-auto">
    {#each [[Share2, 'Create & share', 'Set terms, get a link'], [Banknote, 'Buyer funds escrow', 'Balance or crypto'], [PackageCheck, 'Release on delivery', 'Funds sent to seller']] as [icon, label, sub], i}
      <div class="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 text-center">
        <div class="w-9 h-9 mx-auto mb-2 grid place-items-center rounded-lg bg-emerald-500/15 text-emerald-300">
          <svelte:component this={icon} class="w-5 h-5" />
        </div>
        <p class="text-sm font-medium">{label}</p>
        <p class="text-[11px] text-neutral-500 mt-0.5">{sub}</p>
      </div>
    {/each}
  </div>

  <form class="card space-y-5 max-w-xl mx-auto" method="post" action="?/guestCreate"
    use:enhance={() => { submitting = true; return async ({ update }) => { submitting = false; await update(); }; }}>
    <div>
      <span class="block text-sm font-medium text-neutral-300 mb-1.5">I am the…</span>
      <div class="grid grid-cols-2 gap-2">
        <button type="button" class="rounded-lg border p-3 text-left transition {role === 'buyer' ? 'border-emerald-500 bg-emerald-500/10' : 'border-neutral-700 hover:border-neutral-600'}" on:click={() => (role = 'buyer')}>
          <p class="font-medium text-sm">Buyer</p><p class="text-xs text-neutral-400">I pay & receive</p>
        </button>
        <button type="button" class="rounded-lg border p-3 text-left transition {role === 'seller' ? 'border-emerald-500 bg-emerald-500/10' : 'border-neutral-700 hover:border-neutral-600'}" on:click={() => (role = 'seller')}>
          <p class="font-medium text-sm">Seller</p><p class="text-xs text-neutral-400">I deliver & get paid</p>
        </button>
      </div>
      <input type="hidden" name="role" value={role} />
    </div>

    <div class="grid sm:grid-cols-2 gap-3">
      <div>
        <label for="yourName" class="block text-sm font-medium text-neutral-300 mb-1.5">Your name</label>
        <input id="yourName" name="yourName" class="input w-full text-sm" placeholder="Jane Doe" />
        {#if form?.error === 'yourName'}<span class="error mt-1">{form.message}</span>{/if}
      </div>
      <div>
        <label for="yourTelegram" class="block text-sm font-medium text-neutral-300 mb-1.5">Your Telegram</label>
        <div class="input"><span class="text-neutral-400">@</span><input id="yourTelegram" name="yourTelegram" class="w-full bg-transparent text-sm focus:outline-none text-neutral-100" placeholder="yourhandle" /></div>
      </div>
    </div>
    <div>
      <label for="yourEmail" class="block text-sm font-medium text-neutral-300 mb-1.5">Your email <span class="text-neutral-600">(optional)</span></label>
      <input id="yourEmail" name="yourEmail" type="email" class="input w-full text-sm" placeholder="you@email.com" />
      {#if form?.error === 'yourEmail'}<span class="error mt-1">{form.message}</span>{/if}
    </div>

    <div class="grid sm:grid-cols-2 gap-3">
      <div>
        <label for="otherName" class="block text-sm font-medium text-neutral-300 mb-1.5">Other party's name <span class="text-neutral-600">(optional)</span></label>
        <input id="otherName" name="otherName" class="input w-full text-sm" placeholder="They can fill on join" />
      </div>
      <div>
        <label for="otherTelegram" class="block text-sm font-medium text-neutral-300 mb-1.5">Their Telegram <span class="text-neutral-600">(optional)</span></label>
        <div class="input"><span class="text-neutral-400">@</span><input id="otherTelegram" name="otherTelegram" class="w-full bg-transparent text-sm focus:outline-none text-neutral-100" placeholder="theirhandle" /></div>
      </div>
    </div>
    <div>
      <label for="otherEmail" class="block text-sm font-medium text-neutral-300 mb-1.5">Their email <span class="text-neutral-600">(optional)</span></label>
      <input id="otherEmail" name="otherEmail" type="email" class="input w-full text-sm" placeholder="them@email.com" />
      {#if form?.error === 'otherEmail'}<span class="error mt-1">{form.message}</span>{/if}
    </div>

    <div>
      <label for="title" class="block text-sm font-medium text-neutral-300 mb-1.5">What's the deal for?</label>
      <input id="title" name="title" maxlength="80" class="input w-full text-sm" placeholder="e.g. Website design, account transfer" />
      {#if form?.error === 'title'}<span class="error mt-1">{form.message}</span>{/if}
    </div>

    <div>
      <label for="amount" class="block text-sm font-medium text-neutral-300 mb-1.5">Amount (USD)</label>
      <div class="input"><span class="text-neutral-400">$</span><input id="amount" name="amount" type="number" min="1" step="0.01" bind:value={amountVal} class="w-full bg-transparent text-sm focus:outline-none text-neutral-100" placeholder="100.00" /></div>
      {#if form?.error === 'amount'}<span class="error mt-1">{form.message}</span>{/if}
      {#if Number(amountVal) > 0}
        <div class="mt-2 rounded-lg bg-neutral-900/60 border border-neutral-800 px-3 py-2 text-xs text-neutral-400 space-y-0.5">
          <div class="flex justify-between"><span>Buyer pays</span><span class="text-neutral-200">${Number(amountVal).toFixed(2)}</span></div>
          <div class="flex justify-between"><span>Escrow fee</span><span class="text-neutral-200">${fee.toFixed(2)}</span></div>
          <div class="flex justify-between font-medium"><span>Seller receives</span><span class="text-emerald-400">${net.toFixed(2)}</span></div>
        </div>
      {/if}
    </div>

    <div>
      <label for="description" class="block text-sm font-medium text-neutral-300 mb-1.5">Terms <span class="text-neutral-600">(optional)</span></label>
      <textarea id="description" name="description" rows="3" maxlength="2000" class="input w-full resize-none text-sm" placeholder="What's being delivered, deadlines, conditions…"></textarea>
    </div>

    <button type="submit" class="btn" disabled={submitting}>{submitting ? 'Creating…' : 'Create deal & get share link'}</button>
    <p class="text-center text-xs text-neutral-500">Have an account? <a href="/auth/login" class="text-emerald-400 hover:text-emerald-300">Sign in</a> to manage all your deals.</p>
  </form>
{:else}
  <!-- Authenticated dashboard -->
  <div class="flex items-center justify-between mb-5">
    <div>
      <h1 class="font-montserrat font-bold text-2xl tracking-tight">Escrow</h1>
      <p class="text-sm text-neutral-400">Safe, held deals between you and another user.</p>
    </div>
    <a href="/escrow/new" class="btn !w-auto px-4">New deal</a>
  </div>

  {#if rows.length === 0}
    <div class="card text-center py-16">
      <div class="w-14 h-14 rounded-full bg-neutral-800 grid place-items-center mx-auto mb-4">
        <Icon src={Shield} class="w-6 h-6 text-neutral-500" />
      </div>
      <p class="font-medium mb-1">No escrow deals yet</p>
      <p class="text-sm text-neutral-400 mb-5 max-w-sm mx-auto">Create a deal with another Sereni user. Funds are held safely until the buyer confirms delivery.</p>
      <a href="/escrow/new" class="btn !w-auto px-5 inline-block mx-auto">Create your first deal</a>
    </div>
  {:else}
    {#each [{ title: 'Active', list: active }, { title: 'History', list: past }] as group}
      {#if group.list.length}
        <h2 class="text-xs font-semibold uppercase tracking-wide text-neutral-500 mt-6 mb-2">{group.title}</h2>
        <div class="card !p-0 overflow-hidden divide-y divide-neutral-800">
          {#each group.list as e (e.id)}
            {@const meta = ESCROW_STATUS[e.status]}
            <a href={`/escrow/${e.publicId}`} class="flex items-center gap-4 px-4 py-3.5 hover:bg-neutral-800/50 transition">
              <span class="grid place-items-center w-10 h-10 rounded-full bg-neutral-800 shrink-0"><span class="w-2 h-2 rounded-full {ESCROW_TONE_DOT[meta.tone]}"></span></span>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-semibold truncate">{e.title}</span>
                  <span class="text-[11px] px-2 py-0.5 rounded-full border shrink-0 {ESCROW_TONE_CLASSES[meta.tone]}">{meta.label}</span>
                </div>
                <p class="text-xs text-neutral-500 truncate">{e.role} · with @{e.counterparty} · {fmtDate(e.createdAt)}</p>
              </div>
              <div class="text-right shrink-0"><div class="font-semibold text-emerald-400">${e.amount.toFixed(2)}</div></div>
              <span class="text-neutral-600">›</span>
            </a>
          {/each}
        </div>
      {/if}
    {/each}
  {/if}
{/if}
