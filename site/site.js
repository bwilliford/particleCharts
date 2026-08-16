/* Particle Charts — landing page behaviour.
   Everything here is a consumer of the public API; nothing reaches inside. */

(function () {
  'use strict';

  var PC = window.ParticleCharts;
  if (!PC) {
    console.error('Particle Charts failed to load. Run `npm run build` first.');
    return;
  }

  /* Neon teal is the house colour; violet is the one other hue on the page.
     The pair clears CVD separation (worst deltaE 23.7) and contrast (>= 3:1) on
     this surface — teal sits above the usual lightness band, which is the point
     of a neon. */
  var TEAL = '#2ff0d6';
  var VIOLET = '#7c4dff';
  /* Categorical slice colours. Every hue keeps one channel well below 255, so
     additive stacking brightens it without collapsing it to white — which is
     what happens to any colour whose channels are all high. Ordering validated
     for colour-vision separation (worst adjacent deltaE 16.0, normal-vision
     23.6, all >= 3:1 on this surface). */
  var SLICES = ['#2ff0d6', '#7c4dff', '#ffb020', '#ff4d6d', '#9ae62f'];

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var HERO_DATA = [18, 24, 21, 33, 38, 34, 46, 52, 49, 61, 68, 74];

  var TRAFFIC = {
    labels: ['Direct', 'Search', 'Social', 'Referral', 'Email'],
    values: [4820, 3140, 1760, 980, 540]
  };

  // ------------------------------------------------------------- charts ----

  /* Every chart on this page is collected here so you can poke at them from
     the devtools console: demoCharts[0].setOptions({ particleTrail: 0.7 }) */
  var demoCharts = (window.demoCharts = []);
  function track(chart) { demoCharts.push(chart); return chart; }

  var hero = track(new PC.ParticleChart('#hero-chart', {
    type: 'area',
    data: { labels: MONTHS, name: 'Revenue', values: HERO_DATA },
    particleColor: TEAL,
    particleBloom: 0.4,
    particleJitter: 1.4,
    lineWidth: 3.6,
    showLegend: false,
    valueFormat: function (v) { return '$' + v + 'k'; },
    axis: { ticks: 4, gridColor: 'rgba(255,255,255,0.05)' }
  }));

  document.getElementById('hero-caption').textContent =
    'steady growth, smoothed with a monotone curve \u00b7 ' +
    hero.field.count.toLocaleString() + ' particles';

  track(new PC.ParticleChart('#demo-line', {
    type: 'line',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      series: [
        { name: 'This week', data: [32, 41, 38, 55, 49, 62, 58], color: TEAL },
        { name: 'Last week', data: [28, 30, 35, 36, 44, 41, 47], color: VIOLET }
      ]
    },
    particleBloom: 0.35,
    legend: { position: 'top', align: 'start' },
    axis: { ticks: 4 }
  }));

  track(new PC.ParticleChart('#demo-bar', {
    type: 'bar',
    data: { labels: ['Q1', 'Q2', 'Q3', 'Q4'], name: 'Bookings', values: [42, 58, 51, 73] },
    particleColor: TEAL,
    particleBloom: 0.3,
    showValues: true,
    axis: { ticks: 4 }
  }));

  track(new PC.ParticleChart('#demo-pie', {
    type: 'pie',
    data: TRAFFIC,
    particleColor: SLICES,
    particleBloom: 0.3,
    showValues: true,
    padAngle: 3,
    legendPosition: 'right'
  }));

  track(new PC.ParticleChart('#demo-donut', {
    type: 'donut',
    data: TRAFFIC,
    particleColor: SLICES,
    particleBloom: 0.3,
    showValues: true,
    padAngle: 3,
    legendPosition: 'right'
  }));

  // --------------------------------------------------------- playground ----

  var PLAY_DATA = {
    line: {
      labels: MONTHS.slice(0, 8),
      series: [
        { name: 'Sessions', data: [24, 31, 28, 42, 39, 51, 48, 60], color: TEAL },
        { name: 'Signups', data: [11, 14, 13, 19, 22, 24, 26, 31], color: VIOLET }
      ]
    },
    bar: {
      labels: MONTHS.slice(0, 8),
      series: [
        { name: 'Sessions', data: [24, 31, 28, 42, 39, 51, 48, 60], color: TEAL },
        { name: 'Signups', data: [11, 14, 13, 19, 22, 24, 26, 31], color: VIOLET }
      ]
    },
    pie: TRAFFIC,
    donut: TRAFFIC
  };

  var state = {
    type: 'line',
    density: 15,
    size: 0.5,
    bloom: 0.3,
    jitter: 0.5,
    trail: 0,
    axis: true,
    grid: true,
    legend: true,
    values: false
  };

  var play = null;

  function playOptions() {
    var radial = state.type === 'pie' || state.type === 'donut';
    return {
      type: state.type,
      data: PLAY_DATA[state.type],
      particleColor: radial ? SLICES : undefined,
      particleDensity: state.density,
      particleSize: state.size,
      particleBloom: state.bloom,
      particleJitter: state.jitter,
      particleTrail: state.trail,
      showAxis: state.axis,
      showGrid: state.grid,
      showLegend: state.legend,
      showValues: state.values,
      legendPosition: radial ? 'right' : 'top',
      padAngle: 3
    };
  }

  function buildPlay() {
    if (play) {
      demoCharts.splice(demoCharts.indexOf(play), 1);
      play.destroy();
    }
    play = track(new PC.ParticleChart('#play-chart', playOptions()));
    renderPlayCode();
  }

  /* Type changes rebuild the chart; everything else is a live option swap so
     the particles keep their positions and simply re-tune. */
  function tunePlay() {
    if (!play) return buildPlay();
    play.setOptions(playOptions());
    renderPlayCode();
  }

  function renderPlayCode() {
    var radial = state.type === 'pie' || state.type === 'donut';
    var lines = [
      'const chart = new ParticleChart(\'#chart\', {',
      '  type: \'' + state.type + '\',',
      '  data,',
      '  particleColor: ' + (radial ? '[\'#2ff0d6\', \'#7c4dff\', \'#ffb020\', ...]' : '\'#2ff0d6\'') + ',',
      '  particleDensity: ' + state.density.toFixed(1) + ',',
      '  particleSize: ' + state.size.toFixed(1) + ',',
      '  particleBloom: ' + state.bloom.toFixed(2) + ',',
      '  particleJitter: ' + state.jitter.toFixed(1) + ',',
      '  particleTrail: ' + state.trail.toFixed(2) + ',',
      '  showAxis: ' + state.axis + ',',
      '  showGrid: ' + state.grid + ',',
      '  showLegend: ' + state.legend + ',',
      '  showValues: ' + state.values,
      '});'
    ];
    document.getElementById('play-code').innerHTML = highlight(lines.join('\n'));
  }

  var seg = document.getElementById('type-seg');
  seg.addEventListener('click', function (event) {
    var btn = event.target.closest('button[data-type]');
    if (!btn) return;
    state.type = btn.dataset.type;
    Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', String(b === btn));
    });
    buildPlay();
  });

  [
    ['c-density', 'v-density', 'density', 1],
    ['c-size', 'v-size', 'size', 1],
    ['c-bloom', 'v-bloom', 'bloom', 2],
    ['c-jitter', 'v-jitter', 'jitter', 1],
    ['c-trail', 'v-trail', 'trail', 2]
  ].forEach(function (row) {
    var input = document.getElementById(row[0]);
    var out = document.getElementById(row[1]);
    out.textContent = Number(input.value).toFixed(row[3]);
    input.addEventListener('input', function () {
      state[row[2]] = Number(input.value);
      out.textContent = state[row[2]].toFixed(row[3]);
      tunePlay();
    });
  });

  [['c-axis', 'axis'], ['c-grid', 'grid'], ['c-legend', 'legend'], ['c-values', 'values']].forEach(function (row) {
    var input = document.getElementById(row[0]);
    input.addEventListener('change', function () {
      state[row[1]] = input.checked;
      tunePlay();
    });
  });

  buildPlay();

  // ------------------------------------------------------ code samples ----

  var SAMPLES = {
    html: [
      '<script src="particle-charts.js"><\/script>',
      '',
      '<div id="chart" style="height: 320px"><\/div>',
      '',
      '<script>',
      '  new ParticleCharts.ParticleChart(\'#chart\', {',
      '    type: \'line\',',
      '    data: [12, 19, 15, 27, 24, 33]',
      '  });',
      '<\/script>'
    ].join('\n'),

    options: [
      'new ParticleCharts.ParticleChart(\'#chart\', {',
      '  type: \'bar\',',
      '  data: {',
      '    labels: [\'Q1\', \'Q2\', \'Q3\', \'Q4\'],',
      '    series: [',
      '      { name: \'Revenue\', data: [42, 58, 51, 73] },',
      '      { name: \'Costs\',   data: [30, 33, 36, 41] }',
      '    ]',
      '  },',
      '  particleColor: \'#2ff0d6\',',
      '  particleDensity: 1.4,',
      '  particleBloom: 0.6,',
      '  stacked: false,',
      '  showValues: true',
      '});'
    ].join('\n'),

    esm: [
      '// npm install particle-charts',
      'import { ParticleChart, donut } from \'particle-charts\';',
      '',
      'const chart = new ParticleChart(el, {',
      '  type: \'donut\',',
      '  data: { Direct: 4820, Search: 3140, Social: 1760 },',
      '  innerRadius: 0.62',
      '});',
      '',
      '// or the shorthand',
      'donut(el, { Direct: 4820, Search: 3140 });'
    ].join('\n'),

    update: [
      '// Particles morph to the new shape — nothing is torn down.',
      'chart.update(nextData);',
      '',
      '// Restyle without touching the data.',
      'chart.setOptions({ particleTrail: 0.6, particleBloom: 1 });',
      '',
      '// Snapshot, then clean up.',
      'const png = chart.toDataURL();',
      'chart.destroy();'
    ].join('\n')
  };

  Array.prototype.forEach.call(document.querySelectorAll('pre.code[data-code]'), function (pre) {
    pre.innerHTML = highlight(SAMPLES[pre.dataset.code] || '');
  });

  /* Minimal single-pass highlighter: escape first, then tokenise once so no
     replacement can land inside another's markup. */
  function highlight(code) {
    var escaped = String(code)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    var RE = new RegExp(
      [
        '(\\/\\/[^\\n]*)',
        "('(?:[^'\\\\\\n]|\\\\.)*')",
        '(&lt;\\/?[a-zA-Z][\\w-]*)',
        '\\b(const|let|var|new|import|from|function|return|export|default|async|await|true|false|null)\\b',
        '\\b(\\d+(?:\\.\\d+)?)\\b'
      ].join('|'),
      'g'
    );

    return escaped.replace(RE, function (match, comment, string, tag, keyword, number) {
      if (comment) return '<span class="c">' + comment + '</span>';
      if (string) return '<span class="s">' + string + '</span>';
      if (tag) return '<span class="k">' + tag + '</span>';
      if (keyword) return '<span class="k">' + keyword + '</span>';
      if (number) return '<span class="n">' + number + '</span>';
      return match;
    });
  }

  // ------------------------------------------------------------ scroll ----

  /* Six live canvases all animating through a scroll is what makes a page feel
     sticky. Freeze them while the wheel is moving and resume just after it
     stops — the particles hold their last frame for a moment, which nobody
     notices, and the main thread is left to the scroll. */
  var scrollTimer = null;
  window.addEventListener('scroll', function () {
    if (scrollTimer === null) demoCharts.forEach(function (c) { c.stop(); });
    else clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () {
      scrollTimer = null;
      demoCharts.forEach(function (c) { c.start(); });
    }, 140);
  }, { passive: true });

  // ------------------------------------------------------------ chrome ----

  var pill = document.getElementById('version-pill');
  if (pill && PC.version) pill.textContent = 'v' + PC.version;

  if ('IntersectionObserver' in window) {
    var reveal = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        reveal.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (el) {
      reveal.observe(el);
    });
  } else {
    Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (el) {
      el.classList.add('in');
    });
  }
})();
