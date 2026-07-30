<div
  class="flex gap-2 items-center bg-neutral-800 border border-neutral-700 rounded-lg focus-within:border-neutral-600 transition"
>
  <img src={`/auth/captcha.png?cache=` + Math.floor(Math.random() * 1000000)} alt="" class="h-12" />
  <input
    type="text"
    name="captcha"
    placeholder="Enter the captcha"
    required
    class="w-full bg-transparent text-neutral-100 placeholder:text-neutral-400 text-sm py-2"
  />
</div>
