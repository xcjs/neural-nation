export default defineNuxtPlugin(() => {
  const { umami } = useRuntimeConfig().public;

  if (!umami.domain || !umami.websiteId)
    return;

  useHead({
    script: [
      {
        'src': `https://${umami.domain}/script.js`,
        'defer': true,
        'data-website-id': umami.websiteId,
      },
    ],
  });
});
