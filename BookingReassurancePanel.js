/* Use the page's existing division branding; do not introduce regional routing/configuration. */
(() => {
  const name = document.querySelector('.brand small')?.textContent.trim();
  if (name) document.querySelectorAll('[data-reassurance-location]').forEach(node => {
    node.textContent = 'Local, trusted care in ' + name;
  });
})();
