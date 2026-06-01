const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.static('public'));

// Proxy to fix sound and CORS
app.get('/video', async (req, res) => {
  try {
    const videoUrl = decodeURIComponent(req.query.u);
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        'Referer': 'https://www.tiktok.com/'
      }
    });
    
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=7200');
    
    response.body.pipe(res);
  } catch (err) {
    res.status(500).end();
  }
});

// Real For You feed - 20 videos
app.get('/api/foryou', async (req, res) => {
  try {
    const response = await fetch('https://www.tikwm.com/api/feed/list?region=US&count=20', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const data = await response.json();
    
    const videos = data.data.map(v => ({
      src: `/video?u=${encodeURIComponent(v.play)}`,
      user: '@' + v.author.unique_id,
      cap: v.title || '',
      likes: format(v.digg_count),
      comments: format(v.comment_count)
    }));
    
    res.json(videos);
  } catch (err) {
    res.json([]);
  }
});

function format(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n/1000).toFixed(1) + 'K';
  return n.toString();
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Running on port', PORT));
