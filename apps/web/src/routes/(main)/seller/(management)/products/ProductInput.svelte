<script lang="ts">
  import InputWithIcon from '$lib/components/InputWithIcon.svelte';
  import toastThemes from '$lib/toastThemes';
  import { Bold, DollarSign, HelpCircle, Image, Italic, Type, Underline, Package, Tag, FileText, Layers } from '@steeze-ui/feather-icons';
  import { Icon } from '@steeze-ui/svelte-icon';
  import { toast } from '@zerodevx/svelte-toast';
  import Select from '$lib/components/Select.svelte';

  export let categories: any;
  export let product: any = null;
  let textarea: HTMLTextAreaElement;
  let imageUploading = false;

  let selectedCategory = product?.category?.id ? String(product.category.id) : '';
  let selectedType = product?.type ?? '';
  $: categoryOptions = (categories || []).map((c: any) => ({ value: String(c.id), label: c.name }));
  const typeOptions = [
    { value: 'DOWNLOAD', label: 'Download — digital files delivered instantly' },
    { value: 'LICENSE', label: 'License — individual keys (one per customer)' },
    { value: 'SERVICE', label: 'Service — delivered/fulfilled after purchase' },
  ];

  const wrapSelection = (textarea: HTMLTextAreaElement, prefix: string, suffix: string) => {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    textarea.value = text.substring(0, start) + prefix + text.substring(start, end) + suffix + text.substring(end);
    textarea.selectionStart = textarea.selectionEnd =
      end + (end == start ? prefix.length : prefix.length + suffix.length);
    textarea.focus();
  };

  let previewImage = product?.image ?? '';
  let previewUploading = false;

  const handlePreviewUpload = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    previewUploading = true;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch('/seller/products/image', { method: 'POST', body: formData });
      const result = await response.json();
      if (result.image) {
        previewImage = result.image;
        toast.push('Preview image set', { theme: toastThemes.success });
      } else {
        toast.push(result.error || 'Failed to upload image', { theme: toastThemes.error });
      }
    } catch {
      toast.push('Failed to upload image', { theme: toastThemes.error });
    } finally {
      previewUploading = false;
      input.value = '';
    }
  };

  const handleImageUpload = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    imageUploading = true;
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch('/seller/products/image', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      if (result.image) {
        wrapSelection(textarea, `![Image](`, `${result.image})`);
        toast.push('Image uploaded', { theme: toastThemes.success });
      } else {
        toast.push(result.error || 'Failed to upload image', { theme: toastThemes.error });
      }
    } catch (err) {
      toast.push('Failed to upload image', { theme: toastThemes.error });
    } finally {
      imageUploading = false;
      input.value = '';
    }
  };
</script>

<div class="space-y-6">
  <!-- Preview image -->
  <div class="space-y-2">
    <span class="block text-sm font-medium text-neutral-300">Preview image</span>
    <input type="hidden" name="image" value={previewImage} />
    <div class="flex items-center gap-4">
      <div class="w-28 h-28 rounded-xl border border-neutral-700 bg-neutral-900 overflow-hidden grid place-items-center shrink-0">
        {#if previewImage}
          <img src={previewImage} alt="Preview" class="w-full h-full object-cover" />
        {:else}
          <Icon src={Image} class="w-8 h-8 text-neutral-600" />
        {/if}
      </div>
      <div class="min-w-0">
        <div class="flex flex-wrap gap-2">
          <label class="btn !w-auto px-4 cursor-pointer {previewUploading ? 'opacity-60 pointer-events-none' : ''}">
            {previewUploading ? 'Uploading…' : previewImage ? 'Replace image' : 'Upload image'}
            <input type="file" accept="image/*" class="hidden" on:change={handlePreviewUpload} disabled={previewUploading} />
          </label>
          {#if previewImage}
            <button type="button" class="px-4 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800 text-sm" on:click={() => (previewImage = '')}>Remove</button>
          {/if}
        </div>
        <p class="text-xs text-neutral-500 mt-2">Shown on the storefront card and product page. Square or 4:3 works best.</p>
      </div>
    </div>
  </div>

  <!-- Basic Information -->
  <div class="space-y-4">
    <div class="flex items-center gap-2 mb-4">
      <Icon src={Package} class="w-5 h-5 text-emerald-400" />
      <h3 class="text-lg font-semibold text-white">Basic Information</h3>
    </div>

    <div class="grid md:grid-cols-2 gap-4">
      <div class="space-y-2">
        <label for="product-name" class="block text-sm font-medium text-neutral-300">Product Name *</label>
        <InputWithIcon icon={Type} placeholder="Enter product name" name="name" value={product?.name || ''} maxlength="60" id="product-name" />
        <p class="text-xs text-neutral-500">A clear, descriptive name for your product</p>
      </div>
      
      <div class="space-y-2">
        <label for="product-price" class="block text-sm font-medium text-neutral-300">Price *</label>
        <InputWithIcon
          icon={DollarSign}
          placeholder="0.00"
          name="price"
          type="number"
          step="0.01"
          min="0"
          value={product?.price || ''}
          id="product-price"
        />
        <p class="text-xs text-neutral-500">Set your product price in USD</p>
      </div>
    </div>

    <div class="space-y-2">
      <label for="product-category" class="block text-sm font-medium text-neutral-300">Category *</label>
      <Select id="product-category" name="category" bind:value={selectedCategory} placeholder="Select a category" options={categoryOptions} />
      <p class="text-xs text-neutral-500">Choose the most relevant category for your product</p>
    </div>

    <div class="space-y-2">
      <label for="product-short-desc" class="block text-sm font-medium text-neutral-300">Short Description *</label>
      <div class="relative">
        <Icon src={FileText} class="absolute left-3 top-3 w-4 h-4 text-neutral-400" />
        <textarea
          id="product-short-desc"
          class="input pl-10 w-full resize-none"
          name="shortDesc"
          rows="2"
          maxlength="100"
          placeholder="A brief description that appears in search results..."
          value={product?.shortDesc || ''}
        ></textarea>
      </div>
      <p class="text-xs text-neutral-500">Keep it concise - this appears in product listings (max 100 chars)</p>
    </div>
  </div>

  <!-- Product Description -->
  <div class="space-y-4">
    <div class="flex items-center gap-2 mb-4">
      <Icon src={FileText} class="w-5 h-5 text-green-400" />
      <h3 class="text-lg font-semibold text-white">Detailed Description</h3>
    </div>
    
    <!-- Rich Text Editor Toolbar -->
    <div class="border border-neutral-700 rounded-lg overflow-hidden">
      <div class="flex items-center gap-1 p-3 bg-neutral-800 border-b border-neutral-700">
        <span class="text-xs text-neutral-400 mr-2">Format:</span>
        <button 
          class="p-2 rounded hover:bg-neutral-700 transition-colors group" 
          type="button" 
          on:click={() => wrapSelection(textarea, '**', '**')}
          title="Bold"
        >
          <Icon src={Bold} class="w-4 h-4 text-neutral-400 group-hover:text-white" />
        </button>
        <button 
          class="p-2 rounded hover:bg-neutral-700 transition-colors group" 
          type="button" 
          on:click={() => wrapSelection(textarea, '*', '*')}
          title="Italic"
        >
          <Icon src={Italic} class="w-4 h-4 text-neutral-400 group-hover:text-white" />
        </button>
        <button 
          class="p-2 rounded hover:bg-neutral-700 transition-colors group" 
          type="button" 
          on:click={() => wrapSelection(textarea, '__', '__')}
          title="Underline"
        >
          <Icon src={Underline} class="w-4 h-4 text-neutral-400 group-hover:text-white" />
        </button>
        
        <div class="w-px h-6 bg-neutral-600 mx-2"></div>
        
        <label class="p-2 rounded hover:bg-neutral-700 transition-colors cursor-pointer group" title="Upload Image">
          <Icon src={Image} class="w-4 h-4 text-neutral-400 group-hover:text-emerald-400 {imageUploading ? 'animate-spin' : ''}" />
          <input
            type="file"
            name="image"
            class="hidden"
            accept="image/*"
            on:change={handleImageUpload}
            disabled={imageUploading}
          />
        </label>
        
        <span class="text-xs text-neutral-500 ml-2">
          {imageUploading ? 'Uploading...' : 'Supports markdown formatting'}
        </span>
      </div>
      
      <textarea
        bind:this={textarea}
        class="w-full p-4 bg-neutral-850 text-white placeholder-neutral-500 resize-none border-0 focus:ring-0 focus:outline-none"
        name="description"
        rows="8"
        placeholder="Describe your product in detail. You can use **bold**, *italic*, and ![images](url) formatting..."
        value={product?.description || ''}
        maxlength="4096"
      ></textarea>
    </div>
    <p class="text-xs text-neutral-500">Provide comprehensive details about your product. Use markdown for formatting.</p>
  </div>

  <!-- Product Type & Stock -->
  <div class="space-y-4">
    <div class="flex items-center gap-2 mb-4">
      <Icon src={Layers} class="w-5 h-5 text-purple-400" />
      <h3 class="text-lg font-semibold text-white">Product Type & Inventory</h3>
    </div>

    <div class="space-y-4">
      <div class="space-y-2">
        <label for="product-type" class="block text-sm font-medium text-neutral-300">Product type *</label>
        <Select id="product-type" name="type" bind:value={selectedType} placeholder="Select product type" options={typeOptions} />
        <p class="text-xs text-neutral-500">Choose how your product will be delivered to customers</p>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <label for="product-stock" class="block text-sm font-medium text-neutral-300">Stock/Content *</label>
          <div class="group relative">
            <Icon src={HelpCircle} class="w-4 h-4 text-neutral-400 cursor-help" />
            <div class="absolute bottom-6 left-0 w-80 bg-neutral-800 border border-neutral-600 rounded-lg p-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 shadow-xl">
              <h4 class="font-semibold text-white mb-2">Stock Management</h4>
              <div class="space-y-2 text-sm text-neutral-300">
                <p><strong>Download Type:</strong> The entire content will be delivered to every customer. Unlimited stock.</p>
                <p><strong>License Type:</strong> Each line represents one license/key. Only one line per customer. Stock decreases with each sale.</p>
                <p><strong>Service Type:</strong> The content (instructions, booking details, or contact info) is delivered to every customer. Unlimited stock.</p>
              </div>
            </div>
          </div>
        </div>
        
        <textarea 
          id="product-stock"
          class="input w-full font-mono text-sm resize-none" 
          name="stock" 
          rows="6" 
          placeholder="For downloads: Paste your file content, download links, or instructions here...&#10;&#10;For licenses: Enter one license/account per line:&#10;account1:password1&#10;account2:password2&#10;license-key-1&#10;license-key-2"
          value={product?.stock || ''}
        ></textarea>
        <p class="text-xs text-neutral-500">
          <strong>Download:</strong> Content delivered to all customers | 
          <strong>License:</strong> One line per customer (stock limited)
        </p>
      </div>
    </div>
  </div>
</div>

<style>
  textarea:focus {
    outline: none;
    box-shadow: none;
  }
  
  .input:focus-within {
    border-color: rgb(59 130 246);
    box-shadow: 0 0 0 1px rgb(59 130 246 / 0.2);
  }
</style>
