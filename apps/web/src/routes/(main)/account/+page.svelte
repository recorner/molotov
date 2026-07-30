<script lang="ts">
  import InputWithIcon from '$lib/components/InputWithIcon.svelte';
  import type { PageData } from './$types';
  import { Hash, Key, Lock } from '@steeze-ui/feather-icons';
  import { toast } from '@zerodevx/svelte-toast';
  import toastThemes from '$lib/toastThemes';
  import { enhance } from '$app/forms';
  import qr from 'qrcode';
  import { invalidate, invalidateAll } from '$app/navigation';

  export let data: PageData;
  let twofaData = {} as any;
  let qrCode = '';
  let avatarUploading = false;

  async function uploadAvatar(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    avatarUploading = true;
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/avatar', { method: 'POST', body: fd });
      const json = await res.json();
      if (res.ok) {
        toast.push('Profile photo updated', { theme: toastThemes.success });
        await invalidateAll();
      } else {
        toast.push(json.error || 'Upload failed', { theme: toastThemes.error });
      }
    } catch {
      toast.push('Upload failed', { theme: toastThemes.error });
    } finally {
      avatarUploading = false;
      input.value = '';
    }
  }
  $: twofaData?.uri &&
    qr
      .toDataURL(twofaData?.uri, {
        color: {
          dark: '#fff',
          light: '#00000000',
        },
      })
      .then((res) => (qrCode = res));
</script>

<!-- Profile photo -->
<div class="card h-max mb-4">
  <h2 class="font-bold mb-3">Profile photo</h2>
  <div class="flex items-center gap-4">
    {#if data.user.avatar}
      <img src={data.user.avatar} alt="avatar" class="w-16 h-16 rounded-full object-cover border border-neutral-700" />
    {:else}
      <div class="w-16 h-16 rounded-full grid place-items-center bg-emerald-500/15 text-emerald-300 text-xl font-bold">{data.user.username.slice(0, 2).toUpperCase()}</div>
    {/if}
    <div>
      <label class="btn !w-auto px-4 inline-flex items-center gap-2 cursor-pointer {avatarUploading ? 'opacity-60' : ''}">
        {avatarUploading ? 'Uploading…' : 'Upload photo'}
        <input type="file" accept="image/*" class="hidden" on:change={uploadAvatar} disabled={avatarUploading} />
      </label>
      <p class="text-xs text-neutral-500 mt-1.5">Shown next to your messages.</p>
    </div>
  </div>
</div>

<div class="grid md:grid-cols-2 gap-4">
  <div class="card h-max">
    <h2 class="font-bold mb-2">Change Password</h2>
    <form
      class="space-y-2"
      method="post"
      action="?/updatePassword"
      use:enhance={({ formElement }) =>
        ({ result }) => {
          if (result.type == 'success') {
            toast.push('Password updated', {
              theme: toastThemes.success,
            });
          } else if (result.type == 'error') {
            toast.push(result.error.message, {
              theme: toastThemes.error,
            });
          } else if (result.type == 'failure') {
            const errorMessages = {
              password: 'Incorrect password',
              confirm: 'Passwords do not match',
            };
            toast.push(
              errorMessages[result.data.error as keyof typeof errorMessages] || 'An error occurred',
              {
                theme: toastThemes.error,
              }
            );
          }

          formElement.reset();
        }}
    >
      <InputWithIcon type="password" placeholder="Current Password" icon={Lock} name="current" />
      <InputWithIcon type="password" placeholder="New Password" icon={Lock} name="new" />
      <InputWithIcon type="password" placeholder="Confirm New Password" icon={Lock} name="confirm" />
      <button class="btn">Save</button>
    </form>
  </div>
  <div class="card h-max">
    <h2 class="font-bold mb-2">Two-Factor Authentication</h2>
    {#if twofaData?.secret}
      <form
        action="?/enable2FA"
        class="space-y-2"
        method="post"
        use:enhance={() =>
          ({ result }) => {
            if (result.type == 'success') {
              toast.push('2FA enabled', {
                theme: toastThemes.success,
              });
            } else if (result.type == 'error') {
              toast.push(result.error.message, {
                theme: toastThemes.error,
              });
            } else if (result.type == 'failure') {
              const errorMessages = {
                code: 'Invalid code',
                missing: 'Missing code',
              };
              toast.push(
                errorMessages[result.data.error as keyof typeof errorMessages] || 'An error occurred',
                {
                  theme: toastThemes.error,
                }
              );
            }

            invalidateAll();
            twofaData = {};
          }}
      >
        <img src={qrCode} alt="" />
        <InputWithIcon icon={Key} type="text" placeholder="Secret" value={twofaData.secret} disabled />
        <input type="hidden" name="secret" value={twofaData.secret} />
        <InputWithIcon icon={Hash} type="text" placeholder="Code" name="code" />
        <button class="btn">Enable</button>
      </form>
    {:else if data.twoFactorEnabled}
      <form
        action="?/disable2FA"
        method="post"
        use:enhance={() =>
          ({ result }) => {
            if (result.type == 'success') {
              toast.push('2FA disabled', {
                theme: toastThemes.success,
              });
            } else if (result.type == 'error') {
              toast.push(result.error.message, {
                theme: toastThemes.error,
              });
            }

            invalidateAll();
          }}
      >
        <button class="btn">Disable 2FA</button>
      </form>
    {:else}
      <button
        on:click={() =>
          fetch('/account/generate2FA')
            .then((res) => res.json())
            .then((res) => (twofaData = res))}
        class="btn"
      >
        Enable 2FA
      </button>
    {/if}
  </div>
</div>
