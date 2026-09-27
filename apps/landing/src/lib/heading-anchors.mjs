/**
 * Adds a "#" link after every section heading in the docs, pointing at the
 * heading's own id, so a reader can link a friend straight to "Keep it
 * floating, under your bar" instead of to the top of a long page.
 *
 * A rehype plugin, run at build time on the Markdown's HTML: the ids already
 * exist (Astro adds them); this only makes them reachable.
 */
const LEVELS = new Set(["h2", "h3"]);

export default function headingAnchors() {
  return (tree) => {
    const visit = (node) => {
      if (node.type === "element" && LEVELS.has(node.tagName) && node.properties?.id) {
        node.children.push({
          type: "element",
          tagName: "a",
          properties: {
            className: ["heading-anchor"],
            href: `#${node.properties.id}`,
            ariaLabel: "Link to this section",
          },
          children: [{ type: "text", value: "#" }],
        });
        return;
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}
