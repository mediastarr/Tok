const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.static('public'));

let cache = { videos: [], time: 0 };

// Proxy videos to fix CORS and sound
app.get('/video', async (req, res) => {
  try {
    const url = req.query.u;
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://www.tiktok.com/',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
      }
    });
    res.set('Content-Type', 'video/mp4');
    res.set('Cache-Control', 'public, max-age=3600');
    response.body.pipe(res);
  } catch (e) {
    res.status(500).end();
  }
});

async function scrapeForYou() {
  if (Date.now() - cache.time < 180000 && cache.videos.length > 5) {
    return cache.videos;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
  });

  try {
    await page.goto('https://www.tiktok.com/foryou?lang=en', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    // Scroll 8 times to load more videos
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
      await page.waitForTimeout(2500);
    }

    // Get video IDs from page
    const videoIds = await page.evaluate(() => {
      const ids = new Set();
      document.querySelectorAll('a[href*="/video/"]').forEach(a => {
        const match = a.href.match(/\/video\/(\d+)/);
        if (match) ids.add(match[1]);
      });
      return Array.from(ids).slice(0, 15);
    });

    const videos = [];
    for (const id of videoIds) {
      try {
        // Use TikWM to get permanent URL with sound
        const apiRes = await fetch(`https://www.tikwm.com/api/video/?id=${id}`);
        const data = await apiRes.json();
        if (data?.data?.play) {
          videos.push({
            src: `/video?u=${encodeURIComponent(data.data.play)}`,
            user: '@' + (data.data.author?.unique_id || 'tiktok'),
            cap: data.data.title || '',
            likes: formatNum(data.data.digg_count),
            comments: formatNum(data.data.comment_count)
          });
        }
        await new Promise(r => setTimeout(r, 300)); // rate limit
      } catch {}
    }

    await browser.close();
    cache = { videos, time: Date.now() };
    return videos;

  } catch (e) {
    await browser.close();
    throw e;
  }
}

function formatNum(n) {
  if (!n) return '0';
  return n > 1000000? (n/1000000).toFixed(1)+'M' : n > 1000? (n/1000).toFixed(1)+'K' : n.toString();
}

app.get('/api/foryou', async (req, res) => {
  try {
    const videos = await scrapeForYou();
    res.json(videos);
  } catch (error) {
    res.status(500).json([]);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Fixed scraper on ${PORT}`));
