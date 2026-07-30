<script lang="ts">
  import { Image, Percent, Trash, Type } from '@steeze-ui/feather-icons';
  import { Icon } from '@steeze-ui/svelte-icon';
  import SortableList from '$lib/components/SortableList.svelte';
  import type { PageData } from './$types';
  import { toast } from '@zerodevx/svelte-toast';
  import { invalidateAll } from '$app/navigation';
  import toastThemes from '$lib/toastThemes';
  import InputWithIcon from '$lib/components/InputWithIcon.svelte';
  import Select from '$lib/components/Select.svelte';
  import { enhance } from '$app/forms';

  export let data: PageData;
  let addCategoryInput = '';

  let categories = data.categories;

  // Homepage / advertising config (bound so uploads can populate the URL fields).
  let primaryMedia = data.settings?.ad_primary_media ?? '';
  let secondaryMedia = data.settings?.ad_secondary_media ?? '';
  let adPrimaryEnabled = data.settings?.ad_primary_enabled === '1' ? '1' : '0';
  let adPrimaryType = data.settings?.ad_primary_type === 'video' ? 'video' : 'image';
  let adSecondaryEnabled = data.settings?.ad_secondary_enabled === '1' ? '1' : '0';
  let adSecondaryType = data.settings?.ad_secondary_type === 'video' ? 'video' : 'image';
  const enabledOptions = [{ value: '1', label: 'Enabled' }, { value: '0', label: 'Disabled' }];
  const adTypeOptions = [{ value: 'image', label: 'Image' }, { value: 'video', label: 'Video' }];
  let uploadingPrimary = false;
  let uploadingSecondary = false;

  async function uploadMedia(file: File, slot: 'primary' | 'secondary') {
    if (slot === 'primary') uploadingPrimary = true;
    else uploadingSecondary = true;
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/admin/settings/uploadMedia', { method: 'POST', body: fd });
      const result = await res.json();
      if (res.ok && result.url) {
        if (slot === 'primary') primaryMedia = result.url;
        else secondaryMedia = result.url;
        toast.push('Media uploaded', { theme: toastThemes.success });
      } else {
        toast.push(result.error === 'too_large' ? 'File too large (max 25MB)' : 'Upload failed', { theme: toastThemes.error });
      }
    } catch {
      toast.push('Upload failed', { theme: toastThemes.error });
    } finally {
      uploadingPrimary = false;
      uploadingSecondary = false;
    }
  }
</script>

<!-- Escrow fee / platform profit -->
<div class="card h-max mb-4">
  <div class="flex items-center justify-between mb-1">
    <h2 class="font-bold">Escrow fee (platform profit)</h2>
    {#if data.settings?.escrow_revenue}
      <span class="text-sm text-emerald-400 font-semibold">Earned: ${Number(data.settings.escrow_revenue).toFixed(2)}</span>
    {/if}
  </div>
  <p class="text-sm text-neutral-400 mb-4">
    A flat fee on small deals and a percentage on larger ones. Deducted from the seller's payout when a
    deal completes.
  </p>
  <form
    method="post"
    action="?/update"
    use:enhance={() =>
      async ({ result }) => {
        if (result.type === 'success') {
          toast.push('Escrow fee updated', { theme: toastThemes.success });
          await invalidateAll();
        } else {
          toast.push('Failed to update fee', { theme: toastThemes.error });
        }
      }}
    class="grid sm:grid-cols-3 gap-3"
  >
    <div>
      <label for="fee-flat" class="block text-xs text-neutral-400 mb-1">Flat fee (USD)</label>
      <div class="input"><span class="text-neutral-400">$</span>
        <input id="fee-flat" name="escrow_fee_flat" type="number" min="0" step="0.01" value={data.settings?.escrow_fee_flat ?? '5'} class="w-full bg-transparent text-sm focus:outline-none text-neutral-100" />
      </div>
    </div>
    <div>
      <label for="fee-threshold" class="block text-xs text-neutral-400 mb-1">Threshold (USD)</label>
      <div class="input"><span class="text-neutral-400">$</span>
        <input id="fee-threshold" name="escrow_fee_threshold" type="number" min="0" step="1" value={data.settings?.escrow_fee_threshold ?? '100'} class="w-full bg-transparent text-sm focus:outline-none text-neutral-100" />
      </div>
    </div>
    <div>
      <label for="fee-percent" class="block text-xs text-neutral-400 mb-1">Percent at/above (%)</label>
      <div class="input">
        <input id="fee-percent" name="escrow_fee_percent" type="number" min="0" max="100" step="0.1" value={data.settings?.escrow_fee_percent ?? '5'} class="w-full bg-transparent text-sm focus:outline-none text-neutral-100" />
        <span class="text-neutral-400">%</span>
      </div>
    </div>
    <div class="sm:col-span-3">
      <button class="btn !w-auto px-5">Save fee settings</button>
    </div>
  </form>
</div>

<!-- Support / Telegram link -->
<div class="card h-max mb-4">
  <h2 class="font-bold mb-1">Support &amp; links</h2>
  <p class="text-sm text-neutral-400 mb-4">The Telegram support handle shown in the nav and menus.</p>
  <form
    method="post"
    action="?/update"
    use:enhance={() =>
      async ({ result }) => {
        if (result.type === 'success') { toast.push('Saved', { theme: toastThemes.success }); await invalidateAll(); }
        else toast.push('Failed to save', { theme: toastThemes.error });
      }}
    class="flex flex-col sm:flex-row gap-3 sm:items-end"
  >
    <div class="flex-1">
      <label for="tg-support" class="block text-xs text-neutral-400 mb-1">Telegram support handle</label>
      <div class="input"><span class="text-neutral-400">@</span>
        <input id="tg-support" name="telegram_support" value={(data.settings?.telegram_support ?? '').replace(/^@/, '')} placeholder="serenisupport" class="w-full bg-transparent text-sm focus:outline-none text-neutral-100" />
      </div>
    </div>
    <button class="btn !w-auto px-5">Save</button>
  </form>
</div>

<!-- Homepage showcase & advertising -->
<div class="card h-max mb-4">
  <h2 class="font-bold mb-1">Homepage & advertising</h2>
  <p class="text-sm text-neutral-400 mb-4">Control the marketplace hero and the homepage ad slots. Ads accept an image, a direct video file, or a YouTube/Vimeo link.</p>
  <form
    method="post"
    action="?/update"
    use:enhance={() =>
      async ({ result }) => {
        if (result.type === 'success') { toast.push('Homepage settings saved', { theme: toastThemes.success }); await invalidateAll(); }
        else toast.push('Failed to save', { theme: toastThemes.error });
      }}
    class="space-y-5"
  >
    <!-- Hero -->
    <div>
      <h3 class="text-sm font-semibold text-emerald-400 mb-2">Hero banner</h3>
      <div class="grid sm:grid-cols-2 gap-3">
        <div>
          <label for="hero-title" class="block text-xs text-neutral-400 mb-1">Title</label>
          <input id="hero-title" name="home_hero_title" value={data.settings?.home_hero_title ?? ''} placeholder="Everything digital, delivered instantly" class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-600/60" />
        </div>
        <div>
          <label for="hero-sub" class="block text-xs text-neutral-400 mb-1">Subtitle</label>
          <input id="hero-sub" name="home_hero_subtitle" value={data.settings?.home_hero_subtitle ?? ''} placeholder="Buy and sell digital products…" class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-600/60" />
        </div>
        <div>
          <label for="hero-cta" class="block text-xs text-neutral-400 mb-1">Button label</label>
          <input id="hero-cta" name="home_hero_cta_label" value={data.settings?.home_hero_cta_label ?? ''} placeholder="Browse marketplace" class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-600/60" />
        </div>
        <div>
          <label for="hero-link" class="block text-xs text-neutral-400 mb-1">Button link</label>
          <input id="hero-link" name="home_hero_cta_link" value={data.settings?.home_hero_cta_link ?? ''} placeholder="#categories" class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-600/60" />
        </div>
      </div>
    </div>

    <!-- Primary ad -->
    <div class="border-t border-neutral-800 pt-4">
      <h3 class="text-sm font-semibold text-emerald-400 mb-2">Primary ad (top of homepage)</h3>
      <div class="grid sm:grid-cols-2 gap-3">
        <div>
          <label for="ap-enabled" class="block text-xs text-neutral-400 mb-1">Status</label>
          <Select id="ap-enabled" name="ad_primary_enabled" bind:value={adPrimaryEnabled} options={enabledOptions} />
        </div>
        <div>
          <label for="ap-type" class="block text-xs text-neutral-400 mb-1">Type</label>
          <Select id="ap-type" name="ad_primary_type" bind:value={adPrimaryType} options={adTypeOptions} />
        </div>
        <div class="sm:col-span-2">
          <label for="ap-media" class="block text-xs text-neutral-400 mb-1">Media URL</label>
          <div class="flex gap-2">
            <input id="ap-media" name="ad_primary_media" bind:value={primaryMedia} placeholder="https://… or upload →" class="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-600/60" />
            <label class="btn !w-auto px-4 grid place-items-center cursor-pointer whitespace-nowrap {uploadingPrimary ? 'opacity-60 pointer-events-none' : ''}">
              {uploadingPrimary ? 'Uploading…' : 'Upload'}
              <input type="file" accept="image/*,video/*" class="hidden" on:change={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) uploadMedia(f, 'primary'); }} />
            </label>
          </div>
        </div>
        <div>
          <label for="ap-title" class="block text-xs text-neutral-400 mb-1">Caption title</label>
          <input id="ap-title" name="ad_primary_title" value={data.settings?.ad_primary_title ?? ''} class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-600/60" />
        </div>
        <div>
          <label for="ap-caption" class="block text-xs text-neutral-400 mb-1">Caption text</label>
          <input id="ap-caption" name="ad_primary_caption" value={data.settings?.ad_primary_caption ?? ''} class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-600/60" />
        </div>
        <div class="sm:col-span-2">
          <label for="ap-link" class="block text-xs text-neutral-400 mb-1">Click-through link (images only)</label>
          <input id="ap-link" name="ad_primary_link" value={data.settings?.ad_primary_link ?? ''} placeholder="https://…" class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-600/60" />
        </div>
      </div>
    </div>

    <!-- Secondary ad -->
    <div class="border-t border-neutral-800 pt-4">
      <h3 class="text-sm font-semibold text-emerald-400 mb-2">Secondary ad (mid homepage)</h3>
      <div class="grid sm:grid-cols-2 gap-3">
        <div>
          <label for="as-enabled" class="block text-xs text-neutral-400 mb-1">Status</label>
          <Select id="as-enabled" name="ad_secondary_enabled" bind:value={adSecondaryEnabled} options={enabledOptions} />
        </div>
        <div>
          <label for="as-type" class="block text-xs text-neutral-400 mb-1">Type</label>
          <Select id="as-type" name="ad_secondary_type" bind:value={adSecondaryType} options={adTypeOptions} />
        </div>
        <div class="sm:col-span-2">
          <label for="as-media" class="block text-xs text-neutral-400 mb-1">Media URL</label>
          <div class="flex gap-2">
            <input id="as-media" name="ad_secondary_media" bind:value={secondaryMedia} placeholder="https://… or upload →" class="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-600/60" />
            <label class="btn !w-auto px-4 grid place-items-center cursor-pointer whitespace-nowrap {uploadingSecondary ? 'opacity-60 pointer-events-none' : ''}">
              {uploadingSecondary ? 'Uploading…' : 'Upload'}
              <input type="file" accept="image/*,video/*" class="hidden" on:change={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) uploadMedia(f, 'secondary'); }} />
            </label>
          </div>
        </div>
        <div>
          <label for="as-title" class="block text-xs text-neutral-400 mb-1">Caption title</label>
          <input id="as-title" name="ad_secondary_title" value={data.settings?.ad_secondary_title ?? ''} class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-600/60" />
        </div>
        <div>
          <label for="as-caption" class="block text-xs text-neutral-400 mb-1">Caption text</label>
          <input id="as-caption" name="ad_secondary_caption" value={data.settings?.ad_secondary_caption ?? ''} class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-600/60" />
        </div>
        <div class="sm:col-span-2">
          <label for="as-link" class="block text-xs text-neutral-400 mb-1">Click-through link (images only)</label>
          <input id="as-link" name="ad_secondary_link" value={data.settings?.ad_secondary_link ?? ''} placeholder="https://…" class="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-600/60" />
        </div>
      </div>
    </div>

    <button class="btn !w-auto px-5">Save homepage settings</button>
  </form>
</div>

<div class="grid md:grid-cols-2 gap-4">
  <div class="card h-max">
    <div class="flex items-center justify-between mb-2">
      <h2 class="font-bold">Categories</h2>
      <button
        class="btn w-max"
        on:click={async () => {
          try {
            const res = await fetch('/admin/settings/updateCategories', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(categories),
            });
            
            const result = await res.json();
            
            if (res.ok) {
              toast.push('Categories updated successfully', {
                theme: toastThemes.success,
              });
              await invalidateAll();
            } else {
              // Handle specific error about categories with products
              if (result.categoriesWithProducts) {
                const categoryNames = result.categoriesWithProducts
                  .map(cat => `"${cat.name}" (${cat.productCount} products)`)
                  .join(', ');
                toast.push(`Cannot delete categories with products: ${categoryNames}. Please move or delete the products first.`, {
                  theme: toastThemes.error,
                });
              } else {
                toast.push(result.error || 'Failed to update categories', {
                  theme: toastThemes.error,
                });
              }
            }
          } catch (error) {
            toast.push('An error occurred while updating categories', {
              theme: toastThemes.error,
            });
          }
        }}
      >
        Save
      </button>
    </div>
    {#if categories.length === 0}
      <p class="text-neutral-300 text-sm my-5">No categories</p>
    {:else}
      <SortableList
        list={categories}
        key="id"
        let:item
        on:sort={(ev) => (categories = ev.detail.map((item, i) => ({ ...item, order: i + 1 })))}
      >
        <div
          class="span px-3 py-2 hover:bg-neutral-800 focus:bg-neutral-800 rounded-lg flex justify-between items-center"
        >
          <input
            type="text"
            class="bg-transparent w-full"
            value={item.name}
            on:change={(e) => {
              categories = categories.map((category) => {
                if (category.id === item.id) {
                  return { ...category, name: (e.target as HTMLInputElement).value };
                }
                return category;
              });
            }}
          />
          <div class="flex gap-2">
            <label class="hover:text-emerald-400 transition">
              <input
                type="file"
                name="image"
                class="hidden"
                on:change={(e) => {
                  const formData = new FormData();
                  formData.append('id', item.id);
                  formData.append('image', (e.target as HTMLInputElement).files![0]);
                  fetch('/admin/settings/updateCategory', {
                    method: 'POST',
                    body: formData,
                  }).then((res) => {
                    if (res.ok) {
                      toast.push('Category image updated', {
                        theme: toastThemes.success,
                      });
                      invalidateAll();
                    }
                  });
                }}
              />
              <Icon src={Image} class="w-5 h-5" />
            </label>
            <button
              class="hover:text-red-400 transition"
              on:click={() => {
                categories = categories.filter((category) => category.id !== item.id);
              }}
            >
              <Icon src={Trash} class="w-5 h-5" />
            </button>
          </div>
        </div>
      </SortableList>
    {/if}
    <form
      class="mt-2 flex items-center"
      on:submit|preventDefault={() => {
        categories = [
          ...categories,
          {
            id: (Math.abs(categories.sort((a, b) => a.id - b.id).at(0)?.id || 0) + 1) * -1,
            name: addCategoryInput,
            image: null,
            order: categories.length + 1,
          },
        ];
        addCategoryInput = '';
      }}
    >
      <input
        class="px-3 py-2 w-full bg-transparent text-neutral-100 placeholder:text-neutral-400 text-sm bg-neutral-800 border border-neutral-700 rounded-lg focus:border-neutral-600 transition rounded-r-none border-r-0"
        placeholder="Add a category"
        bind:value={addCategoryInput}
      />
      <button class="btn w-max rounded-l-none border-emerald-500 border border-l-0">Add</button>
    </form>
  </div>
  <div class="grid gap-4 h-max">
    <form
      class="card h-max"
      method="post"
      action="?/update"
      use:enhance={() =>
        async ({ result }) => {
          if (result.type === 'success') {
            toast.push('Settings updated', {
              theme: toastThemes.success,
            });
            return;
          } else {
            toast.push('Error updating settings', {
              theme: toastThemes.error,
            });
          }
          await invalidateAll();
        }}
    >
      <h2 class="font-bold mb-2">Settings</h2>
      <div class="space-y-2">
        <InputWithIcon
          icon={Percent}
          placeholder="Platform fee"
          type="number"
          min="1"
          max="99"
          name="fee"
          value={data.settings['fee']}
        />
        <button class="btn">Save</button>
      </div>
    </form>
    <form
      action="?/announce"
      method="post"
      class="card h-max"
      use:enhance={({ formElement }) =>
        async ({ result }) => {
          if (result.type === 'success') {
            toast.push('Announcement posted', {
              theme: toastThemes.success,
            });
            formElement.reset();
            return;
          } else {
            toast.push('Error posting announcement', {
              theme: toastThemes.error,
            });
          }
        }}
    >
      <h2 class="font-bold">Announce</h2>
      <p class="text-sm text-neutral-300 mb-2">Post an announcement visible to all members</p>
      <div class="space-y-2">
        <InputWithIcon icon={Type} placeholder="Title" name="title" />
        <textarea class="input w-full" placeholder="Announcement" name="message"></textarea>
        <button class="btn">Post</button>
      </div>
    </form>
  </div>
</div>
