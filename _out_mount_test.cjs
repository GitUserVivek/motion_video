const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const root = '/tmp/outtest/output';
const relativePath = (fullPath, prefix) => decodeURIComponent(fullPath.slice(prefix.length)).replace(/^\/+/, '');
const listDirectory = (prefix) => (req, res) => {
  const target = path.resolve(root, relativePath(req.path, prefix));
  const inside = target === root || target.startsWith(root + path.sep);
  if (!inside || !fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    res.status(404).type('text/plain; charset=utf-8').send('Not found\n');
    return;
  }
  const entries = fs.readdirSync(target, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => e.name + (e.isDirectory() ? '/' : ''));
  res.type('text/plain; charset=utf-8').send(entries.length > 0 ? entries.join('\n') + '\n' : '');
};
for (const prefix of ['/output', '/api/output']) {
  app.use(prefix, express.static(root, { index: false, dotfiles: 'ignore' }));
  app.get([prefix, `${prefix}/*`], listDirectory(prefix));
}
app.listen(4601, () => console.log('listening'));
