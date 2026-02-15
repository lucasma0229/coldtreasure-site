(async function () {
  const nodes = Array.from(document.querySelectorAll('[data-include]'));

  await Promise.all(
    nodes.map(async (el) => {
      const url = el.getAttribute('data-include');
      if (!url) return;

      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error('Failed to load: ' + url);
        el.innerHTML = await res.text();
      } catch (err) {
        console.error(err);
        el.innerHTML = '<!-- include error: ' + url + ' -->';
      }
    })
  );

  document.dispatchEvent(new Event('modules:loaded'));
})();
