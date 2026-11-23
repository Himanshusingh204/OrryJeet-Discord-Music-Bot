const http = require('node:http');
const { getSoundsForGuild } = require('./sounds');
const { getQueue } = require('./music');

let server = null;

function startDashboard(client) {
  if (server || process.env.DASHBOARD_ENABLED === 'false') return;

  const port = Number(process.env.DASHBOARD_PORT ?? 3000);
  server = http.createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === '/api/guilds') {
      sendJson(response, client.guilds.cache.map((guild) => ({ id: guild.id, name: guild.name })));
      return;
    }

    if (url.pathname.startsWith('/api/guilds/')) {
      const guildId = url.pathname.split('/')[3];
      const queue = getQueue(guildId);
      sendJson(response, {
        sounds: getSoundsForGuild(guildId),
        player: {
          current: queue?.current ?? null,
          upcoming: queue?.tracks ?? [],
          volume: queue?.volume ?? 0.8,
          loop: queue?.loop ?? 'off'
        }
      });
      return;
    }

    response.writeHead(200, { 'content-type': 'text/html; charset=utf8' });
    response.end(pageHtml());
  });

  server.listen(port, () => {
    console.log(`Dashboard running at http://localhost:${port}`);
  });
}

function sendJson(response, data) {
  response.writeHead(200, { 'content-type': 'application/json; charset=utf8' });
  response.end(JSON.stringify(data));
}

function pageHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Music Bot Dashboard</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #101418; color: #eef2f4; }
    header { padding: 18px 24px; border-bottom: 1px solid #29323a; display: flex; gap: 14px; align-items: center; }
    main { padding: 24px; display: grid; gap: 18px; grid-template-columns: 320px 1fr; }
    select, input { background: #182028; color: #eef2f4; border: 1px solid #384652; border-radius: 6px; padding: 10px; }
    section { border: 1px solid #29323a; border-radius: 8px; padding: 16px; background: #151b21; }
    .sound { padding: 10px 0; border-bottom: 1px solid #29323a; }
    .muted { color: #9aa7b0; font-size: 13px; }
    @media (max-width: 800px) { main { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <strong>Music Bot Dashboard</strong>
    <select id="guild"></select>
    <input id="search" placeholder="Search sounds">
  </header>
  <main>
    <section>
      <h2>Player</h2>
      <div id="player"></div>
    </section>
    <section>
      <h2>Soundboard</h2>
      <div id="sounds"></div>
    </section>
  </main>
  <script>
    const guildSelect = document.querySelector('#guild');
    const searchInput = document.querySelector('#search');
    let state = { sounds: [], player: {} };

    async function loadGuilds() {
      const guilds = await fetch('/api/guilds').then((r) => r.json());
      guildSelect.innerHTML = guilds.map((guild) => '<option value="' + guild.id + '">' + guild.name + '</option>').join('');
      await refresh();
    }

    async function refresh() {
      if (!guildSelect.value) return;
      state = await fetch('/api/guilds/' + guildSelect.value).then((r) => r.json());
      render();
    }

    function render() {
      const current = state.player.current;
      document.querySelector('#player').innerHTML = current
        ? '<p><strong>' + current.title + '</strong></p><p class="muted">Loop ' + state.player.loop + ' - Volume ' + Math.round(state.player.volume * 100) + '% - Queue ' + state.player.upcoming.length + '</p>'
        : '<p class="muted">Nothing is playing.</p>';

      const query = searchInput.value.toLowerCase();
      document.querySelector('#sounds').innerHTML = state.sounds
        .filter((sound) => sound.name.toLowerCase().includes(query) || (sound.url || '').toLowerCase().includes(query))
        .map((sound) => '<div class="sound"><strong>' + sound.name + '</strong><div class="muted">' + sound.category + ' - ' + (sound.sourceType || 'url') + '</div></div>')
        .join('') || '<p class="muted">No sounds found.</p>';
    }

    guildSelect.addEventListener('change', refresh);
    searchInput.addEventListener('input', render);
    loadGuilds();
    setInterval(refresh, 5000);
  </script>
</body>
</html>`;
}

module.exports = {
  startDashboard
};
