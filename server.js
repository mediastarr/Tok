const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');

const app = express();
app.use(cors());
app.use(express.static('public'));

let cache = { videos: [], time: 0 };

async function scrapeForYou() {
  // Return cached if fresh (2 minutes)
  if (Date.now() - cache.time < 120000 && cache.videos.length) {
    return cache.videos;
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    viewport: { width: 390, height: 844 }
  });

  const page = await context.newPage();
  const videoData = [];

  // Capture video URLs from network
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('v16-webapp-prime') && url.includes('.mp4')) {
      const cleanUrl = url.split('?')[0];
      if (!videoData.find(v => v.src === cleanUrl)) {
        videoData.push({ src: cleanUrl });
      }
    }
  });

  try {
    await page.goto('https://www.tiktok.com/foryou', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    // Scroll to load videos
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(2000);
    }

    // Get metadata
    const meta = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('[data-e2e="recommend-list-item-container"]').forEach(el => {
        const user = el.querySelector('[data-e2e="video-author-uniqueid"]')?.innerText;
        const desc = el.querySelector('[data-e2e="video-desc"]')?.innerText;
        const likes = el.querySelector('[data-e2e="like-count"]')?.innerText;
        const comments = el.querySelector('[data-e2e="comment-count"]')?.innerText;
        if (user) items.push({ user: '@' + user, cap: desc || '', likes: likes || '0', comments: comments || '0' });
      });
      return items;
    });

    // Combine URLs with metadata
    const videos = videoData.slice(0, 15).map((v, i) => ({
      src: v.src,
      user: meta[i]?.user || '@tiktok',
      cap: meta[i]?.cap || '',
      likes: meta[i]?.likes || '0',
      comments: meta[i]?.comments || '0'
    }));

    await browser.close();
    cache = { videos, time: Date.now() };
    return videos;

  } catch (e) {
    await browser.close();
    throw e;
  }
}

app.get('/api/foryou', async (req, res) => {
  try {
    const videos = await scrapeForYou();
    res.json(videos);
  } catch (error) {
    res.status(500).json({ error: error.message, fallback: true });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
