const express = require('express');

const app = express();

app.get('/', (req, res) => {
  res.type('text').send('Server is running');
});

app.get('/hello', (req, res) => {
  res.type('text').send('Hello Mihnea');
});

app.get('/status', (req, res) => {
  res.json({ status: 'ok' });
});

app.use((req, res) => {
  res.status(404).type('text').send('Not found');
});

app.listen(3000, () => {
  console.log('Server listening on port 3000');
});
