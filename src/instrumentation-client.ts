// Next.js runs this synchronously before React hydrates the document.
// Some browser extensions mark server-rendered elements with this attribute,
// including Next.js's metadata wrapper. Remove only that foreign marker so
// React can still report genuine mismatches in application attributes.
const marker = "bis_skin_checked";
function clean(root: ParentNode) {
  if (root instanceof Element && root.hasAttribute(marker)) {
    root.removeAttribute(marker);
  }
  root.querySelectorAll(`[${marker}]`).forEach((element) => {
    element.removeAttribute(marker);
  });
}

clean(document);
// The extension can also scan while React's chunks are loading. Watch only
// its marker and newly inserted HTML until the application has hydrated.
const observer = new MutationObserver((records) => {
  for (const record of records) {
    if (record.type === "attributes") {
      const element = record.target as Element;
      if (element.hasAttribute(marker)) element.removeAttribute(marker);
    } else {
      record.addedNodes.forEach((node) => {
        if (node instanceof Element) clean(node);
      });
    }
  }
});
observer.observe(document.documentElement, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: [marker],
});
window.addEventListener("piano:hydrated", () => observer.disconnect(), { once: true });
