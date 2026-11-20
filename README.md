# CSS Snippet Descriptions

Add a portable description to a CSS snippet with a header comment:

```css
/* @description: Adds alternating row colors. */

.table tr:nth-child(even) {
  background: var(--background-secondary);
}
```

In **Settings → Appearance → CSS snippets**, the description appears below the snippet name. Select the accessible pencil button beside a snippet toggle to edit it. **Save** updates the CSS file immediately; leave the field blank to remove the description. Cancel makes no changes. The plugin never changes whether a snippet is enabled.

Descriptions are read from the CSS file itself; the plugin does not store plugin data. If you edit a comment outside Obsidian, use **Reload snippets** to refresh the list. Existing leading comments and a leading `@charset` remain in place. Editing updates all matching description comments in the leading header, and clearing removes them all. Descriptions must be one line and cannot contain `*/`.

## Install

Copy `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/css-snippet-descriptions/`, reload Obsidian desktop, and enable **CSS Snippet Descriptions** under **Settings → Community plugins**.

## Local checks

From this directory:

```sh
npm install
npm run typecheck
npm run lint
npm test
npm run build
```
