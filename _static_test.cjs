const express = require('express');
const app = express();
app.use(express.json());
app.use('/output', express.static('/tmp/outtest/output', { index: false, dotfiles: 'ignore' }));
const s = app.listen(4599);
module.exports = s;
